// Server-only. Proteção do DNS da Cloudflare contra exclusão em massa:
//   - alertas (Teams + e-mail) no mesmo pipeline dos alertas de DNS/regras;
//   - limite de volume por usuário (cloudflare_rate_events);
//   - backup diário de todos os registros de cada zona (tabela + BIND no Storage);
//   - monitor do log de auditoria da conta (exclusão e criação fora do fluxo,
//     criação sensível, volume, host crítico alterado, proxy desligado,
//     token/membro novo, falhas);
//   - execução da exclusão aprovada e da restauração a partir de um backup.
// Tabelas novas não estão nos tipos gerados do Supabase: usa um client sem
// tipagem (service role) só aqui dentro.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import { buildRuleAlertHtml } from "./email-templates.defaults";
import { isAlertModuleEnabled } from "./alert-modules.functions";
import { getGlobalAdminEmails } from "./cloudflare.server";
import { APP_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/mailer.server";
import { readSecret } from "@/lib/crypto.server";
import { postTeamsWebhook } from "@/lib/teams-webhook";

const CF_API = "https://api.cloudflare.com/client/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guardDb(): any {
  return supabaseAdmin;
}

function appLink() {
  return `${appUrl()}/app/cloudflare-waf`;
}

export async function getCfToken(): Promise<string> {
  const { data } = await guardDb()
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!data?.enabled || !data?.api_key)
    throw new Error("Integração Cloudflare não está ativa ou sem token configurado.");
  return readSecret(data.api_key) as string;
}

export async function cf(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* texto puro (export BIND) */
  }
  const ok = res.ok && (json ? json.success !== false : true);
  const error = ok ? null : (json?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return { ok, status: res.status, json, text, error };
}

// ─── Alertas (Teams + e-mail p/ admins globais) ─────────────────────────────
export type GuardAlertKey = "cloudflare_dns_delete_request" | "cloudflare_audit_alert";

