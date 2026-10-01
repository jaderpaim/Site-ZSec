import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { assertDastAccess, getDastCreds, scannerFetch } from "@/lib/dast.server";
import { isPrivateCidr } from "@/lib/dast.functions";
import { getShadowItSmbCreds, saveShadowItSmbCreds, getCmdbKnownIps } from "@/lib/shadowit.server";
import { logAudit } from "@/lib/audit-log.functions";

// Módulo Shadow IT: todo host descoberto na rede interna (ping sweep, com ou
// sem hostname resolvido) mais os achados de enriquecimento (SMB/FTP/HTTP-
// título/NetBIOS) contra eles. Fila, endpoints (/shadowit/scan,
// /shadowit/discover) e tabela de status (shadowit_scans) próprios -- nunca
// toca dast_scans/dast_recon_subdomains, mesmo rodando no mesmo FastAPI e
// reaproveitando is_dast_allowed() como controle de acesso (mesmo time audita
// os dois módulos hoje) e as mesmas credenciais/infra de chamada
// (getDastCreds/scannerFetch).
type AnyDb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};
const db = (sb: unknown) => sb as unknown as AnyDb;

export const getShadowItAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ allowed: boolean }> => {
    try {
      await assertDastAccess(context.supabase, context.userId);
      return { allowed: true };
    } catch {
      return { allowed: false };
    }
  });

// ── Hosts (sem hostname resolvido -- ver dast-callback.ts / shadow_hosts) ────
export const listShadowItHosts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data } = await db(context.supabase)
      .from("shadowit_hosts")
      .select("id, ip, hostname, mac, source, first_seen_at, last_seen_at")
      .order("last_seen_at", { ascending: false });
    // Cruza com o CMDB pra distinguir "sem DNS mas já documentado" de
    // "sem DNS e sem CMDB" (esse sim é o shadow IT de verdade).
    const cmdbIps = await getCmdbKnownIps();
    const hosts = (data ?? []).map((h: any) => ({ ...h, in_cmdb: cmdbIps.has(h.ip) }));
    return { hosts };
  });

// ── Achados de enriquecimento (SMB/FTP/HTTP-título/NetBIOS) ──────────────────
export const listShadowItFindings = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data } = await db(context.supabase)
      .from("shadowit_findings")
      .select(
        "id, scan_id, ip, kind, name, value, permission, classification, status, found_at, first_seen_at, occurrence_count, reopened_at, raw_output",
      )
      .order("found_at", { ascending: false });
    return { findings: (data ?? []) as any[] };
  });

// ── Histórico de varredura de enriquecimento ─────────────────────────────────
export const listShadowItScans = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data } = await db(context.supabase)
      .from("shadowit_scans")
      .select("id, name, targets, status, progress, error, created_at, started_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return { scans: (data ?? []) as any[] };
  });

// ── Credencial de domínio (SMB) ───────────────────────────────────────────────
// Guardada cifrada (AES-256-GCM, ver crypto.server.ts) em `integrations`
// (provider=shadowit_smb) -- decisão de elevar essa acima do texto-plano+RLS
// que Cloudflare/DAST já usam, por ser uma identidade de domínio real (AD),
// categoria de risco maior que um token escopado a um serviço.
const SaveSmbCredsSchema = z.object({
  username: z.string().min(1).max(200), // formato DOMINIO\usuario
  password: z.string().min(1).max(500),
});

export const saveShadowItSmbCredential = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => SaveSmbCredsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    await saveShadowItSmbCreds(data.username, data.password);
    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "save_smb_credential",
      descricao: `Atualizou a credencial SMB do Shadow IT (usuário: ${data.username})`,
      status: "success",
      detalhes: { username: data.username },
    });
    return { ok: true };
  });

// Nunca devolve a senha -- só se está configurada e com qual usuário, pra UI
// mostrar "credencial configurada como X" sem expor o segredo de volta ao browser.
export const getShadowItSmbCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const creds = await getShadowItSmbCreds();
    return { configured: !!creds, username: creds?.username ?? null };
  });

// ── Descoberta de rede (ping sweep) disparada pelo próprio Shadow IT ────────
// Reaproveita run_network_discovery() no scanner (mesmo ping sweep que o
// DAST usa pra "Descoberta interna"), mas por um endpoint/fila/tabela de
// status própria (/shadowit/discover, shadowit_scans) -- não cria linha em
// dast_scans, então não aparece nos painéis do DAST. Resultado (com ou sem
// hostname) sempre cai em shadowit_hosts via shadowit-callback.ts.
const DiscoverSchema = z.object({ subnet: z.string().max(64) });

