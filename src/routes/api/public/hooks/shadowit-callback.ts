import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

// Callback do FastAPI (motor Shadow IT): grava achados de enriquecimento
// (SMB/FTP/HTTP-título/NetBIOS) e atualiza o scan. Mesmo formato/proteção do
// dast-callback.ts (HOOK_SECRET, findings_b64, sanitização de NUL) -- fila e
// tabelas próprias (shadowit_scans/shadowit_findings/shadowit_hosts), processo
// compartilhado com o DAST só pra não duplicar auth/infra -- nunca escreve em
// dast_scans/dast_recon_subdomains (isso é exclusivo de dast-callback.ts).
// Body: { scan_id, status, progress, findings_b64[], shadow_hosts[] }.
type Finding = Record<string, unknown>;
const db = supabaseAdmin as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

const NUL_CHAR = String.fromCharCode(0);
const stripNul = (s: string) => s.split(NUL_CHAR).join("");
const str = (v: unknown) => (v == null ? null : stripNul(String(v)));
function sanitizeDeep(value: unknown): unknown {
  if (typeof value === "string") return stripNul(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeDeep(v)]));
  }
  return value;
}

function decodeFindings(body: { findings_b64?: string[]; findings?: Finding[] }): Finding[] {
  if (Array.isArray(body.findings_b64) && body.findings_b64.length) {
    return body.findings_b64
      .map((b64) => {
        try {
          return JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as Finding;
        } catch {
          return null;
        }
      })
      .filter((f): f is Finding => f !== null);
  }
  return Array.isArray(body.findings) ? body.findings : [];
}

export const Route = createFileRoute("/api/public/hooks/shadowit-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            scan_id?: string;
            status?: string;
            progress?: number;
            findings_b64?: string[];
            findings?: Finding[];
            shadow_hosts?: Array<{ ip?: string; hostname?: string; source?: string }>;
          };
          const scanId = body.scan_id;
          const findings = decodeFindings(body);
          console.log(
            `[shadowit-callback] recebido: scan=${scanId} status=${body.status} findings=${findings.length} shadow_hosts=${body.shadow_hosts?.length ?? "undefined"}`,
          );
          if (!scanId)
            return new Response(JSON.stringify({ ok: false, error: "scan_id obrigatório" }), { status: 400 });

          const insertErrors: string[] = [];

          if (findings.length) {
            const rows = findings.map((f) => ({
              scan_id: scanId,
              ip: str(f.ip),
              kind: str(f.kind),
              name: str(f.name) ?? "Achado",
              value: str(f.value),
              permission: str(f.permission),
              classification: str(f.classification),
              raw_output: sanitizeDeep(f.raw_output ?? f),
            }));
            for (let i = 0; i < rows.length; i += 500) {
              const batch = rows.slice(i, i + 500);
              const { error } = await db.rpc("upsert_shadowit_finding", { p_rows: batch });
              if (error) {
                console.error(
                  `[shadowit-callback] falha ao gravar achados (scan=${scanId}, lote ${i}-${i + batch.length}):`,
                  error,
                );
                insertErrors.push(`findings[${i}]: ${error.message}`);
              }
            }
          }

          if (Array.isArray(body.shadow_hosts) && body.shadow_hosts.length) {
            // Descoberta de rede disparada pelo próprio Shadow IT (ver
            // /shadowit/discover no scanner) -- mesma tabela/RPC que
            // dast-callback.ts usa pro host sem hostname, só que aqui é o
            // caminho normal (nunca passa por dast_scans).
            const rows = body.shadow_hosts
              .filter((h) => h.ip)
              .map((h) => ({ ip: str(h.ip), hostname: str(h.hostname), source: h.source ?? "nmap", scan_id: scanId }));
            if (rows.length) {
              const { error } = await db.rpc("upsert_shadowit_hosts", { p_rows: rows });
              if (error) {
                console.error(`[shadowit-callback] falha ao gravar hosts (scan=${scanId}):`, error);
                insertErrors.push(`shadow_hosts: ${error.message}`);
              }
            }
          }

          const status = body.status ?? "running";
          const patch: Record<string, unknown> = { status, progress: body.progress ?? undefined };
          if (status === "done" || status === "error" || status === "cancelled") {
            patch.finished_at = new Date().toISOString();
          }
          if (insertErrors.length) {
            console.error(
              `[shadowit-callback] scan ${scanId} teve ${insertErrors.length} erro(s) de insert:`,
              insertErrors,
            );
            patch.error = insertErrors.join(" | ").slice(0, 2000);
          }
          await db.from("shadowit_scans").update(patch).eq("id", scanId);

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