export async function sendGuardAlert(args: {
  key: GuardAlertKey;
  severity: "critical" | "warning" | "info";
  title: string;
  zoneName: string;
  category: string;
  description: string;
  facts: Array<{ name: string; value: string }>;
  actor?: string | null;
  actorLabel?: string;
  vars?: Record<string, string>;
}): Promise<void> {
  try {
    const enabled = await isAlertModuleEnabled(args.key);
    if (!enabled) return;
    const color =
      args.severity === "critical"
        ? { hex: "EF4444", css: "#dc2626", bg: "#2d0a0a", ator: "#fca5a5", emoji: "🚨" }
        : args.severity === "warning"
          ? { hex: "D97706", css: "#d97706", bg: "#2d1a06", ator: "#fdba74", emoji: "⚠️" }
          : { hex: "3B82F6", css: "#2563eb", bg: "#0b1a33", ator: "#93c5fd", emoji: "ℹ️" };
    const db = guardDb();

    const { data: integ } = await db
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    const teams = integ?.enabled
      ? ((integ.config as { teams_enabled?: boolean; teams_webhook_url?: string | null }) ?? null)
      : null;
    if (teams?.teams_enabled && teams.teams_webhook_url) {
      await postTeamsWebhook(teams.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: color.hex,
          summary: args.title,
          sections: [
            {
              activityTitle: `${color.emoji} ${APP_NAME} · ${args.title}`,
              activitySubtitle: new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              }),
              facts: [
                { name: "Zona", value: args.zoneName },
                ...args.facts,
                ...(args.actor ? [{ name: args.actorLabel ?? "Por", value: args.actor }] : []),
              ],
              markdown: true,
            },
          ],
          potentialAction: [
            {
              "@type": "OpenUri",
              name: `Abrir no ${APP_NAME}`,
              targets: [{ os: "default", uri: appLink() }],
            },
          ],
        }),
      }).catch(() => {});
    }

    const recipients = await getGlobalAdminEmails();
    if (recipients.length === 0) return;
    const { data: smtp } = await db.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!smtp?.host) return;
    const password = smtp.password || process.env.SMTP_PASSWORD;
    if (!password) return;
    const link = appLink();
    const defaultHtml = buildRuleAlertHtml({
      badge: args.title.toUpperCase().slice(0, 40),
      heroTitle: args.title,
      accentColor: color.css,
      accentBg: color.bg,
      zona: args.zoneName,
      categoria: args.category,
      descricao: args.description,
      extraFacts: args.facts.map((f) => ({ label: f.name.toUpperCase(), value: f.value })),
      atorLabel: (args.actorLabel ?? "Por").toUpperCase(),
      ator: args.actor ?? "—",
      atorColor: color.ator,
      link,
    });
    const vars = {
      zona: args.zoneName,
      categoria: args.category,
      descricao: args.description,
      link,
      ator: args.actor ?? "—",
      ...(args.vars ?? {}),
    };
    const override = await getEmailTemplateOverride(db, args.key);
    const html = applyEmailTemplate(args.key, override, vars, defaultHtml);
    const subject = `${APP_NAME} · ${args.title} · ${args.zoneName}`;
    for (const to of recipients) {
      try {
        const out: any = await sendMail({
          host: smtp.host,
          port: smtp.port || 587,
          secure: !!smtp.secure,
          username: smtp.username || null,
          password,
          from: { name: smtp.from_name || APP_NAME, email: smtp.from_email },
          to,
          subject,
          html,
        });
        await db.from("email_logs").insert({
          to_email: to,
          subject,
          template: args.key,
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? "falha no envio"),
        });
      } catch (e: any) {
        await db.from("email_logs").insert({
          to_email: to,
          subject,
          template: args.key,
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch (e) {
    console.error("[sendGuardAlert]", e);
  }
}

// Grava o alerta (deduplicado) e notifica só se for novo.
export async function raiseAuditAlert(a: {
  severity: "critical" | "warning" | "info";
  rule: string;
  title: string;
  dedupKey: string;
  accountId?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
  details: Record<string, unknown>;
  facts: Array<{ name: string; value: string }>;
  notify?: boolean;
}): Promise<boolean> {
  const db = guardDb();
  const { data, error } = await db
    .from("cloudflare_audit_alerts")
    .insert({
      severity: a.severity,
      rule: a.rule,
      title: a.title,
      dedup_key: a.dedupKey,
      account_id: a.accountId ?? null,
      zone_id: a.zoneId ?? null,
      zone_name: a.zoneName ?? null,
      details: a.details,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return false; // já existia (dedup) ou falhou
  if (a.notify !== false) {
    await sendGuardAlert({
      key: "cloudflare_audit_alert",
      severity: a.severity,
      title: a.title,
      zoneName: a.zoneName ?? a.accountId ?? "conta Cloudflare",
      category:
        a.severity === "critical" ? "Crítico" : a.severity === "warning" ? "Atenção" : "Informação",
      description: a.title,
      facts: a.facts,
      vars: { detalhes: a.facts.map((f) => `${f.name}: ${f.value}`).join(" · ") },
    });
  }
  return true;
}

// ─── Limite de volume por usuário ───────────────────────────────────────────
export const RATE_LIMITS = {
  approve_dns_delete: { max: 10, windowMin: 60, label: "confirmações de exclusão de DNS" },
  dns_write: { max: 30, windowMin: 60, label: "criações/edições de DNS" },
  rule_write: { max: 30, windowMin: 60, label: "criações/edições de regras" },
  dns_restore: { max: 50, windowMin: 60, label: "registros restaurados" },
  dns_import: { max: 3, windowMin: 60, label: "importações de DNS" },
} as const;
export type RateAction = keyof typeof RATE_LIMITS;

export async function rateUsage(
  userId: string,
  action: RateAction,
): Promise<{ used: number; max: number; resetAt: string | null }> {
  const lim = RATE_LIMITS[action];
  const since = new Date(Date.now() - lim.windowMin * 60_000).toISOString();
  const { data } = await guardDb()
    .from("cloudflare_rate_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{ created_at: string }>;
  const resetAt =
    rows.length >= lim.max
      ? new Date(new Date(rows[0].created_at).getTime() + lim.windowMin * 60_000).toISOString()
      : null;
  return { used: rows.length, max: lim.max, resetAt };
}

// Lança erro se estourou; senão registra o uso. `count` > 1 pra ações em lote (restauração).
export async function enforceRateLimit(
  userId: string,
  action: RateAction,
  actorEmail?: string | null,
  count = 1,
): Promise<void> {
  const lim = RATE_LIMITS[action];
  const usage = await rateUsage(userId, action);
  if (usage.used + count > lim.max) {
    const hour = new Date().toISOString().slice(0, 13);
    await raiseAuditAlert({
      severity: action === "approve_dns_delete" ? "critical" : "warning",
      rule: "rate_limit",
      title: `Limite de ${lim.label} atingido`,
      dedupKey: `rate:${userId}:${action}:${hour}`,
      details: {
        user_id: userId,
        user_email: actorEmail ?? null,
        action,
        used: usage.used,
        max: lim.max,
      },
      facts: [
        { name: "Usuário", value: actorEmail ?? userId },
        { name: "Ação", value: lim.label },
        { name: "Uso", value: `${usage.used} de ${lim.max} em ${lim.windowMin} min` },
      ],
    });
    const when = usage.resetAt
      ? new Date(usage.resetAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        })
      : null;
    throw new Error(
      `Limite atingido: no máximo ${lim.max} ${lim.label} por ${lim.windowMin} min.${when ? ` Tente de novo às ${when}.` : ""} Os admins foram avisados.`,
    );
  }
  await guardDb()
    .from("cloudflare_rate_events")
    .insert(Array.from({ length: count }, () => ({ user_id: userId, action })));
}

// ─── Configuração ───────────────────────────────────────────────────────────
export type GuardSettings = {
  delete_window_min: number;
  delete_threshold: number;
  change_window_min: number;
  change_threshold: number;
  create_window_min: number;
  create_threshold: number;
  create_outside_flow: boolean;
  critical_hosts: string[];
};
export async function getGuardSettings(): Promise<GuardSettings> {
  const { data } = await guardDb()
    .from("cloudflare_guard_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return {
    delete_window_min: data?.delete_window_min ?? 10,
    delete_threshold: data?.delete_threshold ?? 3,
    change_window_min: data?.change_window_min ?? 10,
    change_threshold: data?.change_threshold ?? 15,
    create_window_min: data?.create_window_min ?? 10,
    create_threshold: data?.create_threshold ?? 10,
    create_outside_flow: data?.create_outside_flow ?? true,
    critical_hosts: data?.critical_hosts ?? [],
  };
}

// ─── Registros DNS ──────────────────────────────────────────────────────────
export type DnsRecordSnap = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean | null;
  ttl: number | null;
  priority: number | null;
  comment: string | null;
  tags: string[] | null;
  data: unknown;
  modified_on: string | null;
  // Só pra casar registro recriado (ver matchSnapshotRecord). Cópias antigas
  // não têm; o que importa é o created_on do registro ATUAL.
  created_on?: string | null;
};

export function snapRecord(r: any): DnsRecordSnap {
  return {
    id: String(r.id),
    type: String(r.type),
    name: String(r.name),
    content: String(r.content ?? ""),
    proxied: typeof r.proxied === "boolean" ? r.proxied : null,
    ttl: typeof r.ttl === "number" ? r.ttl : null,
    priority: typeof r.priority === "number" ? r.priority : null,
    comment: r.comment ?? null,
    tags: Array.isArray(r.tags) && r.tags.length ? r.tags : null,
    data: r.data ?? null,
    modified_on: r.modified_on ?? null,
    created_on: r.created_on ?? null,
  };
}

// Onde está hoje, na Cloudflare, um registro de uma cópia de backup.
//   same      → mesmo id e mesmos valores (nada a restaurar);
//   changed   → mesmo id, valores diferentes (restaurar = PUT nele);
//   recreated → o id sumiu, mas existe UM registro de mesmo tipo + nome criado
//               DEPOIS da cópia e que não estava nela (alguém apagou e criou de
//               novo; a Cloudflare dá id novo). Restaurar = PUT nele, nunca um
//               segundo registro (com A/AAAA o tráfego seria dividido calado);
//   ambiguous → mais de um candidato assim (ou sem data de criação): não
//               escolhe sozinho;
//   gone      → não existe (restaurar = POST).
// Registros de mesmo tipo + nome que já existiam antes da cópia (round robin)
// não contam como recriado: restaurar cria o que faltava ao lado deles.
export type SnapshotMatch =
  | { mode: "same"; target: DnsRecordSnap }
  | { mode: "changed"; target: DnsRecordSnap }
  | { mode: "recreated"; target: DnsRecordSnap; equal: boolean }
  | { mode: "ambiguous"; candidates: DnsRecordSnap[] }
  | { mode: "gone" };

const RECREATE_SLACK_MS = 2 * 60_000;

export function matchSnapshotRecord(
  rec: DnsRecordSnap,
  current: DnsRecordSnap[],
  snapIds: Set<string>,
  takenAt: string,
): SnapshotMatch {
  const byId = current.find((c) => c.id === rec.id);
  if (byId)
    return recordKey(byId) === recordKey(rec)
      ? { mode: "same", target: byId }
      : { mode: "changed", target: byId };
  const since = new Date(takenAt).getTime() - RECREATE_SLACK_MS;
  const name = rec.name.toLowerCase();
  const candidates = current.filter(
    (c) =>
      c.type === rec.type &&
      c.name.toLowerCase() === name &&
      !snapIds.has(c.id) &&
      // Sem data de criação: trata como candidato (e cai em ambiguous se
      // houver mais de um) — melhor parar do que duplicar.
      (!c.created_on || new Date(c.created_on).getTime() >= since),
  );
  if (candidates.length === 0) return { mode: "gone" };
  if (candidates.length > 1 || !candidates[0].created_on) return { mode: "ambiguous", candidates };
  return {
    mode: "recreated",
    target: candidates[0],
    equal: recordKey(candidates[0]) === recordKey(rec),
  };
}

// Casa todos os registros de uma cópia de uma vez. Se dois registros da cópia
// apontarem pro mesmo "recriado" (ex.: dois A de round robin apagados e só um
// criado de novo), nenhum dos dois escolhe: viram ambiguous.
export function planSnapshot(
  records: DnsRecordSnap[],
  current: DnsRecordSnap[],
  takenAt: string,
): Map<string, SnapshotMatch> {
  const snapIds = new Set(records.map((r) => r.id));
  const plan = new Map<string, SnapshotMatch>();
  const uses = new Map<string, number>();
  for (const rec of records) {
    const m = matchSnapshotRecord(rec, current, snapIds, takenAt);
    plan.set(rec.id, m);
    if (m.mode === "recreated") uses.set(m.target.id, (uses.get(m.target.id) ?? 0) + 1);
  }
  for (const [id, m] of plan)
    if (m.mode === "recreated" && (uses.get(m.target.id) ?? 0) > 1)
      plan.set(id, { mode: "ambiguous", candidates: [m.target] });
  return plan;
}

export async function listZoneRecords(token: string, zoneId: string): Promise<DnsRecordSnap[]> {
  const out: DnsRecordSnap[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await cf(token, `/zones/${zoneId}/dns_records?per_page=500&page=${page}`);
    if (!r.ok) throw new Error(r.error ?? "Falha ao listar DNS");
    out.push(...((r.json?.result ?? []) as any[]).map(snapRecord));
    if (page >= (r.json?.result_info?.total_pages ?? 1)) break;
  }
  return out.sort(
    (a, b) =>
      a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

// Campos que valem pra comparar/restaurar (sem id/modified_on).
export function recordKey(r: DnsRecordSnap) {
  return JSON.stringify([
    r.type,
    r.name,
    r.content,
    r.proxied,
    r.ttl,
    r.priority,
    r.comment,
    r.tags,
    r.data,
  ]);
}

// ─── Importar arquivo de zona (BIND) ────────────────────────────────────────
// Leitura própria só pra REVISÃO (o que entra, o que já existe, o que é
// sensível) e pro registro no histórico. Quem grava é a Cloudflare, pelo
// endpoint /dns_records/import, que lê o mesmo arquivo.
export const IMPORT_MAX_RECORDS = 200;
const IMPORT_TYPES = new Set([
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "NS",
  "SRV",
  "CAA",
  "PTR",
  "SPF",
  "CERT",
  "DNSKEY",
  "DS",
  "NAPTR",
  "SMIMEA",
  "SSHFP",
  "SVCB",
  "HTTPS",
  "TLSA",
  "URI",
  "LOC",
]);
const CLASSES = new Set(["IN", "CH", "HS"]);

export type ParsedZoneRecord = {
  type: string;
  name: string;
  content: string;
  ttl: number | null;
  priority: number | null;
};

// Tira comentário (;) fora de aspas.
function stripComment(line: string) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== "\\") q = !q;
    else if (c === ";" && !q) return line.slice(0, i);
  }
  return line;
}

// Quebra em tokens respeitando strings entre aspas (TXT).
function tokens(s: string) {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? `"${m[1]}"` : m[2]);
  return out;
}

export function parseBindZone(
  text: string,
  zoneName: string,
): { records: ParsedZoneRecord[]; skipped: string[] } {
  const zone = zoneName.toLowerCase().replace(/\.$/, "");
  let origin = zone;
  let defaultTtl: number | null = null;
  let lastName = zone;
  const records: ParsedZoneRecord[] = [];
  const skipped: string[] = [];

  // Junta registros que continuam entre parênteses (ex.: SOA).
  const logical: Array<{ text: string; indented: boolean }> = [];
  let buf = "";
  let depth = 0;
  let indented = false;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = stripComment(raw);
    if (!buf) indented = /^\s/.test(line);
    for (const ch of line) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
    }
    buf += ` ${line.replace(/[()]/g, " ")}`;
    if (depth === 0) {
      if (buf.trim()) logical.push({ text: buf.trim(), indented });
      buf = "";
    }
  }

  const fq = (n: string) => {
    if (n === "@") return origin;
    if (n.endsWith(".")) return n.slice(0, -1).toLowerCase();
    return `${n}.${origin}`.toLowerCase();
  };

  for (const { text: l, indented: ind } of logical) {
    const t = tokens(l);
    if (!t.length) continue;
    if (t[0].toUpperCase() === "$ORIGIN") {
      origin = (t[1] ?? origin).replace(/\.$/, "").toLowerCase();
      continue;
    }
    if (t[0].toUpperCase() === "$TTL") {
      defaultTtl = Number(t[1]) || null;
      continue;
    }
    if (t[0].startsWith("$")) continue;
    let i = 0;
    let name = lastName;
    if (!ind) {
      name = fq(t[0]);
      i = 1;
    }
    let ttl: number | null = defaultTtl;
    // TTL e classe podem vir em qualquer ordem antes do tipo.
    for (let k = 0; k < 2 && i < t.length; k++) {
      if (/^\d+$/.test(t[i])) ttl = Number(t[i++]);
      else if (CLASSES.has(t[i].toUpperCase())) i++;
    }
    const type = (t[i++] ?? "").toUpperCase();
    lastName = name;
    if (type === "SOA") continue;
    // NS da raiz é da própria Cloudflare (não se importa).
    if (type === "NS" && name === zone) continue;
    if (!IMPORT_TYPES.has(type)) {
      skipped.push(l.slice(0, 120));
      continue;
    }
    const rest = t.slice(i);
    if (!rest.length) {
      skipped.push(l.slice(0, 120));
      continue;
    }
    let priority: number | null = null;
    let content: string;
    if (type === "MX") {
      priority = Number(rest[0]);
      content = (rest[1] ?? "").replace(/\.$/, "");
    } else if (type === "TXT" || type === "SPF") {
      content = rest.map((x) => x.replace(/^"|"$/g, "")).join("");
    } else if (type === "CNAME" || type === "NS" || type === "PTR") {
      content = rest[0].replace(/\.$/, "");
    } else {
      content = rest.join(" ");
    }
    records.push({ type, name, content, ttl, priority: Number.isFinite(priority) ? priority : null });
  }
  return { records, skipped };
}