export const startShadowItDiscovery = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => DiscoverSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const subnet = data.subnet.trim();
    if (!isPrivateCidr(subnet)) throw new Error(`Subnet inválida ou não privada: "${subnet}" (use algo como 192.168.1.0/24)`);
    const sb = db(context.supabase);

    const { data: inserted, error } = await sb
      .from("shadowit_scans")
      .insert({
        name: `Descoberta de rede — ${subnet}`,
        targets: [subnet],
        status: "queued",
        started_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "start_discovery",
      descricao: `Iniciou descoberta de rede Shadow IT em ${subnet}`,
      status: "success",
      detalhes: { scanId, subnet },
    });

    const creds = await getDastCreds();
    if (!creds) {
      await sb
        .from("shadowit_scans")
        .update({ status: "error", error: "Scanner não configurado em Integrações." })
        .eq("id", scanId);
      throw new Error("Scanner não configurado (Integrações). Descoberta registrada, mas não disparada.");
    }
    try {
      await scannerFetch(creds, "/shadowit/discover", { scan_id: scanId, subnet });
      await sb.from("shadowit_scans").update({ status: "running", started_at: new Date().toISOString() }).eq("id", scanId);
    } catch (e) {
      await sb
        .from("shadowit_scans")
        .update({ status: "error", error: (e as Error).message })
        .eq("id", scanId);
      throw new Error(`Descoberta registrada, mas o motor não respondeu: ${(e as Error).message}`);
    }

    return { ok: true, scanId };
  });

// ── Disparar varredura de enriquecimento ─────────────────────────────────────
// Sem `ips` explícito, roda contra todo host já catalogado em shadowit_hosts
// (equivalente ao "Verificar" do Advanced IP Scanner, mas em lote).
const StartSchema = z.object({
  ips: z.array(z.string()).max(1024).optional(),
});

export const startShadowItScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => StartSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);

    let targets = data.ips;
    if (!targets?.length) {
      const { data: hosts } = await sb.from("shadowit_hosts").select("ip");
      targets = [...new Set<string>((hosts ?? []).map((h: any) => h.ip as string))];
    }
    if (!targets.length) throw new Error("Nenhum host catalogado ainda — rode uma descoberta de rede primeiro.");

    const { data: inserted, error } = await sb
      .from("shadowit_scans")
      .insert({
        name: `Varredura Shadow IT (${targets.length} host${targets.length > 1 ? "s" : ""})`,
        targets,
        status: "queued",
        started_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "start_scan",
      descricao: `Iniciou varredura Shadow IT em ${targets.length} host(s)`,
      status: "success",
      detalhes: { scanId, targets },
    });

    const creds = await getDastCreds();
    if (!creds) {
      await sb
        .from("shadowit_scans")
        .update({ status: "error", error: "Scanner não configurado em Integrações." })
        .eq("id", scanId);
      throw new Error("Scanner não configurado (Integrações). Varredura registrada, mas não disparada.");
    }
    try {
      // Credencial de domínio (se já cadastrada em Integrações) vai por
      // request, não fica salva na VM do scanner -- decifrada aqui, mandada
      // por HTTPS junto do job, nunca persistida do lado de lá.
      const smbCreds = await getShadowItSmbCreds();
      await scannerFetch(creds, "/shadowit/scan", {
        scan_id: scanId,
        targets,
        ...(smbCreds ? { smb_user: smbCreds.username, smb_pass: smbCreds.password } : {}),
      });
      await sb.from("shadowit_scans").update({ status: "running", started_at: new Date().toISOString() }).eq("id", scanId);
    } catch (e) {
      await sb
        .from("shadowit_scans")
        .update({ status: "error", error: (e as Error).message })
        .eq("id", scanId);
      throw new Error(`Varredura registrada, mas o motor não respondeu: ${(e as Error).message}`);
    }

    return { ok: true, scanId };
  });

export const cancelShadowItScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    await db(context.supabase)
      .from("shadowit_scans")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.scanId)
      .in("status", ["queued", "running"]);
    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "cancel_scan",
      descricao: `Cancelou a varredura Shadow IT ${data.scanId}`,
      status: "success",
      detalhes: { scanId: data.scanId },
    });
    return { ok: true };
  });

export const deleteShadowItScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const { data: scan } = await sb.from("shadowit_scans").select("id, name, status").eq("id", data.scanId).maybeSingle();
    if (!scan) throw new Error("Varredura não encontrada");
    if (scan.status === "queued" || scan.status === "running") {
      throw new Error("Cancele a varredura antes de excluir — ela ainda está em andamento.");
    }
    // shadowit_findings não tem FK/cascade pra scan_id de propósito -- achado
    // é por host, sobrevive à exclusão do histórico de varredura que o gerou
    // (mesma filosofia de dast_vulnerabilities x dast_scans).
    const { error } = await sb.from("shadowit_scans").delete().eq("id", data.scanId);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "delete_scan",
      descricao: `Excluiu a varredura Shadow IT "${scan.name ?? data.scanId}"`,
      status: "success",
      detalhes: { scanId: data.scanId },
    });
    return { ok: true };
  });

// ── Triagem de achado (mesmos status de dast_vulnerabilities) ────────────────
export const setShadowItFindingStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        findingId: z.string().uuid(),
        status: z.enum(["open", "resolved", "false_positive"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { error } = await db(context.supabase)
      .from("shadowit_findings")
      .update({ status: data.status })
      .eq("id", data.findingId);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "shadow-it",
      acao: "set_finding_status",
      descricao: `Alterou status do achado Shadow IT ${data.findingId} para "${data.status}"`,
      status: "success",
      detalhes: { findingId: data.findingId, status: data.status },
    });
    return { ok: true };
  });
