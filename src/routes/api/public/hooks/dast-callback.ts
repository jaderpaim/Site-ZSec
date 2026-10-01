import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { decryptCallbackPayload } from "@/lib/crypto.server";

// Callback do FastAPI (motor DAST): grava findings/subdomínios/hosts Shadow IT e
// atualiza o scan. Protegido por HOOK_SECRET. O scan roda assíncrono na infra e
// chama isto ao progredir/terminar.
// Body: { scan_id, status, progress, findings_enc[], subdomains[], shadow_hosts[] }.
type Finding = Record<string, unknown>;
const db = supabaseAdmin as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

// Postgres rejeita byte NUL em qualquer coluna text/jsonb (erro 22P05, "unsupported Unicode
// escape sequence"), sem exceção. Achados de scan ativo às vezes
// capturam corpo de resposta binário/mal-decodificado (confirmado num achado
// do b-security) que carrega esse byte -- sem sanitizar, o insert do lote
// inteiro falhava e nenhum achado era gravado, mesmo os outros 49 válidos.
const NUL_CHAR = String.fromCharCode(0);
const stripNul = (s: string) => s.split(NUL_CHAR).join("");
const str = (v: unknown) => (v == null ? null : stripNul(String(v)));
// Amass grava subdomínio com esquema ("https://sub.dominio.com"); o pull da
// zona Cloudflare grava puro (r.name da API). Sem normalizar aqui, a coluna
// subdomain fica com dois formatos diferentes pro mesmo host real -- mesmo
// já deduplicando por trás (subdomain_norm ignora esquema), o valor exibido
// ficava inconsistente. Normaliza na escrita pra nunca gravar com esquema.
const stripScheme = (s: string) => s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
function sanitizeDeep(value: unknown): unknown {
  if (typeof value === "string") return stripNul(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeDeep(v)]));
  }
  return value;
}

// Achados de scan ativo carregam payload de ataque real (XSS/SQLi de teste,
// às vezes até o dump da própria página de bloqueio do WAF de destino) --
// mandar isso como JSON legível pro domínio protegido pela Cloudflare faz o
// WAF barrar a própria chamada de callback (confirmado: achado "sujo" -> 403
// do Managed Ruleset, regra "XSS, HTML Injection - Script Tag", scan preso
// em "running" pra sempre; achado "limpo" de outro alvo -> insere normal,
// mesmo endpoint/código). Base64 sozinho não bastava -- o WAF decodifica
// transformação conhecida antes de casar assinatura. O FastAPI agora cifra
// cada achado de verdade (AES-256-GCM, ver encrypt_finding()/send_callback()
// no scanner e decryptCallbackPayload em crypto.server.ts) -- saída é ruído,
// sem assinatura pra casar mesmo após qualquer normalização automática.
function decodeFindings(body: { findings_enc?: string[]; findings_b64?: string[]; findings?: Finding[] }): Finding[] {
  if (Array.isArray(body.findings_enc) && body.findings_enc.length) {
    let decryptErrors = 0;
    let lastError: string | null = null;
    const decoded = body.findings_enc
      .map((enc) => {
        try {
          return JSON.parse(decryptCallbackPayload(enc)) as Finding;
        } catch (e) {
          decryptErrors++;
          lastError = (e as Error).message;
          return null;
        }
      })
      .filter((f): f is Finding => f !== null);
    if (decryptErrors > 0) {
      // TEMPORARIO -- decodeFindings engolia o erro sem logar nada; sem isso
      // não dava pra saber se a chave (SHA-256 de HOOK_SECRET) diverge entre
      // scanner e app, se o formato "iv:tag:ciphertext" veio errado, ou outra
      // causa. Remover depois de confirmar que os achados voltam a gravar.
      console.error(
        `[dast-callback] falha ao decifrar ${decryptErrors}/${body.findings_enc.length} achado(s) -- último erro: ${lastError}`,
      );
    }
    return decoded;
  }
  // compat com jobs em voo no momento do deploy (mandados com base64 antigo,
  // antes da troca pra cifra de verdade) -- remover depois que não houver
  // mais scan em execução usando o main.py anterior.
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
  // compat com chamadas manuais/scripts antigos que ainda mandam findings cru
  return Array.isArray(body.findings) ? body.findings : [];
}