// Mesmo registro? (tipo + nome + conteúdo, ignorando caixa e ponto final.)
export function sameRecord(a: { type: string; name: string; content: string }, b: DnsRecordSnap) {
  const norm = (s: string) => s.toLowerCase().replace(/\.$/, "").replace(/^"|"$/g, "");
  return (
    a.type.toUpperCase() === b.type.toUpperCase() &&
    norm(a.name) === norm(b.name) &&
    norm(a.content) === norm(b.content)
  );
}

// Envia o arquivo pra Cloudflare (multipart; não usa cf() porque ele força JSON).
export async function cfImportZoneFile(
  token: string,
  zoneId: string,
  fileText: string,
  proxied: boolean,
): Promise<{ ok: true; added: number; parsed: number } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("file", new Blob([fileText], { type: "text/plain" }), "zona.txt");
  form.append("proxied", proxied ? "true" : "false");
  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || json?.success === false)
    return { ok: false, error: json?.errors?.[0]?.message ?? `HTTP ${res.status}` };
  return {
    ok: true,
    added: Number(json?.result?.recs_added ?? 0),
    parsed: Number(json?.result?.total_records_parsed ?? 0),
  };
}

function sha256(records: DnsRecordSnap[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(records.map((r) => ({ ...r, modified_on: undefined, created_on: undefined }))),
    )
    .digest("hex");
}

