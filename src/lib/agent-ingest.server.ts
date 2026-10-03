// Server-only: ingestão do agente Z-Sec (Windows/macOS) — /api/public/hooks/agent-ingest.
// NUNCA importar em código de cliente. O código do agente está em agent/.
//
// O agente manda, a cada ~5 min, baldes de uso por hora (ferramenta + app +
// hora cheia) e, 1x/dia, os apps de IA instalados. Cada balde vira uma linha
// em ia_web_events (source = 'agent'), que o Ranking de IA já soma com o Sophos.
//
// Autenticação: chave de ingestão AGENT_INGEST_KEY (env), comparada por hash
// em tempo constante. Ela vai em todas as máquinas, então SÓ serve pra enviar
// uso — não lê nada. Aceita 2 chaves separadas por vírgula (atual,anterior)
// pra rotacionar sem derrubar o parque.
//
// Usuário: o ranking cruza user_name com a parte local do e-mail em
// colaboradores (jader.paim). O agente manda candidatos (UPN/e-mail corporativo
// e usuário do SO) e aqui escolhemos o que casa com colaboradores — inclusive
// o caso do Mac com conta local "jaderpaim" (sem o ponto).
import crypto from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cleanUserName } from "@/lib/ia.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas/colunas novas ainda fora dos tipos gerados
const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