export const Route = createFileRoute("/api/public/hooks/dast-callback")({
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
            findings_enc?: string[];
            findings_b64?: string[];
            findings?: Finding[];
            subdomains?: Array<{ subdomain?: string; ip?: string; scope?: string; source?: string }>;
            shadow_hosts?: Array<{ ip?: string; hostname?: string; source?: string }>;
            candidate_fqdns?: string[];
            auth_status?: string;
            error?: string;
            out_of_scope_hosts?: Array<{ host?: string; request_count?: number; sample_urls?: string[] }>;
          };
          const scanId = body.scan_id;
          const findings = decodeFindings(body);
          console.log(
            `[dast-callback] recebido: scan=${scanId} status=${body.status} findings=${findings.length} subdomains=${body.subdomains?.length ?? "undefined"} shadow_hosts=${body.shadow_hosts?.length ?? "undefined"} candidate_fqdns=${body.candidate_fqdns?.length ?? "undefined"}`,
          );
          if (!scanId)
            return new Response(JSON.stringify({ ok: false, error: "scan_id obrigatório" }), { status: 400 });

          // insert() do supabase-js NAO lanca excecao em erro -- devolve
          // {data, error}. Sem checar isso, um insert que falha (constraint,
          // tipo de coluna etc.) passava em branco: nenhum log, e o scan
          // ainda virava "done" com 0 achados gravados, sem pista nenhuma
          // do motivo (confirmado: 45 achados computados no FastAPI, 0
          // aparecendo no app, callback respondendo 200 "ok" mesmo assim).
          const insertErrors: string[] = [];

          if (findings.length) {
            const rows = findings.map((f) => {
              const raw = f.raw_output as Record<string, unknown> | undefined;
              return {
                scan_id: scanId,
                name: str(f.name) ?? "Achado",
                severity: str(f.severity),
                owasp_category: str(f.owasp_category),
                cvss_score: num(f.cvss_score),
                cve_id: str(f.cve_id),
                engine: str(f.engine),
                confidence: str(f.confidence),
                matched_url: str(f.matched_url),
                http_method: str(f.http_method),
                param: str(f.param),
                attack_payload: str(f.attack_payload),
                evidence: str(f.evidence),
                description: str(f.description),
                business_impact: str(f.business_impact),
                remediation: str(f.remediation),
                reference: str(f.reference),
                raw_output: sanitizeDeep(f.raw_output ?? f),
                // Distingue sub-extrações do mesmo template Nuclei (ex.:
                // "RDAP WHOIS" reporta registrationDate/lastChangeDate/
                // registrantName etc. como achados separados, todos com o
                // mesmo engine+name+matched_url+param) -- sem isso a dedup
                // colapsava tudo numa linha só. alertRef cobre o caso
                // equivalente no ZAP (variantes de uma mesma regra
                // compartilhando alert+risk). Nulo pra nmap/nikto, sem esse
                // conceito, onde não muda o comportamento.
                sub_key: str(raw?.["extractor-name"] ?? raw?.["matcher-name"] ?? raw?.["alertRef"]),
              };
            });
            // upsert_dast_vulnerability (RPC) dedupe por (engine, name,
            // matched_url, param) -- um scan repetido que reencontra o
            // mesmo achado aberto atualiza a linha existente (found_at,
            // occurrence_count) em vez de duplicar; se o achado tinha sido
            // marcado resolvido/falso-positivo e reaparece, reabre sozinho.
            for (let i = 0; i < rows.length; i += 500) {
              const batch = rows.slice(i, i + 500);
              const { error } = await db.rpc("upsert_dast_vulnerability", { p_rows: batch });
              if (error) {
                console.error(
                  `[dast-callback] falha ao gravar vulnerabilidades (scan=${scanId}, lote ${i}-${i + batch.length}):`,
                  error,
                );
                insertErrors.push(`vulnerabilities[${i}]: ${error.message}`);
              } else {
                console.log(
                  `[dast-callback] gravadas/atualizadas ${batch.length} vulnerabilidades (scan=${scanId}, lote ${i})`,
                );
              }
            }
          }

          if (Array.isArray(body.subdomains) && body.subdomains.length) {
            const rows = body.subdomains
              .filter((s) => s.subdomain)
              .map((s) => ({
                scan_id: scanId,
                subdomain: stripScheme(String(s.subdomain)),
                ip: s.ip ?? null,
                scope: s.scope === "internal" ? "internal" : "external",
                source: s.source ?? null,
              }));
            if (rows.length) {
              // upsert_dast_recon_subdomains dedupe por (subdomain, scope) --
              // reencontrar o mesmo ativo (Amass de novo, ou o pull da zona
              // Cloudflare achando o que o Amass já tinha achado) atualiza a
              // linha existente em vez de duplicar em "Ativos Descobertos".
              const { error } = await db.rpc("upsert_dast_recon_subdomains", { p_rows: rows });
              if (error) {
                console.error(`[dast-callback] falha ao gravar subdomínios (scan=${scanId}):`, error);
                insertErrors.push(`subdomains: ${error.message}`);
              }
            }
          }

          if (Array.isArray(body.shadow_hosts) && body.shadow_hosts.length) {
            // Toda descoberta de host interno (com ou sem hostname resolvido em DNS)
            // vai pro Shadow IT, não pra dast_recon_subdomains -- Ativos Descobertos do
            // DAST fica exclusivamente com descoberta externa (Amass/Cloudflare).
            // FQDN, quando existe, é preservado em shadowit_hosts.hostname.
            const rows = body.shadow_hosts
              .filter((h) => h.ip)
              .map((h) => ({ ip: str(h.ip), hostname: str(h.hostname), source: h.source ?? "nmap", scan_id: scanId }));
            if (rows.length) {
              const { error } = await db.rpc("upsert_shadowit_hosts", { p_rows: rows });
              if (error) {
                console.error(`[dast-callback] falha ao gravar hosts Shadow IT (scan=${scanId}):`, error);
                insertErrors.push(`shadow_hosts: ${error.message}`);
              }
            }
          }

          if (Array.isArray(body.out_of_scope_hosts) && body.out_of_scope_hosts.length) {
            // Hosts de terceiro (analytics/tracking/CDN) que o spider achou
            // mas não seguiu -- puramente informativo/reconhecimento, nunca
            // vira dast_vulnerabilities. Tabela dedicada (não upsert com
            // dedupe por enquanto -- cada scan grava sua própria leitura;
            // dá pra agregar entre scans depois via query, sem precisar de
            // upsert agora).
            const rows = body.out_of_scope_hosts
              .filter((h) => h.host)
              .map((h) => ({
                scan_id: scanId,
                host: str(h.host),
                request_count: num(h.request_count) ?? 0,
                sample_urls: Array.isArray(h.sample_urls) ? h.sample_urls.map((u) => str(u)) : null,
              }));
            if (rows.length) {
              const { error } = await db.from("dast_scan_out_of_scope_hosts").insert(rows);
              if (error) {
                console.error(`[dast-callback] falha ao gravar out_of_scope_hosts (scan=${scanId}):`, error);
                insertErrors.push(`out_of_scope_hosts: ${error.message}`);
              }
            }
          }

          const status = body.status ?? "running";
          const patch: Record<string, unknown> = { status, progress: body.progress ?? undefined };
          if (status === "done" || status === "error" || status === "cancelled") {
            patch.finished_at = new Date().toISOString();
          }
          if (body.candidate_fqdns) {
            // Descoberta de aplicação interna (LDAP) -- ainda não é Ativo
            // Descoberto, só candidata. Guarda no config do próprio scan pra
            // usuário revisar/escolher na etapa de confirmação (ver
            // confirmInternalApps em dast.functions.ts); não grava em
            // dast_recon_subdomains direto, diferente de subdomains/shadow_hosts.
            patch.config = { candidate_fqdns: body.candidate_fqdns };
          }
          if (body.auth_status === "authenticated" || body.auth_status === "failed") {
            // Coluna dedicada (não config) -- fica visível na tela do scan
            // sem precisar entrar no journalctl da VM pra saber se o login
            // configurado (ZAP Browser-Based Authentication) realmente
            // aplicou ou se caiu pro modo anônimo silenciosamente.
            patch.auth_status = body.auth_status;
          }
          // body.error vem do FastAPI quando algum engine falhou/travou no
          // meio do scan (ver engine_errors em run_scan_job no main.py) --
          // antes disso um scan interrompido no meio (ex.: active scan
          // parado pela stall-detection) virava "done" idêntico a um scan
          // 100% completo, sem sinal nenhum pro usuário. Combina com
          // insertErrors (falha de gravação no banco, causa diferente) na
          // mesma coluna -- a UI já mostra o ícone de alerta com esse texto
          // no tooltip pra qualquer um dos dois casos.
          const allErrors = [...(body.error ? [body.error] : []), ...insertErrors];
          if (allErrors.length) {
            console.error(`[dast-callback] scan ${scanId} teve ${allErrors.length} erro(s):`, allErrors);
            patch.error = allErrors.join(" | ").slice(0, 2000);
          }
          // update() do supabase-js não lança exceção em erro -- sem checar,
          // uma falha aqui (constraint, tipo de coluna etc.) passava em
          // branco: o callback ainda respondia {ok:true} mesmo com o scan
          // nunca de fato atualizado no banco.
          // .neq("status", "cancelled") -- trava contra callback atrasado
          // (ex.: scanner ainda processando um "running"/"done" que já
          // estava em voo quando o usuário cancelou) reviver um scan que o
          // usuário já cancelou manualmente. O scanner também tenta parar o
          // job de verdade (ver /scan/cancel no main.py), mas essa trava
          // aqui é a garantia final do lado do app.
          const { error: patchError } = await db
            .from("dast_scans")
            .update(patch)
            .eq("id", scanId)
            .neq("status", "cancelled");
          if (patchError) {
            console.error(`[dast-callback] falha ao atualizar dast_scans (scan=${scanId}):`, patchError);
          }

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