export async function saveSnapshot(args: {
  zoneId: string;
  zoneName: string | null;
  kind: "daily" | "manual" | "pre_delete" | "pre_restore";
  records: DnsRecordSnap[];
  storagePath?: string | null;
  createdBy?: string | null;
}) {
  const { data, error } = await guardDb()
    .from("cloudflare_dns_snapshots")
    .insert({
      zone_id: args.zoneId,
      zone_name: args.zoneName,
      kind: args.kind,
      record_count: args.records.length,
      sha256: sha256(args.records),
      records: args.records,
      storage_path: args.storagePath ?? null,
      created_by: args.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao gravar backup: ${error.message}`);
  return String(data.id);
}

// Backup completo de uma zona: lista tudo direto na Cloudflare, grava a cópia
// e o arquivo BIND (se a exportação funcionar). Compara com a cópia diária
// anterior e alerta queda grande no número de registros.
export async function backupZone(
  token: string,
  zone: { id: string; name: string },
  kind: "daily" | "manual",
  createdBy?: string | null,
) {
  const db = guardDb();
  const records = await listZoneRecords(token, zone.id);
  let storagePath: string | null = null;
  const exp = await cf(token, `/zones/${zone.id}/dns_records/export`);
  if (exp.ok && exp.text && !exp.json) {
    const day = new Date().toISOString().slice(0, 10);
    const path = `${zone.name}/${day}${kind === "manual" ? `-manual-${Date.now()}` : ""}.zone`;
    const up = await db.storage
      .from("dns-backups")
      .upload(path, new Blob([exp.text], { type: "text/plain" }), {
        upsert: true,
        contentType: "text/plain",
      });
    if (!up.error) storagePath = path;
  }
  const { data: prev } = await db
    .from("cloudflare_dns_snapshots")
    .select("record_count, taken_at")
    .eq("zone_id", zone.id)
    .in("kind", ["daily", "manual"])
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = await saveSnapshot({
    zoneId: zone.id,
    zoneName: zone.name,
    kind,
    records,
    storagePath,
    createdBy,
  });
  if (prev && prev.record_count >= 10 && records.length < prev.record_count * 0.9) {
    await raiseAuditAlert({
      severity: "critical",
      rule: "backup_drop",
      title: "Queda grande no número de registros DNS",
      dedupKey: `backup_drop:${zone.id}:${new Date().toISOString().slice(0, 10)}`,
      zoneId: zone.id,
      zoneName: zone.name,
      details: { before: prev.record_count, after: records.length, previous_at: prev.taken_at },
      facts: [
        { name: "Antes", value: `${prev.record_count} registros` },
        { name: "Agora", value: `${records.length} registros` },
      ],
    });
  }
  return { id, count: records.length, storagePath };
}

// Retenção: 90 dias de diárias + a primeira de cada mês por 12 meses.
// pre_delete/pre_restore ficam (são pequenas e servem de prova).
async function pruneSnapshots() {
  const db = guardDb();
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data } = await db
    .from("cloudflare_dns_snapshots")
    .select("id, zone_id, taken_at, storage_path")
    .in("kind", ["daily", "manual"])
    .lt("taken_at", cutoff)
    .order("taken_at", { ascending: true });
  const keep = new Set<string>();
  const seenMonth = new Set<string>();
  const yearAgo = Date.now() - 366 * 86400_000;
  for (const s of (data ?? []) as any[]) {
    const m = `${s.zone_id}:${String(s.taken_at).slice(0, 7)}`;
    if (!seenMonth.has(m) && new Date(s.taken_at).getTime() > yearAgo) {
      seenMonth.add(m);
      keep.add(s.id);
    }
  }
  const drop = ((data ?? []) as any[]).filter((s) => !keep.has(s.id));
  if (drop.length) {
    const paths = drop.map((s) => s.storage_path).filter(Boolean);
    if (paths.length) await db.storage.from("dns-backups").remove(paths);
    await db
      .from("cloudflare_dns_snapshots")
      .delete()
      .in(
        "id",
        drop.map((s) => s.id),
      );
  }
  await db
    .from("cloudflare_rate_events")
    .delete()
    .lt("created_at", new Date(Date.now() - 2 * 86400_000).toISOString());
}

// Zonas em lotes paralelos: com ~40 zonas uma a uma o backup passava fácil do
// limite de ~100s da borda da Cloudflare na frente do app.
const BACKUP_CONCURRENCY = 4;

// ─── Zona removida da Cloudflare ────────────────────────────────────────────
// Zona apagada no painel/API ou "pendente" expirada (a Cloudflare apaga sozinha
// zona que nunca trocou os nameservers — caso real em
// 04/11/2026). O sync nunca tirava da lista: o backup falhava todo dia.
// status = 'removed' (coluna é texto livre; volta sozinho se a zona reaparecer
// no sync, que regrava o status vindo da Cloudflare).
export const ZONE_REMOVED_STATUS = "removed";
// Filtro PostgREST: zonas não removidas (status nulo também conta como ativa).
export const NOT_REMOVED_FILTER = `status.is.null,status.neq.${ZONE_REMOVED_STATUS}`;

// Confirma com a Cloudflare que a zona não existe mais (1001 = "Invalid zone
// identifier"). Qualquer outra falha (token, rede) NÃO marca como removida.
export async function isZoneGone(token: string, zoneId: string): Promise<boolean> {
  const r = await cf(token, `/zones/${zoneId}`);
  if (r.ok) return false;
  const codes = ((r.json?.errors ?? []) as any[]).map((e) => Number(e?.code));
  return codes.includes(1001) || r.status === 404;
}

export async function markZoneRemoved(
  zone: { id: string; name: string },
  source: "backup" | "sync",
): Promise<void> {
  const db = guardDb();
  const { data: snap } = await db
    .from("cloudflare_dns_snapshots")
    .select("taken_at, record_count")
    .eq("zone_id", zone.id)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await db
    .from("cloudflare_zones")
    .update({ status: ZONE_REMOVED_STATUS, synced_at: new Date().toISOString() })
    .eq("id", zone.id);
  await raiseAuditAlert({
    severity: "info",
    rule: "zone_removed",
    title: `Zona não existe mais na Cloudflare: ${zone.name}`,
    dedupKey: `zone_removed:${zone.id}`,
    zoneId: zone.id,
    zoneName: zone.name,
    details: { source, last_backup: snap?.taken_at ?? null, last_count: snap?.record_count ?? null },
    facts: [
      { name: "Detectado por", value: source === "backup" ? "backup diário" : "sincronização" },
      {
        name: "Último backup",
        value: snap
          ? `${new Date(snap.taken_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${snap.record_count} registros`
          : "nenhum",
      },
      {
        name: "O que muda",
        value:
          "A zona saiu do seletor e do backup diário. Os backups antigos continuam guardados (tabela cloudflare_dns_snapshots e bucket dns-backups) para restaurar se o domínio for adicionado de novo. Quem apagou aparece no alerta de exclusão de zona.",
      },
    ],
  });
}

export async function runDnsBackupAll(
  onZoneDone?: (r: {
    zone: string;
    ok: boolean;
    count?: number;
    error?: string;
    removed?: boolean;
  }) => void,
): Promise<{ ok: boolean; zones: number; done: number; failed: string[]; removed: string[] }> {
  const token = await getCfToken();
  const db = guardDb();
  const { data: zones } = await db
    .from("cloudflare_zones")
    .select("id, name")
    .or(NOT_REMOVED_FILTER);
  const list = (zones ?? []) as Array<{ id: string; name: string }>;
  const failed: string[] = [];
  const removed: string[] = [];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const z = list[next++];
      try {
        const r = await backupZone(token, z, "daily");
        done++;
        onZoneDone?.({ zone: z.name, ok: true, count: r.count });
      } catch (e: any) {
        // Zona apagada na Cloudflare: não é falha do backup.
        if (await isZoneGone(token, z.id).catch(() => false)) {
          await markZoneRemoved(z, "backup");
          removed.push(z.name);
          onZoneDone?.({ zone: z.name, ok: true, removed: true });
          continue;
        }
        const msg = String(e?.message ?? e);
        failed.push(z.name);
        onZoneDone?.({ zone: z.name, ok: false, error: msg });
        await raiseAuditAlert({
          severity: "warning",
          rule: "backup_failed",
          title: "Backup de DNS falhou",
          dedupKey: `backup_failed:${z.id}:${new Date().toISOString().slice(0, 10)}`,
          zoneId: z.id,
          zoneName: z.name,
          details: { error: msg },
          facts: [{ name: "Erro", value: msg.slice(0, 200) }],
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BACKUP_CONCURRENCY, list.length) }, worker));
  await pruneSnapshots().catch((e) => console.error("[pruneSnapshots]", e));
  // O backup diário também vigia o monitor (cada um checa o outro).
  await checkWatchFreshness();
  return { ok: failed.length === 0, zones: list.length, done, failed, removed };
}

async function checkWatchFreshness() {
  const { data } = await guardDb()
    .from("cloudflare_audit_watch_state")
    .select("account_id, last_ok_at");
  for (const s of (data ?? []) as any[]) {
    const age = s.last_ok_at ? Date.now() - new Date(s.last_ok_at).getTime() : Infinity;
    if (age > 30 * 60_000) {
      await raiseAuditAlert({
        severity: "critical",
        rule: "monitor_stale",
        title: "Monitor do log de auditoria parado",
        dedupKey: `monitor_stale:${s.account_id}:${new Date().toISOString().slice(0, 13)}`,
        accountId: s.account_id,
        details: { last_ok_at: s.last_ok_at },
        facts: [
          {
            name: "Última leitura com sucesso",
            value: s.last_ok_at ? new Date(s.last_ok_at).toLocaleString("pt-BR") : "nunca",
          },
        ],
      });
    }
  }
}

// ─── Monitor do log de auditoria da conta ───────────────────────────────────
function lower(v: unknown) {
  return String(v ?? "").toLowerCase();
}
function isDns(ev: any) {
  return /dns/.test(lower(ev?.resource?.type)) || /^rec_/.test(lower(ev?.action?.type));
}
function isDelete(ev: any) {
  return /(delete|_del$|^rec_del|remove)/.test(lower(ev?.action?.type));
}
function isCreate(ev: any) {
  return !isDelete(ev) && /(create|^add$|_add$|^rec_add)/.test(lower(ev?.action?.type));
}
function recordNameOf(ev: any): string {
  const o = ev?.oldValueJson ?? {};
  const n = ev?.newValueJson ?? {};
  return String(o.name ?? n.name ?? ev?.metadata?.name ?? ev?.resource?.name ?? "").toLowerCase();
}
function zoneOf(ev: any, zones: Array<{ id: string; name: string }>, recordName: string) {
  const zn = lower(
    ev?.metadata?.zone_name ?? ev?.newValueJson?.zone_name ?? ev?.oldValueJson?.zone_name,
  );
  const byName =
    zones.find((z) => z.name === zn) ??
    zones
      .filter((z) => recordName === z.name || recordName.endsWith(`.${z.name}`))
      .sort((a, b) => b.name.length - a.name.length)[0];
  return byName ?? null;
}
function describeRecord(ev: any) {
  const o = ev?.oldValueJson ?? {};
  const n = ev?.newValueJson ?? {};
  const type = o.type ?? n.type ?? "";
  const name = o.name ?? n.name ?? ev?.resource?.id ?? "registro";
  const content = o.content ?? n.content ?? "";
  return `${type} ${name}${content ? ` → ${content}` : ""}`.trim();
}
function actorOf(ev: any) {
  return String(ev?.actor?.email ?? ev?.actor?.type ?? "desconhecido");
}

// Ação automática da própria Cloudflare: o log da conta grava
// actor.email = "System" (confirmado na conta). Quem tem token vazado aparece
// como o dono do token — não dá pra se passar por "System".
function isSystemActor(ev: any) {
  return (
    lower(ev?.actor?.email) === "system" || /^(system|cloudflare)$/.test(lower(ev?.actor?.type))
  );
}
// Prefixos de registros temporários de validação de certificado.
const CERT_VALIDATION_PREFIXES = ["_acme-challenge.", "_cf-custom-hostname.", "_dnsauth."];
// Eventos ignorados pelo monitor (não alertam nem contam pro volume):
//  - qualquer registro _acme-challenge.*, de qualquer ator (clientes ACME
//    externos com token também criam/apagam esses; apagar um não derruba nada);
//  - registros de validação mexidos pela própria Cloudflare ("System").
function isCertValidationEvent(ev: any) {
  if (!isDns(ev)) return false;
  const name = recordNameOf(ev);
  if (name.startsWith("_acme-challenge.")) return true;
  return isSystemActor(ev) && CERT_VALIDATION_PREFIXES.some((p) => name.startsWith(p));
}

// Criação que, mesmo sozinha, dá controle ao atacante (subdomínio, e-mail,
// prova de posse do domínio, certificado). Devolve o motivo ou null.
function sensitiveCreateReason(
  ev: any,
  name: string,
  zone: { name: string } | null,
  criticalHosts: string[],
): string | null {
  const n = ev?.newValueJson ?? {};
  return sensitiveRecordReason(
    { type: String(n.type ?? ""), name, content: String(n.content ?? "") },
    zone?.name ?? null,
    criticalHosts,
  );
}

// Mesma regra usada no monitor e na revisão do import: registro que, sozinho,
// muda quem recebe e-mail, quem responde o subdomínio ou quem prova posse.
export function sensitiveRecordReason(
  rec: { type: string; name: string; content: string },
  zoneName: string | null,
  criticalHosts: string[],
): string | null {
  const type = rec.type.toUpperCase();
  const name = rec.name.toLowerCase();
  const content = lower(rec.content);
  if (type === "NS" && (!zoneName || name !== zoneName))
    return "Delegação de subdomínio (NS): o subdomínio passa a ser respondido por outros servidores";
  if (name.startsWith("*.")) return "Registro curinga (*)";
  if (type === "MX") return "Servidor de e-mail (MX)";
  if (type === "CAA") return "Autorização de emissão de certificado (CAA)";
  if (type === "TXT") {
    if (content.includes("v=spf1") || content.includes("v=dmarc1") || name.startsWith("_dmarc."))
      return "Política de e-mail (SPF/DMARC)";
    if (name.includes("._domainkey.") || content.includes("v=dkim1"))
      return "Chave de e-mail (DKIM)";
    if (/verification|verify|^"?ms=ms\d/.test(content))
      return "TXT de verificação de posse do domínio";
  }
  if (criticalHosts.some((h) => name === h || name.startsWith(`${h}.`))) return "Host crítico";
  return null;
}

// A alteração tem par no histórico do sistema (feita pela tela, já logada e
// alertada no fluxo normal)?
async function madeInBSecurity(db: any, ev: any, name: string, actions: string[]) {
  const t = new Date(ev.when).getTime();
  const { data } = await db
    .from("audit_logs")
    .select("id")
    .in("action", actions)
    .gte("created_at", new Date(t - 10 * 60_000).toISOString())
    .lte("created_at", new Date(t + 10 * 60_000).toISOString())
    .ilike("details->>name", `%${name.split(".")[0]}%`)
    .limit(1);
  return (data ?? []).length > 0;
}

// Regras de criação cujos registros podem ser removidos direto do alerta.
export const CREATE_ALERT_RULES = [
  "dns_create_sensitive",
  "dns_create_outside_flow",
  "volume_create",
];

export async function runAuditWatch(): Promise<{
  ok: boolean;
  accounts: number;
  events: number;
  alerts: number;
  errors: string[];
}> {
  const db = guardDb();
  const token = await getCfToken();
  const settings = await getGuardSettings();
  const { data: zoneRows } = await db.from("cloudflare_zones").select("id, name, account_id");
  const zones = (
    (zoneRows ?? []) as Array<{ id: string; name: string; account_id: string | null }>
  ).map((z) => ({
    ...z,
    name: String(z.name).toLowerCase(),
  }));
  const accounts = [
    ...new Set(zones.map((z) => z.account_id).filter((a): a is string => !!a && a !== "default")),
  ];
  const errors: string[] = [];
  let totalEvents = 0;
  let alerts = 0;
  const now = Date.now();
  const maxWindow = Math.max(
    settings.delete_window_min,
    settings.change_window_min,
    settings.create_window_min,
  );
  const criticalHosts = settings.critical_hosts.map((h) => h.trim().toLowerCase()).filter(Boolean);

  for (const acc of accounts) {
    const { data: st } = await db
      .from("cloudflare_audit_watch_state")
      .select("*")
      .eq("account_id", acc)
      .maybeSingle();
    const cursor = st?.last_event_at ? new Date(st.last_event_at).getTime() : now - 60 * 60_000;
    // Lê desde o menor entre o cursor e a janela de volume (eventos antigos só
    // contam pro volume, não geram alerta de novo).
    const since = new Date(Math.min(cursor, now - maxWindow * 60_000)).toISOString();
    const events: any[] = [];
    let failure: string | null = null;
    let denied = false;
    for (let page = 1; page <= 20; page++) {
      const r = await cf(
        token,
        `/accounts/${acc}/audit_logs?since=${encodeURIComponent(since)}&per_page=100&page=${page}&direction=asc`,
      );
      if (!r.ok) {
        failure = r.error;
        denied =
          r.status === 403 ||
          (r.json?.errors ?? []).some((e: any) => [9109, 10000].includes(Number(e?.code)));
        break;
      }
      const list = (r.json?.result ?? []) as any[];
      events.push(...list);
      if (list.length < 100) break;
    }
    const nowIso = new Date().toISOString();
    if (failure) {
      errors.push(`${acc}: ${failure}`);
      await db.from("cloudflare_audit_watch_state").upsert({
        account_id: acc,
        last_run_at: nowIso,
        last_error: failure,
        updated_at: nowIso,
        last_event_at: st?.last_event_at ?? null,
        last_ok_at: st?.last_ok_at ?? null,
      });
      if (
        await raiseAuditAlert({
          severity: "critical",
          rule: denied ? "monitor_no_permission" : "monitor_error",
          title: denied
            ? "Monitor sem permissão de ler o log de auditoria"
            : "Monitor do log de auditoria com erro",
          dedupKey: `monitor_err:${acc}:${nowIso.slice(0, 13)}`,
          accountId: acc,
          details: { error: failure },
          facts: [
            { name: "Erro", value: failure.slice(0, 200) },
            ...(denied
              ? [
                  {
                    name: "Ação",
                    value: "Dar ao token a permissão Account › Account Audit Logs: Read",
                  },
                ]
              : []),
          ],
        })
      )
        alerts++;
      continue;
    }
    totalEvents += events.length;
    // Validação de certificado (ACME / "System") sai de todas as regras abaixo;
    // só entra na contagem de ignoradas do dia, mostrada na tela.
    const relevant = events.filter((e) => !isCertValidationEvent(e));
    const freshIgnored = events.filter(
      (e) => isCertValidationEvent(e) && new Date(e.when).getTime() > cursor,
    ).length;
    const fresh = relevant.filter((e) => new Date(e.when).getTime() > cursor);
    const dnsEvents = relevant.filter(isDns);

    // 1) Exclusão de DNS fora do fluxo — cruza com exclusões aprovadas no sistema.
    const freshDeletes = fresh.filter((e) => isDns(e) && isDelete(e));
    const outside: any[] = [];
    for (const ev of freshDeletes) {
      const recId = String(ev?.resource?.id ?? "");
      const t = new Date(ev.when).getTime();
      const { data: match } = await db
        .from("cloudflare_dns_delete_requests")
        .select("id")
        .eq("status", "approved")
        .eq("record_id", recId)
        .gte("decided_at", new Date(t - 10 * 60_000).toISOString())
        .lte("decided_at", new Date(t + 10 * 60_000).toISOString())
        .limit(1);
      if (recId && (match ?? []).length) continue;
      // Remoção de registro criado fora do fluxo, feita por admin direto do alerta.
      if (recId) {
        const { data: rogue } = await db
          .from("audit_logs")
          .select("id")
          .eq("action", "remove_rogue_dns")
          .eq("details->>record_id", recId)
          .gte("created_at", new Date(t - 10 * 60_000).toISOString())
          .lte("created_at", new Date(t + 10 * 60_000).toISOString())
          .limit(1);
        if ((rogue ?? []).length) continue;
      }
      outside.push(ev);
    }
    // Exclusão feita pela própria Cloudflare ("System") num registro normal não
    // deveria acontecer, mas não é token vazado: vira "Atenção", não crítico.
    const groups: Array<{ list: any[]; system: boolean }> = [
      { list: outside.filter((e) => !isSystemActor(e)), system: false },
      { list: outside.filter(isSystemActor), system: true },
    ];
    for (const { list: grp, system } of groups) {
      if (!grp.length) continue;
      const first = grp[0];
      const z = zoneOf(first, zones, recordNameOf(first));
      const n = grp.length;
      if (
        await raiseAuditAlert({
          severity: system ? "warning" : "critical",
          rule: system ? "system_dns_delete" : "dns_delete_outside_flow",
          title: system
            ? n > 1
              ? `${n} exclusões de DNS feitas pela Cloudflare (System)`
              : "Exclusão de DNS feita pela Cloudflare (System)"
            : n > 1
              ? `${n} exclusões de DNS fora do fluxo`
              : "Exclusão de DNS fora do fluxo",
          dedupKey: `${system ? "system" : "outside"}:${first.id}`,
          accountId: acc,
          zoneId: z?.id ?? null,
          zoneName: z?.name ?? null,
          details: {
            events: grp.slice(0, 50).map((e) => ({
              id: e.id,
              when: e.when,
              record: describeRecord(e),
              actor: actorOf(e),
              interface: e.interface ?? null,
              ip: e?.actor?.ip ?? null,
            })),
          },
          facts: [
            {
              name: "Registros",
              value: grp.slice(0, 5).map(describeRecord).join("; ") + (n > 5 ? ` (+${n - 5})` : ""),
            },
            {
              name: "Ator",
              value: `${actorOf(first)}${first?.actor?.ip ? ` · IP ${first.actor.ip}` : ""}`,
            },
            { name: "Origem", value: String(first.interface ?? "—") },
            {
              name: "O que fazer",
              value: system
                ? "Conferir no painel da Cloudflare qual recurso automático removeu o registro (certificado, SSL for SaaS) e restaurar pelo backup se não era esperado."
                : "Se não foi esperado: revogar o token, restaurar pelo backup e revisar o log da conta.",
            },
          ],
        })
      )
        alerts++;
    }

    // 1a) Zona apagada na conta: derruba o DNS inteiro do domínio. Pessoa ou
    // token → crítico; a própria Cloudflare (ex.: zona pendente que expirou,
    // ator "Cloudflare"/"System") → atenção. Marca a zona como removida.
    for (const ev of fresh.filter(
      (e) => lower(e?.resource?.type) === "zone" && /delete/.test(lower(e?.action?.type)),
    )) {
      const zid = String(ev?.resource?.id ?? "");
      const z = zones.find((x) => x.id === zid) ?? null;
      const zname = z?.name ?? String(ev?.metadata?.zone_name ?? ev?.resource?.name ?? zid);
      const system = isSystemActor(ev);
      if (
        await raiseAuditAlert({
          severity: system ? "warning" : "critical",
          rule: system ? "zone_deleted_system" : "zone_deleted",
          title: system
            ? `Zona apagada pela própria Cloudflare: ${zname}`
            : `Zona apagada na conta Cloudflare: ${zname}`,
          dedupKey: `zone_del:${ev.id}`,
          accountId: acc,
          zoneId: zid || null,
          zoneName: zname,
          details: {
            event: ev.id,
            when: ev.when,
            actor: actorOf(ev),
            interface: ev.interface ?? null,
            ip: ev?.actor?.ip ?? null,
          },
          facts: [
            { name: "Zona", value: zname },
            {
              name: "Ator",
              value: `${actorOf(ev)}${ev?.actor?.ip ? ` · IP ${ev.actor.ip}` : ""}`,
            },
            { name: "Origem", value: String(ev.interface ?? "—") },
            {
              name: "O que fazer",
              value: system
                ? "Normalmente é zona que ficou pendente (nameservers nunca trocados) e expirou. Se o domínio ainda é usado, adicionar de novo e restaurar o DNS pelo backup."
                : "Se não foi esperado: revogar o token, adicionar a zona de novo e restaurar o DNS pelo backup (Ações › Backups de DNS).",
            },
          ],
        })
      )
        alerts++;
      if (z && zid && (await isZoneGone(token, zid).catch(() => false)))
        await markZoneRemoved({ id: zid, name: z.name }, "sync");
    }

    // 1b) Criação de DNS fora do sistema. Sensível → crítico, mesmo um só
    // registro; qualquer outra → atenção (se create_outside_flow ligado).
    // "System" nunca é crítico (recurso automático da Cloudflare).
    const createGroups = new Map<string, { sev: "critical" | "warning"; list: any[] }>();
    // Imports feitos pelo sistema (com justificativa) na janela: as criações
    // da mesma zona até 15 min depois são do import, não "fora do fluxo".
    const { data: importRows } = await db
      .from("audit_logs")
      .select("zone_id, created_at")
      .eq("action", "import_dns")
      .eq("status", "success")
      .gte("created_at", new Date(Math.min(cursor, now - maxWindow * 60_000) - 30 * 60_000).toISOString());
    const imports = ((importRows ?? []) as Array<{ zone_id: string | null; created_at: string }>).map(
      (r) => ({ zoneId: r.zone_id, at: new Date(r.created_at).getTime() }),
    );
    const fromImport = (ev: any, zoneId: string | null | undefined) => {
      const t = new Date(ev.when).getTime();
      return imports.some((i) => i.zoneId === zoneId && t >= i.at - 5 * 60_000 && t <= i.at + 15 * 60_000);
    };
    for (const ev of fresh.filter((e) => isDns(e) && isCreate(e))) {
      const name = recordNameOf(ev);
      const z = zoneOf(ev, zones, name);
      const system = isSystemActor(ev);
      const reason = sensitiveCreateReason(ev, name, z, criticalHosts);
      if (!reason && (system || !settings.create_outside_flow)) continue;
      if (fromImport(ev, z?.id)) continue;
      if (await madeInBSecurity(db, ev, name, ["create_dns", "restore_dns"])) continue;
      const rule = reason ? "dns_create_sensitive" : "dns_create_outside_flow";
      const sev = reason && !system ? "critical" : "warning";
      const key = `${rule}:${sev}`;
      if (!createGroups.has(key)) createGroups.set(key, { sev, list: [] });
      createGroups.get(key)!.list.push({ ev, z, reason });
    }
    for (const [key, { sev, list: grp }] of createGroups) {
      const rule = key.split(":")[0];
      const first = grp[0];
      const n = grp.length;
      const sensitive = rule === "dns_create_sensitive";
      if (
        await raiseAuditAlert({
          severity: sev,
          rule,
          title: sensitive
            ? n > 1
              ? `${n} criações sensíveis de DNS fora do ${APP_NAME}`
              : `Criação sensível de DNS fora do ${APP_NAME}: ${first.reason}`
            : n > 1
              ? `${n} registros DNS criados fora do ${APP_NAME}`
              : `Registro DNS criado fora do ${APP_NAME}`,
          dedupKey: `create:${rule}:${first.ev.id}`,
          accountId: acc,
          zoneId: first.z?.id ?? null,
          zoneName: first.z?.name ?? null,
          details: {
            events: grp.slice(0, 50).map(({ ev, z, reason }) => ({
              id: ev.id,
              when: ev.when,
              record: describeRecord(ev),
              name: recordNameOf(ev),
              record_id: ev?.resource?.id ?? null,
              zone_id: z?.id ?? null,
              reason,
              actor: actorOf(ev),
              interface: ev.interface ?? null,
              ip: ev?.actor?.ip ?? null,
            })),
          },
          facts: [
            {
              name: "Registros",
              value:
                grp
                  .slice(0, 5)
                  .map((g) => describeRecord(g.ev))
                  .join("; ") + (n > 5 ? ` (+${n - 5})` : ""),
            },
            ...(sensitive
              ? [
                  {
                    name: "Por que importa",
                    value: [...new Set(grp.map((g) => g.reason))].join("; "),
                  },
                ]
              : []),
            {
              name: "Ator",
              value: `${actorOf(first.ev)}${first.ev?.actor?.ip ? ` · IP ${first.ev.actor.ip}` : ""}`,
            },
            { name: "Origem", value: String(first.ev.interface ?? "—") },
            {
              name: "O que fazer",
              value:
                `Se não foi esperado: remover o registro pelo alerta no ${APP_NAME} (Histórico › Alertas de auditoria), revogar o token e revisar o log da conta.`,
            },
          ],
        })
      )
        alerts++;
    }

    // 2) Volume anormal (qualquer origem).
    const inWin = (min: number) =>
      dnsEvents.filter((e) => new Date(e.when).getTime() >= now - min * 60_000);
    // Exclusões feitas por janela de exceção já têm alerta próprio (uma a uma +
    // resumo no fim) — não contam como volume anormal.
    const { data: excDel } = await db
      .from("cloudflare_dns_delete_requests")
      .select("record_id")
      .not("exception_id", "is", null)
      .eq("status", "approved")
      .gte("decided_at", new Date(now - (maxWindow + 15) * 60_000).toISOString());
    const excIds = new Set(((excDel ?? []) as Array<{ record_id: string }>).map((r) => r.record_id));
    const byException = (e: any) => isDelete(e) && excIds.has(String(e?.resource?.id ?? ""));
    const delWin = inWin(settings.delete_window_min)
      .filter(isDelete)
      .filter((e) => !byException(e));
    // Criações de um import do sistema não contam como volume anormal.
    const crtWin = inWin(settings.create_window_min)
      .filter(isCreate)
      .filter((e) => !fromImport(e, zoneOf(e, zones, recordNameOf(e))?.id));
    const chgWin = inWin(settings.change_window_min).filter(
      (e) =>
        !(isCreate(e) && fromImport(e, zoneOf(e, zones, recordNameOf(e))?.id)) &&
        !byException(e),
    );
    if (crtWin.length >= settings.create_threshold) {
      if (
        await raiseAuditAlert({
          severity: "warning",
          rule: "volume_create",
          title: `Volume anormal: ${crtWin.length} criações de DNS em ${settings.create_window_min} min`,
          dedupKey: `vol_crt:${acc}:${Math.floor(now / (settings.create_window_min * 60_000))}`,
          accountId: acc,
          details: {
            count: crtWin.length,
            events: crtWin.slice(0, 50).map((ev) => {
              const z = zoneOf(ev, zones, recordNameOf(ev));
              return {
                id: ev.id,
                when: ev.when,
                record: describeRecord(ev),
                name: recordNameOf(ev),
                record_id: ev?.resource?.id ?? null,
                zone_id: z?.id ?? null,
                actor: actorOf(ev),
                interface: ev.interface ?? null,
                ip: ev?.actor?.ip ?? null,
              };
            }),
          },
          facts: [
            { name: "Criações", value: String(crtWin.length) },
            { name: "Atores", value: [...new Set(crtWin.map(actorOf))].join(", ") },
            {
              name: "Registros",
              value:
                crtWin.slice(0, 5).map(describeRecord).join("; ") +
                (crtWin.length > 5 ? ` (+${crtWin.length - 5})` : ""),
            },
          ],
        })
      )
        alerts++;
    }
    const bucket = (min: number) => Math.floor(now / (min * 60_000));
    if (delWin.length >= settings.delete_threshold) {
      if (
        await raiseAuditAlert({
          severity: "warning",
          rule: "volume_delete",
          title: `Volume anormal: ${delWin.length} exclusões de DNS em ${settings.delete_window_min} min`,
          dedupKey: `vol_del:${acc}:${bucket(settings.delete_window_min)}`,
          accountId: acc,
          details: { count: delWin.length, records: delWin.slice(0, 50).map(describeRecord) },
          facts: [
            { name: "Exclusões", value: String(delWin.length) },
            { name: "Atores", value: [...new Set(delWin.map(actorOf))].join(", ") },
          ],
        })
      )
        alerts++;
    }
    if (chgWin.length >= settings.change_threshold) {
      if (
        await raiseAuditAlert({
          severity: "warning",
          rule: "volume_change",
          title: `Volume anormal: ${chgWin.length} alterações de DNS em ${settings.change_window_min} min`,
          dedupKey: `vol_chg:${acc}:${bucket(settings.change_window_min)}`,
          accountId: acc,
          details: { count: chgWin.length },
          facts: [
            { name: "Alterações", value: String(chgWin.length) },
            { name: "Atores", value: [...new Set(chgWin.map(actorOf))].join(", ") },
          ],
        })
      )
        alerts++;
    }

    // 3) Host crítico alterado fora do sistema (sem par no audit_logs do módulo).
    // Criação num host crítico já sai como crítica na regra 1b.
    for (const ev of fresh.filter((e) => isDns(e) && !isDelete(e) && !isCreate(e))) {
      const name = recordNameOf(ev);
      const crit = criticalHosts.some((h) => name === h || name.startsWith(`${h}.`));
      if (!crit) continue;
      if (await madeInBSecurity(db, ev, name, ["update_dns", "create_dns", "restore_dns"]))
        continue;
      const z = zoneOf(ev, zones, name);
      if (
        await raiseAuditAlert({
          severity: "warning",
          rule: "critical_host_changed",
          title: `Host crítico alterado fora do ${APP_NAME}: ${name}`,
          dedupKey: `crit_host:${ev.id}`,
          accountId: acc,
          zoneId: z?.id ?? null,
          zoneName: z?.name ?? null,
          details: {
            event: ev.id,
            before: ev.oldValueJson ?? null,
            after: ev.newValueJson ?? null,
          },
          facts: [
            { name: "Registro", value: describeRecord(ev) },
            { name: "Ator", value: actorOf(ev) },
            { name: "Origem", value: String(ev.interface ?? "—") },
          ],
        })
      )
        alerts++;
    }

    // 4) Proxy desligado num registro (proteção do WAF deixa de valer pro host).
    for (const ev of fresh.filter(isDns)) {
      if (ev?.oldValueJson?.proxied === true && ev?.newValueJson?.proxied === false) {
        const name = recordNameOf(ev);
        const z = zoneOf(ev, zones, name);
        if (
          await raiseAuditAlert({
            severity: "warning",
            rule: "protection_off",
            title: `Proxy desligado: ${name}`,
            dedupKey: `proxy_off:${ev.id}`,
            accountId: acc,
            zoneId: z?.id ?? null,
            zoneName: z?.name ?? null,
            details: { event: ev.id },
            facts: [
              { name: "Registro", value: describeRecord(ev) },
              { name: "Ator", value: actorOf(ev) },
            ],
          })
        )
          alerts++;
      }
    }

    // 5) Token de API ou membro novo / papel alterado na conta.
    for (const ev of fresh) {
      const rt = lower(ev?.resource?.type);
      const at = lower(ev?.action?.type);
      const token = /token/.test(rt) && /(create|add|roll)/.test(at);
      const member = /member/.test(rt) && /(create|add|invite|update|role)/.test(at);
      if (!token && !member) continue;
      if (
        await raiseAuditAlert({
          severity: "critical",
          rule: token ? "token_created" : "member_changed",
          title: token
            ? "Token de API criado na conta Cloudflare"
            : "Membro adicionado ou papel alterado na conta Cloudflare",
          dedupKey: `acct:${ev.id}`,
          accountId: acc,
          details: { event: ev.id, resource: ev.resource ?? null, action: ev.action ?? null },
          facts: [
            { name: "Ação", value: `${ev?.action?.type ?? ""} ${ev?.resource?.type ?? ""}`.trim() },
            { name: "Ator", value: actorOf(ev) },
          ],
        })
      )
        alerts++;
    }

    const lastEvent = events.length ? events[events.length - 1].when : null;
    const newCursor =
      lastEvent && new Date(lastEvent).getTime() > cursor
        ? lastEvent
        : (st?.last_event_at ?? new Date(cursor).toISOString());
    // Contagem do dia de alterações automáticas de certificado ignoradas.
    const today = nowIso.slice(0, 10);
    const prevIgnored = st?.ignored_day === today ? Number(st?.ignored_count ?? 0) : 0;
    await db.from("cloudflare_audit_watch_state").upsert({
      account_id: acc,
      last_event_at: newCursor,
      last_run_at: nowIso,
      last_ok_at: nowIso,
      last_error: null,
      updated_at: nowIso,
      ignored_day: today,
      ignored_count: prevIgnored + freshIgnored,
    });
  }

  // Janelas de exceção vencidas: fecha e manda o resumo.
  try {
    await closeExpiredDeleteExceptions();
  } catch (e: any) {
    errors.push(`exceções: ${e?.message ?? e}`);
  }

  // O monitor também vigia o backup diário (cada um checa o outro).
  const { data: lastDaily } = await db
    .from("cloudflare_dns_snapshots")
    .select("taken_at")
    .eq("kind", "daily")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    zones.length &&
    (!lastDaily || now - new Date(lastDaily.taken_at).getTime() > 26 * 3600_000)
  ) {
    if (
      await raiseAuditAlert({
        severity: "warning",
        rule: "backup_stale",
        title: "Backup diário de DNS atrasado",
        dedupKey: `backup_stale:${new Date().toISOString().slice(0, 10)}`,
        details: { last: lastDaily?.taken_at ?? null },
        facts: [
          {
            name: "Último backup",
            value: lastDaily?.taken_at
              ? new Date(lastDaily.taken_at).toLocaleString("pt-BR")
              : "nenhum",
          },
        ],
      })
    )
      alerts++;
  }

  return {
    ok: errors.length === 0,
    accounts: accounts.length,
    events: totalEvents,
    alerts,
    errors,
  };
}

// ─── Exceção de aprovação (janela temporária de exclusão de DNS) ────────────
// Admin/super admin libera para OUTRO usuário: por até 24 h e até 200
// exclusões, nas zonas escolhidas, a lixeira apaga na hora (sem pedido).
export const EXCEPTION_HOURS = [1, 2, 4, 8, 24] as const;
export const EXCEPTION_MAX_DELETES = 200;

const CLOSE_REASON_LABEL = {
  expired: "o prazo terminou",
  limit: "o limite de exclusões foi atingido",
  revoked: "encerrada manualmente",
} as const;
export type ExceptionCloseReason = keyof typeof CLOSE_REASON_LABEL;

// Fecha a janela (uma vez só: o update condicional garante um resumo por
// janela) e manda o resumo com a lista do que foi apagado.
export async function closeDeleteException(
  id: string,
  reason: ExceptionCloseReason,
  by?: { userId: string; email: string | null } | null,
): Promise<boolean> {
  const db = guardDb();
  const { data: row } = await db
    .from("cloudflare_dns_delete_exceptions")
    .update({
      closed_at: new Date().toISOString(),
      close_reason: reason,
      closed_by: by?.userId ?? null,
      closed_by_email: by?.email ?? null,
    })
    .eq("id", id)
    .is("closed_at", null)
    .select("*")
    .maybeSingle();
  if (!row) return false;
  const { data: dels } = await db
    .from("cloudflare_dns_delete_requests")
    .select("record_snapshot")
    .eq("exception_id", id)
    .eq("status", "approved")
    .order("decided_at", { ascending: true })
    .limit(EXCEPTION_MAX_DELETES);
  const records = ((dels ?? []) as any[]).map(
    (d) => `${d.record_snapshot?.type ?? ""} ${d.record_snapshot?.name ?? ""}`.trim(),
  );
  const zoneNames: string[] = row.zone_names?.length ? row.zone_names : row.zone_ids;
  const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
  const why = CLOSE_REASON_LABEL[reason];
  await Promise.all([
    ...(row.zone_ids as string[]).map((zid, i) =>
      logCloudflareAudit({
        action: "close_dns_exception",
        status: "success",
        zoneId: zid,
        zoneName: row.zone_names?.[i] ?? null,
        userEmail: by?.email ?? null,
        details: {
          exception_id: row.id,
          user_email: row.user_email,
          reason,
          used: row.used_count,
          max: row.max_deletes,
          ticket: row.ticket,
          records,
        },
        message: `Janela de exceção de ${row.user_email ?? "—"} encerrada (${why}): ${row.used_count} de ${row.max_deletes} exclusões`,
      }),
    ),
    sendGuardAlert({
      key: "cloudflare_dns_delete_request",
      severity: "info",
      title: "Janela de exceção encerrada",
      zoneName: zoneNames.join(", "),
      category: "Exceção encerrada",
      description: `${row.used_count} registro(s) excluído(s) por ${row.user_email ?? "—"}`,
      facts: [
        { name: "Para", value: row.user_email ?? "—" },
        { name: "Resultado", value: `${row.used_count} de ${row.max_deletes} exclusões usadas` },
        ...(records.length
          ? [
              {
                name: "Registros",
                value:
                  records.slice(0, 10).join("; ") +
                  (records.length > 10 ? ` (+${records.length - 10}, lista no Histórico)` : ""),
              },
            ]
          : []),
        { name: "Motivo do fim", value: why },
        ...(row.ticket ? [{ name: "Chamado/GMUD", value: row.ticket }] : []),
      ],
      actor: by?.email ?? null,
      actorLabel: "Encerrado por",
      vars: { conteudo: records.join(", "), justificativa: row.justification },
    }),
  ]);
  return true;
}

// Chamado pelo monitor (a cada 5 min) e antes de liberar janela nova.
export async function closeExpiredDeleteExceptions(userId?: string): Promise<number> {
  let q = guardDb()
    .from("cloudflare_dns_delete_exceptions")
    .select("id, used_count, max_deletes")
    .is("closed_at", null)
    .lte("expires_at", new Date().toISOString());
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  let n = 0;
  for (const r of (data ?? []) as Array<{ id: string }>) {
    if (await closeDeleteException(r.id, "expired")) n++;
  }
  return n;
}