const PROVIDER = "zsec-agent";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BUCKET_AGE_MS = 15 * 24 * 60 * 60 * 1000;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logIngest(
  status: "success" | "error",
  httpStatus: number,
  message: string,
  ms: number,
) {
  try {
    await adminDb.from("api_logs").insert({
      provider: PROVIDER,
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* log não derruba a ingestão */
  }
}

function sha256(v: string): Buffer {
  return crypto.createHash("sha256").update(v, "utf8").digest();
}

function checkKey(request: Request): boolean {
  const configured = (process.env.AGENT_INGEST_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!presented || configured.length === 0) return false;
  const h = sha256(presented);
  let ok = false;
  for (const k of configured) {
    if (crypto.timingSafeEqual(sha256(k), h)) ok = true;
  }
  return ok;
}

const short = (max: number) => z.string().trim().max(max);

const PayloadSchema = z.object({
  agent_version: short(32),
  device: z.object({
    id: short(100).min(1),
    hostname: short(255).optional().default(""),
    os: short(32).optional().default(""),
    os_version: short(100).optional().default(""),
    arch: short(16).optional().default(""),
  }),
  user: z.object({
    os_user: short(128).optional().default(""),
    domain: short(128).optional(),
    identities: z.array(short(255)).max(10).optional().default([]),
  }),
  user_override: short(128).optional(),
  usage: z
    .array(
      z.object({
        id: z.string().regex(/^agent-[0-9a-f]{24}$/),
        tool: short(60).min(1),
        app: short(100),
        process: short(255).optional().default(""),
        bucket_start: z.string().datetime({ offset: true }),
        first_seen: z.string().datetime({ offset: true }),
        last_seen: z.string().datetime({ offset: true }),
        duration_s: z.number().min(0).max(3700),
        // Sinais separados (agente >= 0.2): foco e rede. Opcionais pra aceitar 0.1.
        foreground_s: z.number().min(0).max(3700).optional(),
        network_s: z.number().min(0).max(3700).optional(),
      }),
    )
    .max(500),
  ai_apps: z
    .array(
      z.object({
        name: short(255),
        bundle_id: short(255).optional(),
        version: short(64).optional(),
        source: short(32),
      }),
    )
    .max(200)
    .optional(),
  inventory_at: z.string().datetime({ offset: true }).optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

const USER_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function localPart(v: string): string {
  return v.toLowerCase().split("@")[0].trim();
}

// Escolhe o user_name gravado no ranking. Ordem: override do config →
// identidades corporativas (UPN/e-mail) → usuário do SO. O primeiro que casar
// com colaboradores vence; se nenhum casar, tenta o usuário do SO sem pontos
// (Mac "jaderpaim" ↔ jader.paim@...) e por fim grava o melhor candidato mesmo
// sem casar (aparece no ranking como "sem departamento", igual ao Sophos).
// Cada máquina manda a cada ~5 min sempre a mesma identidade: guarda a
// resolução por 1h pra não consultar colaboradores em todo envio.
const USER_CACHE_TTL_MS = 60 * 60 * 1000;
const userCache = new Map<string, { name: string | null; resolved: boolean; at: number }>();

async function resolveUser(p: Payload): Promise<{ name: string | null; resolved: boolean }> {
  const cacheKey = JSON.stringify([p.user_override ?? "", p.user.identities, p.user.os_user]);
  const hit = userCache.get(cacheKey);
  if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) return hit;
  const result = await resolveUserUncached(p);
  if (userCache.size > 5000) userCache.clear();
  userCache.set(cacheKey, { ...result, at: Date.now() });
  return result;
}

async function resolveUserUncached(
  p: Payload,
): Promise<{ name: string | null; resolved: boolean }> {
  const candidates: string[] = [];
  const push = (v: string | null | undefined) => {
    const n = v ? localPart(cleanUserName(v) ?? "") : "";
    if (n && USER_RE.test(n) && !candidates.includes(n)) candidates.push(n);
  };
  push(p.user_override);
  p.user.identities.forEach(push);
  push(p.user.os_user);
  if (candidates.length === 0) return { name: null, resolved: false };

  const { data: exact } = await adminDb
    .from("colaboradores")
    .select("email")
    .or(candidates.map((c) => `email.ilike."${c}@%"`).join(","))
    .limit(20);
  const known = new Set(
    ((exact ?? []) as Array<{ email: string | null }>).map((r) => localPart(r.email ?? "")),
  );
  for (const c of candidates) {
    if (known.has(c)) return { name: c, resolved: true };
  }

  // Conta local sem ponto: procura colaborador cujo e-mail, sem pontos na
  // parte local, seja igual. Só aceita match único.
  const osUser = localPart(cleanUserName(p.user.os_user) ?? "");
  if (osUser && !osUser.includes(".") && USER_RE.test(osUser)) {
    const pattern = osUser.split("").join("%");
    const { data: fuzzy } = await adminDb
      .from("colaboradores")
      .select("email")
      .ilike("email", `${pattern}@%`)
      .limit(20);
    const hits = new Set(
      ((fuzzy ?? []) as Array<{ email: string | null }>)
        .map((r) => localPart(r.email ?? ""))
        .filter((lp) => lp.replace(/\./g, "") === osUser),
    );
    if (hits.size === 1) return { name: [...hits][0], resolved: true };
  }

  return { name: candidates[0], resolved: false };
}

export async function handleAgentIngest(request: Request): Promise<Response> {
  const t0 = Date.now();
  if (!checkKey(request)) return json(401, { ok: false, error: "Chave de ingestão inválida." });

  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return json(413, { ok: false, error: "Payload muito grande." });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "Payload muito grande." });

  let payload: Payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(text));
  } catch (e) {
    await logIngest("error", 400, `payload inválido: ${(e as Error).message}`, Date.now() - t0);
    return json(400, { ok: false, error: "Payload inválido." });
  }

  try {
    const now = Date.now();
    const { name: userName, resolved } = await resolveUser(payload);
    const dev = payload.device;

    const rows = payload.usage
      .filter((u) => {
        const t = Date.parse(u.bucket_start);
        return t > now - MAX_BUCKET_AGE_MS && t < now + 60 * 60 * 1000;
      })
      .map((u) => ({
        id: u.id,
        tenant_id: PROVIDER,
        event_at: u.first_seen,
        user_name: userName,
        endpoint_name: dev.hostname || null,
        domain: u.tool,
        raw_event: `${u.app} · ${Math.max(1, Math.round(u.duration_s / 60))} min (agente)`,
        source_event_id: u.id,
        source: "agent",
        app_name: u.app,
        process_name: u.process || null,
        duration_s: Math.round(u.duration_s),
        foreground_s: u.foreground_s == null ? null : Math.round(u.foreground_s),
        network_s: u.network_s == null ? null : Math.round(u.network_s),
        device_id: dev.id,
      }));

    if (rows.length > 0) {
      const { error } = await adminDb.from("ia_web_events").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`upsert ia_web_events: ${error.message}`);
    }

    const deviceRow: Record<string, unknown> = {
      id: dev.id,
      hostname: dev.hostname || null,
      os: dev.os || null,
      os_version: dev.os_version || null,
      arch: dev.arch || null,
      agent_version: payload.agent_version,
      last_user: userName,
      last_os_user: payload.user.os_user || null,
      user_resolved: resolved,
      last_seen_at: new Date(now).toISOString(),
    };
    if (payload.inventory_at && payload.ai_apps) {
      deviceRow.ai_apps = payload.ai_apps;
      deviceRow.ai_apps_at = payload.inventory_at;
    }
    const { error: devErr } = await adminDb
      .from("agent_devices")
      .upsert(deviceRow, { onConflict: "id" });
    if (devErr) throw new Error(`upsert agent_devices: ${devErr.message}`);

    if (rows.length > 0 || payload.inventory_at) {
      await logIngest(
        "success",
        200,
        `${dev.hostname} (${userName ?? "?"}${resolved ? "" : ", não casou com colaboradores"}): ${rows.length} baldes`,
        Date.now() - t0,
      );
    }
    return json(200, { ok: true, accepted: rows.length, user: userName, user_resolved: resolved });
  } catch (e) {
    await logIngest("error", 500, (e as Error).message, Date.now() - t0);
    return json(500, { ok: false, error: "Erro interno no Z-Sec." });
  }
}
