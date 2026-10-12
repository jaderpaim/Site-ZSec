import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MODULE_BY_SLUG } from "@/lib/modules";
import { seedAuthAccessHistory } from "@/lib/access-logs.functions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import {
  ArrowUpDown,
  Bug,
  Globe,
  List,
  LogIn,
  Mail,
  Plug,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";

// ─── Tipos das tabelas de log ─────────────────────────────────────────────────

type VulnLog = {
  id: string;
  vuln_id: string | null;
  fqdn: string | null;
  tipo_evento: string;
  descricao: string;
  usuario_email: string | null;
  usuario_nome: string | null;
  status: string;
  detalhes: Record<string, unknown> | null;
  created_at: string;
};

type GmudLog = {
  id: string;
  gmud_id: string | null;
  gmud_titulo: string | null;
  tipo_evento: string;
  descricao: string;
  usuario_email: string | null;
  usuario_nome: string | null;
  status: "success" | "error" | "warning" | "info";
  detalhes: Record<string, unknown> | null;
  created_at: string;
};

type ImportLog = {
  id: string;
  module: string;
  filename: string | null;
  status: "success" | "error" | "partial";
  imported_count: number;
  ignored_count: number;
  total_count: number;
  message: string | null;
  created_by: string | null;
  created_at: string;
};

type ApiLog = {
  id: string;
  provider: string;
  status: "success" | "error";
  http_status: number | null;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
};

type CfAuditLog = {
  id: string;
  action: string;
  status: "success" | "error";
  zone_id: string | null;
  zone_name: string | null;
  details: unknown;
  message: string | null;
  user_email: string | null;
  duration_ms: number | null;
  created_at: string;
};

type EmailLog = {
  id: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  status: string;
  error_message: string | null;
  related_gmud_id: string | null;
  created_at: string;
};

type AccessLog = {
  id: string;
  created_at: string;
  email: string;
  user_id: string | null;
  full_name: string | null;
  role: string | null;
  status: "success" | "error";
  error_message: string | null;
  user_agent: string | null;
  login_method: string | null;
  ip: string | null;
  event_type: "login" | "logout";
  logout_reason: "manual" | "inactivity" | "expired" | null;
};

type SystemAuditLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  usuario_email: string | null;
  usuario_nome: string | null;
  modulo: string;
  acao: string;
  descricao: string;
  status: "success" | "error";
  mensagem_erro: string | null;
  detalhes: Record<string, unknown> | null;
};

// ─── Fontes ───────────────────────────────────────────────────────────────────

// As chaves são as mesmas das antigas abas (guardadas em localStorage para os
// selos de "erro novo desde a última visita").
type SrcKey = "sysaudit" | "acessos" | "imports" | "apis" | "emails" | "audit" | "gmud" | "vulns";

const SOURCES: Array<{
  key: SrcKey;
  label: string;
  table: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { key: "sysaudit", label: "Auditoria do sistema", table: "system_audit_log", icon: ShieldCheck },
  { key: "acessos", label: "Acessos", table: "auth_access_logs", icon: LogIn },
  { key: "imports", label: "Importações", table: "import_logs", icon: Upload },
  { key: "apis", label: "Conexões de API", table: "api_logs", icon: Plug },
  { key: "emails", label: "E-mails", table: "email_logs", icon: Mail },
  { key: "audit", label: "Cloudflare", table: "audit_logs", icon: Globe },
  { key: "gmud", label: "GMUD", table: "gmud_logs", icon: ArrowUpDown },
  { key: "vulns", label: "Vulnerabilidades", table: "vuln_logs", icon: Bug },
];
const SRC_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s])) as Record<
  SrcKey,
  (typeof SOURCES)[number]
>;

type Status = "ok" | "err" | "warn";
const STATUS: Record<Status, { label: string; color: string }> = {
  ok: { label: "Sucesso", color: "var(--v2-ok)" },
  err: { label: "Erro", color: "var(--v2-crit)" },
  warn: { label: "Parcial", color: "var(--v2-med)" },
};

type LogEvent = {
  key: string;
  src: SrcKey;
  at: string;
  title: string;
  sub: string;
  who: string;
  status: Status;
  /** Valor do filtro específico da fonte (módulo, método, template…) */
  facet?: [value: string, label: string];
  raw: unknown;
};

// ─── Rótulos ──────────────────────────────────────────────────────────────────

const SYS_ACTION_LABEL: Record<string, string> = {
  create: "Criação",
  update: "Edição",
  delete: "Exclusão",
  enable: "Ativação",
  disable: "Desativação",
  grant_permission: "Concessão de permissão",
  revoke_permission: "Revogação de permissão",
  grant_module_admin: "Concessão de admin de módulo",
  revoke_module_admin: "Revogação de admin de módulo",
  change_role: "Alteração de papel",
  change_department: "Alteração de departamento",
  invite: "Convite de usuário",
  activate: "Reativação",
  deactivate: "Desativação de usuário",
  change_auth_method: "Alteração de método de login",
  reset_password: "Redefinição de senha",
  salvar_integracao: "Configuração de integração",
  update_template: "Edição de template de e-mail",
};

const CF_ACTION_LABEL: Record<string, string> = {
  purge_cache: "Purge de cache",
  create_dns: "Adicionar DNS",
  update_dns: "Editar DNS",
  update_rule: "Editar rule",
  toggle_rule: "Habilitar/desabilitar rule",
  delete_rule: "Excluir rule",
};

const GMUD_EVENT_LABEL: Record<string, string> = {
  criacao: "Criação",
  aprovacao: "Aprovação",
  rejeicao: "Rejeição",
  mudanca_status: "Mudança de status",
  exclusao: "Exclusão",
  email_enviado: "E-mail enviado",
  email_erro: "Erro de e-mail",
  erro: "Erro",
};

const VULN_EVENT_LABEL: Record<string, string> = {
  mudanca_status: "Mudança de status",
  mudanca_departamento: "Depto. responsável",
  solicitacao_aprovacao: "Solicitação de aprovação",
  aprovacao: "Aprovação",
  rejeicao: "Rejeição",
  criacao: "Criação",
  mudanca_data: "Mudança de data",
};

const API_PROVIDER_LABEL: Record<string, string> = {
  cloudflare: "Cloudflare",
  sophos: "Sophos",
  qradar: "QRadar",
  gophish: "Gophish",
  zabbix: "Zabbix",
  sendgrid: "SendGrid",
  dast_scanner: "DAST Scanner",
  dast_ad_ldap: "DAST · AD/LDAP",
  shadowit_smb: "Shadow IT · SMB",
  "ranking-ia": "Ranking IA",
  privacy_tools: "Privacy Tools",
  purview_dlp: "Purview DLP",
  disponibilidade_alerts: "Alertas de disponibilidade",
  alerts_recipients: "Destinatários de alertas",
  azure_devops_sast: "SAST · Azure DevOps",
  gitea_sast: "SAST · Gitea",
};

const LOGIN_METHOD_LABEL = (m: string | null) =>
  m === "sso_azure" ? "SSO Azure" : m === "invite" ? "Convite (1º acesso)" : "E-mail e senha";
const LOGOUT_REASON_LABEL: Record<string, string> = {
  manual: "manual",
  inactivity: "por inatividade (8h)",
  expired: "por expiração (24h)",
};

const moduleLabel = (mod: string) =>
  mod === "upload-config" ? "Configuração de bloqueio" : (MODULE_BY_SLUG[mod]?.short ?? mod);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")}s`;
}

const fmtTime = (iso: string | number) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtFull = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function fmtAgo(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)}d`;
}

function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return "Hoje";
  if (t >= startToday - 86_400_000) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function parseDevice(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android (celular)";
  if (/Android/i.test(ua)) return "Android (tablet)";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desconhecido";
}

function parseBrowser(ua: string | null): string {
  if (!ua) return "—";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Outro";
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// ─── Geolocalização de IP (só ao abrir o detalhe de um acesso) ───────────────

type GeoResult = { country_name: string; country_code: string; city: string; org: string };
const geoCache = new Map<string, GeoResult | null>();

function isPrivateIp(ip: string): boolean {
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    ip === "localhost"
  );
}

async function fetchGeo(ip: string): Promise<GeoResult | null> {
  if (!ip || isPrivateIp(ip)) return null;
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) {
      geoCache.set(ip, null);
      return null;
    }
    const d = (await res.json()) as Partial<GeoResult>;
    const result: GeoResult = {
      country_name: d.country_name ?? "—",
      country_code: d.country_code ?? "",
      city: d.city ?? "—",
      org: d.org ?? "—",
    };
    geoCache.set(ip, result);
    return result;
  } catch {
    geoCache.set(ip, null);
    return null;
  }
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// ─── Normalização: cada tabela vira o mesmo formato de evento ────────────────

function fromSysAudit(l: SystemAuditLog): LogEvent {
  return {
    key: `sysaudit:${l.id}`,
    src: "sysaudit",
    at: l.created_at,
    title: `${SYS_ACTION_LABEL[l.acao] ?? l.acao} · ${moduleLabel(l.modulo)}`,
    sub: l.mensagem_erro ? `${l.descricao} — ${l.mensagem_erro}` : l.descricao,
    who: l.usuario_nome ?? l.usuario_email ?? "—",
    status: l.status === "error" ? "err" : "ok",
    facet: [l.modulo, moduleLabel(l.modulo)],
    raw: l,
  };
}

function fromAccess(l: AccessLog): LogEvent {
  const isLogout = l.event_type === "logout";
  const title = isLogout
    ? `Logout ${LOGOUT_REASON_LABEL[l.logout_reason ?? ""] ?? ""}`.trim()
    : l.status === "error"
      ? "Login falhou"
      : "Login";
  const device = `${parseBrowser(l.user_agent)} em ${parseDevice(l.user_agent)}`;
  const method = isLogout ? null : LOGIN_METHOD_LABEL(l.login_method);
  return {
    key: `acessos:${l.id}`,
    src: "acessos",
    at: l.created_at,
    title,
    sub: l.error_message
      ? `${method ?? ""} · ${l.error_message}`
      : [method, device].filter(Boolean).join(" · "),
    who: l.full_name ?? l.email,
    status: l.status === "error" ? "err" : "ok",
    facet: isLogout
      ? ["logout", "Logout"]
      : [l.login_method ?? "email", method ?? "E-mail e senha"],
    raw: l,
  };
}

function fromImport(l: ImportLog, names: Map<string, string>): LogEvent {
  const counts = `${l.imported_count.toLocaleString("pt-BR")} importados, ${l.ignored_count.toLocaleString("pt-BR")} ignorados`;
  return {
    key: `imports:${l.id}`,
    src: "imports",
    at: l.created_at,
    title: `Importação · ${moduleLabel(l.module)}`,
    sub: [l.filename, l.status === "error" && l.message ? l.message : counts]
      .filter(Boolean)
      .join(" · "),
    who: (l.created_by && names.get(l.created_by)) || "—",
    status: l.status === "error" ? "err" : l.status === "partial" ? "warn" : "ok",
    facet: [l.module, moduleLabel(l.module)],
    raw: l,
  };
}

function fromApi(l: ApiLog): LogEvent {
  const prov = API_PROVIDER_LABEL[l.provider] ?? l.provider;
  return {
    key: `apis:${l.id}`,
    src: "apis",
    at: l.created_at,
    title: prov,
    sub: [l.http_status ? `HTTP ${l.http_status}` : null, l.message, fmtDuration(l.duration_ms)]
      .filter((v) => v && v !== "—")
      .join(" · "),
    who: "sistema",
    status: l.status === "error" ? "err" : "ok",
    facet: [l.provider, prov],
    raw: l,
  };
}

function fromEmail(l: EmailLog): LogEvent {
  return {
    key: `emails:${l.id}`,
    src: "emails",
    at: l.created_at,
    title: l.subject ?? l.template ?? "E-mail",
    sub: [l.template, l.error_message].filter(Boolean).join(" · "),
    who: l.to_email,
    status: l.status === "error" ? "err" : "ok",
    facet: l.template ? [l.template, l.template] : ["—", "Sem template"],
    raw: l,
  };
}

function fromCfAudit(l: CfAuditLog): LogEvent {
  return {
    key: `audit:${l.id}`,
    src: "audit",
    at: l.created_at,
    title: CF_ACTION_LABEL[l.action] ?? l.action,
    sub: [l.zone_name ?? l.zone_id, l.message].filter(Boolean).join(" · "),
    who: l.user_email ?? "—",
    status: l.status === "error" ? "err" : "ok",
    facet: [l.action, CF_ACTION_LABEL[l.action] ?? l.action],
    raw: l,
  };
}

function fromGmud(l: GmudLog): LogEvent {
  const ev = GMUD_EVENT_LABEL[l.tipo_evento] ?? l.tipo_evento;
  return {
    key: `gmud:${l.id}`,
    src: "gmud",
    at: l.created_at,
    title: l.gmud_titulo ? `${ev} · ${l.gmud_titulo}` : ev,
    sub: l.descricao,
    who: l.usuario_nome ?? l.usuario_email ?? "sistema",
    status: l.status === "error" ? "err" : l.status === "warning" ? "warn" : "ok",
    facet: [l.tipo_evento, ev],
    raw: l,
  };
}

function fromVuln(l: VulnLog): LogEvent {
  const ev = VULN_EVENT_LABEL[l.tipo_evento] ?? l.tipo_evento;
  return {
    key: `vulns:${l.id}`,
    src: "vulns",
    at: l.created_at,
    title: l.fqdn ? `${ev} · ${l.fqdn}` : ev,
    sub: l.descricao,
    who: l.usuario_nome ?? l.usuario_email ?? "sistema",
    status: l.status === "error" ? "err" : l.status === "warning" ? "warn" : "ok",
    facet: [l.tipo_evento, ev],
    raw: l,
  };
}

const FACET_LABEL: Partial<Record<SrcKey, string>> = {
  sysaudit: "Todos os módulos",
  acessos: "Todos os tipos",
  imports: "Todos os módulos",
  apis: "Todos os provedores",
  emails: "Todos os templates",
  audit: "Todas as operações",
  gmud: "Todos os eventos",
  vulns: "Todos os eventos",
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  .lg-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .lg-root * { box-sizing:border-box; }
  .lg-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .lg-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .lg-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .lg-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .lg-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; text-align:left; background:transparent; border:0; color:inherit; font:inherit; position:relative; }
  button.lg-kpi { cursor:pointer; }
  button.lg-kpi:hover { background:var(--v2-hover); }
  button.lg-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:18px; right:18px; bottom:0; height:2px; background:var(--v2-accent); border-radius:2px; }
  .lg-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .lg-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .lg-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .lg-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .lg-layout { display:grid; grid-template-columns:236px minmax(0, 1fr); gap:16px; align-items:start; }
  @media (max-width: 960px) { .lg-layout { grid-template-columns:minmax(0, 1fr); } }
  .lg-rail { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; padding:6px; display:grid; gap:2px; position:sticky; top:16px; }
  .lg-rail-h { font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); padding:10px 10px 4px; }
  .lg-rail button { display:grid; grid-template-columns:18px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:8px 10px; border:0; border-radius:8px; background:transparent; color:var(--v2-fg-2); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .lg-rail button:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .lg-rail button[aria-current="true"] { background:color-mix(in oklch, var(--v2-accent) 12%, transparent); color:var(--v2-fg); font-weight:500; }
  .lg-rail button[aria-current="true"] svg { color:var(--v2-accent); }
  .lg-rail .n { font:500 11.5px var(--font-data); color:var(--v2-fg-3); }
  .lg-rail .new { font:600 11px var(--font-data); color:#fff; background:var(--v2-crit); border-radius:99px; padding:1px 6px; }
  .lg-rail-foot { border-top:1px solid var(--v2-line); margin-top:6px; padding:10px; font-size:12px; color:var(--v2-fg-3); line-height:1.6; }
  .lg-rail-foot a { color:var(--v2-accent); text-decoration:none; }
  .lg-rail-foot a:hover { text-decoration:underline; }

  .lg-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .lg-panel-h { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--v2-line); }
  .lg-panel-h > b { font-size:14px; font-weight:600; margin-right:4px; }
  .lg-panel-h > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .lg-panel-h > b code { font-family:var(--font-data); font-size:12px; }
  .lg-input { margin-left:auto; width:240px; max-width:100%; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; }
  .lg-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .lg-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:13px var(--font-ui); padding:0 8px; max-width:220px; }
  .lg-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); }
  .lg-seg button { height:26px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .lg-seg button:hover { color:var(--v2-fg); }
  .lg-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }

  .lg-vol { padding:12px 16px 6px; border-bottom:1px solid var(--v2-line); }
  .lg-vol-t { display:flex; justify-content:space-between; font-size:12px; color:var(--v2-fg-3); margin-bottom:8px; }
  .lg-vol-t b { color:var(--v2-fg-2); font-weight:500; }
  .lg-bars { display:grid; grid-template-columns:repeat(24, 1fr); gap:3px; align-items:end; height:56px; }
  .lg-bars span { display:flex; flex-direction:column-reverse; gap:2px; height:100%; }
  .lg-bars i { display:block; border-radius:3px 3px 0 0; background:color-mix(in oklch, var(--v2-accent) 55%, transparent); }
  .lg-bars i.e { background:var(--v2-crit); border-radius:3px; }
  .lg-vol-ax { display:flex; justify-content:space-between; font:400 11px var(--font-data); color:var(--v2-fg-3); margin-top:4px; }

  .lg-tbl { overflow-x:auto; }
  .lg-tbl table { width:100%; border-collapse:collapse; font-size:13px; }
  .lg-tbl th { text-align:left; font-weight:500; font-size:12.5px; color:var(--v2-fg-3); padding:10px 16px; border-bottom:1px solid var(--v2-line); white-space:nowrap; position:sticky; top:0; background:var(--v2-surface); }
  .lg-tbl td { padding:9px 16px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .lg-tbl tr.row { cursor:pointer; }
  .lg-tbl tr.row:hover td { background:var(--v2-hover); }
  .lg-tbl tr.err td:first-child { box-shadow:inset 3px 0 0 var(--v2-crit); }
  .lg-tbl tr.day td { background:var(--v2-surface-2); font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); padding:7px 16px; }
  .lg-when { font:400 12.5px var(--font-data); white-space:nowrap; color:var(--v2-fg-2); }
  .lg-when small { display:block; font-size:11px; color:var(--v2-fg-3); }
  .lg-src { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; }
  .lg-src svg { color:var(--v2-fg-3); }
  .lg-ev b { display:block; font-weight:500; font-size:13px; }
  .lg-ev small { display:block; font-size:12px; color:var(--v2-fg-3); max-width:560px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lg-who { font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
  .lg-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .lg-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .lg-tag { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; border:1px solid var(--v2-line); font-size:12px; color:var(--v2-fg-2); }
  .lg-empty { padding:28px 16px; color:var(--v2-fg-3); font-size:13px; }
  .lg-more { padding:12px 16px; font-size:12.5px; color:var(--v2-fg-3); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .lg-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .lg-btn:hover { background:var(--v2-hover); }

  .lg-json { margin:0; padding:12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:12px/1.6 var(--font-data); color:var(--v2-fg-2); white-space:pre-wrap; overflow-wrap:anywhere; }
  .lg-json.err { border-color:color-mix(in oklch, var(--v2-crit) 35%, transparent); background:color-mix(in oklch, var(--v2-crit) 8%, transparent); }
  .lg-chg { width:100%; border-collapse:collapse; font-size:12.5px; }
  .lg-chg th { text-align:left; font-weight:500; color:var(--v2-fg-3); padding:6px 8px; border-bottom:1px solid var(--v2-line); }
  .lg-chg td { padding:6px 8px; border-bottom:1px solid var(--v2-line); font-family:var(--font-data); font-size:12px; overflow-wrap:anywhere; }
  .lg-chg td.b { color:color-mix(in oklch, var(--v2-crit) 70%, var(--v2-fg)); text-decoration:line-through; }
  .lg-chg td.a { color:color-mix(in oklch, var(--v2-ok) 70%, var(--v2-fg)); }
  .lg-chips { display:flex; flex-wrap:wrap; gap:6px; }
`;

// ─── LogsDashboard ────────────────────────────────────────────────────────────

const PAGE = 200;
type Period = "24h" | "7d" | "all";
const PERIOD_MIN: Record<Period, number> = {
  "24h": 1440,
  "7d": 10080,
  all: Number.POSITIVE_INFINITY,
};

export function LogsDashboard() {
  const queryClient = useQueryClient();

  const imports = useQuery({
    queryKey: ["import-logs"],
    queryFn: async (): Promise<ImportLog[]> => {
      const { data, error } = await supabase
        .from("import_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ImportLog[];
    },
  });

  // Nome de quem importou (import_logs só guarda o id)
  const importUserIds = React.useMemo(
    () => [...new Set((imports.data ?? []).map((l) => l.created_by).filter(Boolean) as string[])],
    [imports.data],
  );
  const { data: importProfiles } = useQuery({
    queryKey: ["import-logs", "profiles", importUserIds],
    enabled: importUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", importUserIds);
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const apis = useQuery({
    queryKey: ["api-logs"],
    queryFn: async (): Promise<ApiLog[]> => {
      const { data, error } = await supabase
        .from("api_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ApiLog[];
    },
  });

  const audits = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async (): Promise<CfAuditLog[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as CfAuditLog[];
    },
    refetchInterval: 30_000,
  });

  const emails = useQuery({
    queryKey: ["email-logs"],
    queryFn: async (): Promise<EmailLog[]> => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as EmailLog[];
    },
    refetchInterval: 30_000,
  });

  const gmudLogs = useQuery({
    queryKey: ["gmud-logs"],
    queryFn: async (): Promise<GmudLog[]> => {
      const { data, error } = await supabase
        .from("gmud_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as GmudLog[];
    },
  });

  const vulnLogs = useQuery({
    queryKey: ["vuln-logs"],
    queryFn: async (): Promise<VulnLog[]> => {
      const { data, error } = await supabase
        .from("vuln_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as VulnLog[];
    },
  });

  const accessLogs = useQuery({
    queryKey: ["auth-access-logs"],
    queryFn: async (): Promise<AccessLog[]> => {
      const { data, error } = await supabase
        .from("auth_access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AccessLog[];
    },
    refetchInterval: 5_000,
  });

  const systemAuditLogs = useQuery({
    queryKey: ["system-audit-log"],
    queryFn: async (): Promise<SystemAuditLog[]> => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SystemAuditLog[];
    },
    refetchInterval: 30_000,
  });

  // Acessos em tempo real
  React.useEffect(() => {
    const channel = supabase
      .channel("auth-access-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auth_access_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["auth-access-logs"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Popula o histórico de acessos uma vez (só admin global; falha silenciosa)
  const seedFn = useServerFn(seedAuthAccessHistory);
  const seededRef = React.useRef(false);
  const refetchAccess = accessLogs.refetch;
  React.useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    seedFn()
      .then((res) => {
        if (res?.seeded && res.seeded > 0) refetchAccess();
      })
      .catch(() => {});
  }, [seedFn, refetchAccess]);

  // "Agora" de referência — avança a cada minuto
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [src, setSrc] = React.useState<SrcKey | "all">("all");
  const [period, setPeriod] = React.useState<Period>("24h");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "err">("all");
  const [facet, setFacet] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Selos de "erro novo": quando cada fonte foi vista pela última vez (persistido)
  const [seenAt, setSeenAt] = React.useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("logs_tab_seen_at") ?? "{}");
    } catch {
      return {};
    }
  });
  const mountedAtRef = React.useRef(new Date().toISOString());
  function markSeen(key: string) {
    const ts = new Date().toISOString();
    setSeenAt((prev) => {
      const next = { ...prev, [key]: ts };
      try {
        localStorage.setItem("logs_tab_seen_at", JSON.stringify(next));
      } catch {
        /* armazenamento indisponível */
      }
      return next;
    });
  }
  function selectSource(next: SrcKey | "all") {
    if (src !== "all") markSeen(src);
    if (next !== "all") markSeen(next);
    setSrc(next);
    setFacet("all");
    setLimit(PAGE);
  }

  const names = React.useMemo(
    () => new Map((importProfiles ?? []).map((p) => [p.id, p.full_name || p.email || ""])),
    [importProfiles],
  );

  const events = React.useMemo(() => {
    const all: LogEvent[] = [
      ...(systemAuditLogs.data ?? []).map(fromSysAudit),
      ...(accessLogs.data ?? []).map(fromAccess),
      ...(imports.data ?? []).map((l) => fromImport(l, names)),
      ...(apis.data ?? []).map(fromApi),
      ...(emails.data ?? []).map(fromEmail),
      ...(audits.data ?? []).map(fromCfAudit),
      ...(gmudLogs.data ?? []).map(fromGmud),
      ...(vulnLogs.data ?? []).map(fromVuln),
    ];
    return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [
    systemAuditLogs.data,
    accessLogs.data,
    imports.data,
    names,
    apis.data,
    emails.data,
    audits.data,
    gmudLogs.data,
    vulnLogs.data,
  ]);

  const loading =
    systemAuditLogs.isLoading &&
    accessLogs.isLoading &&
    imports.isLoading &&
    apis.isLoading &&
    emails.isLoading &&
    audits.isLoading;
  if (loading) return <ModuleLoading />;

  const countBySrc = (k: SrcKey) => events.filter((e) => e.src === k).length;
  // Acessos: qualquer evento novo conta; demais fontes: só erros
  const newCount = (k: SrcKey) => {
    if (k === src) return 0;
    const seen = seenAt[k] ?? mountedAtRef.current;
    return events.filter(
      (e) => e.src === k && e.at > seen && (k === "acessos" || e.status === "err"),
    ).length;
  };

  const since24 = new Date(now - 86_400_000).toISOString();
  const last24 = events.filter((e) => e.at >= since24);
  const err24 = last24.filter((e) => e.status === "err");
  const srcWithNew = SOURCES.filter((s) => s.key !== "acessos" && newCount(s.key) > 0).length;
  const loginAttempts24 = last24.filter(
    (e) => e.src === "acessos" && (e.raw as AccessLog).event_type === "login",
  );
  const loginFails24 = loginAttempts24.filter((e) => e.status === "err").length;

  const bySrc = src === "all" ? events : events.filter((e) => e.src === src);
  const facetOptions =
    src === "all"
      ? []
      : [
          ...new Map(bySrc.filter((e) => e.facet).map((e) => [e.facet![0], e.facet![1]])).entries(),
        ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const periodSince = Number.isFinite(PERIOD_MIN[period])
    ? new Date(now - PERIOD_MIN[period] * 60_000).toISOString()
    : "";
  const q = search.trim().toLowerCase();
  const rows = bySrc.filter(
    (e) =>
      (!periodSince || e.at >= periodSince) &&
      (statusFilter === "all" || e.status === "err") &&
      (facet === "all" || e.facet?.[0] === facet) &&
      (!q || `${e.title} ${e.sub} ${e.who}`.toLowerCase().includes(q)),
  );
  const shown = rows.slice(0, limit);

  // Volume por hora (últimas 24h) da fonte selecionada
  const hours = Array.from({ length: 24 }, (_, i) => {
    const a = now - (24 - i) * 3_600_000;
    const b = a + 3_600_000;
    const ev = bySrc.filter((e) => {
      const t = new Date(e.at).getTime();
      return t >= a && t < b;
    });
    return { a, n: ev.length, e: ev.filter((x) => x.status === "err").length };
  });
  const maxH = Math.max(1, ...hours.map((h) => h.n));
  const errH = hours.reduce((s, h) => s + h.e, 0);

  const selected = events.find((e) => e.key === openKey) ?? null;
  const openEvent = (k: string) => {
    setOpenKey(k);
    setSheetOpen(true);
  };

  const head = src === "all" ? null : SRC_BY_KEY[src];
  const colCount = src === "all" ? 5 : 4;
  let lastDay = "";

  return (
    <div className="lg-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="lg-ph-title">Central de Logs</h1>
        <p className="lg-ph-sub">
          Tudo o que aconteceu no {APP_NAME} em um só lugar: ações, acessos, importações, integrações e
          e-mails
        </p>
      </div>

      <div className="lg-kpis">
        <div className="lg-kpi">
          <span className="lg-kpi-label">Eventos · 24h</span>
          <span className="lg-kpi-value">{last24.length.toLocaleString("pt-BR")}</span>
          <span className="lg-kpi-foot">em {new Set(last24.map((e) => e.src)).size} fontes</span>
        </div>
        <button
          className="lg-kpi"
          aria-pressed={statusFilter === "err" && src === "all"}
          onClick={() => {
            selectSource("all");
            setStatusFilter((s) => (s === "err" && src === "all" ? "all" : "err"));
            setPeriod("24h");
          }}
        >
          <span className="lg-kpi-label">
            {err24.length > 0 && (
              <span className="lg-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Erros · 24h
          </span>
          <span className="lg-kpi-value">{err24.length}</span>
          <span className="lg-kpi-foot">
            {srcWithNew
              ? `${srcWithNew} ${srcWithNew === 1 ? "fonte" : "fontes"} com erro novo`
              : "nenhum erro novo"}
          </span>
        </button>
        <button
          className="lg-kpi"
          aria-pressed={src === "acessos" && statusFilter === "err"}
          onClick={() => {
            selectSource("acessos");
            setStatusFilter("err");
            setPeriod("24h");
          }}
        >
          <span className="lg-kpi-label">Logins com falha · 24h</span>
          <span className="lg-kpi-value">{loginFails24}</span>
          <span className="lg-kpi-foot">de {loginAttempts24.length} tentativas</span>
        </button>
        <button
          className="lg-kpi"
          aria-pressed={src === "sysaudit" && statusFilter === "all"}
          onClick={() => {
            selectSource("sysaudit");
            setStatusFilter("all");
            setPeriod("24h");
          }}
        >
          <span className="lg-kpi-label">Ações de usuários · 24h</span>
          <span className="lg-kpi-value">{last24.filter((e) => e.src === "sysaudit").length}</span>
          <span className="lg-kpi-foot">auditoria do sistema</span>
        </button>
      </div>

      <div className="lg-layout">
        <nav className="lg-rail" aria-label="Fontes de log">
          <div className="lg-rail-h">Fontes</div>
          <button aria-current={src === "all"} onClick={() => selectSource("all")}>
            <List size={16} />
            <span>Todas as fontes</span>
            <span className="n">{events.length}</span>
          </button>
          {SOURCES.map((s) => {
            const Icon = s.icon;
            const n = newCount(s.key);
            return (
              <button key={s.key} aria-current={src === s.key} onClick={() => selectSource(s.key)}>
                <Icon size={16} />
                <span>{s.label}</span>
                {n > 0 ? (
                  <span
                    className="new"
                    title={`${n} ${s.key === "acessos" ? "evento" : "erro"}${n > 1 ? "s" : ""} novo${n > 1 ? "s" : ""} desde a última visita`}
                  >
                    {n}
                  </span>
                ) : (
                  <span className="n">{countBySrc(s.key)}</span>
                )}
              </button>
            );
          })}
          <div className="lg-rail-foot">
            Situação dos cron jobs e dos domínios/SSL fica nos módulos próprios:{" "}
            <Link to="/app/$module" params={{ module: "cron-jobs" }}>
              Cron Jobs
            </Link>{" "}
            ·{" "}
            <Link to="/app/$module" params={{ module: "dominios-ssl" }}>
              Domínios/SSL
            </Link>
          </div>
        </nav>

        <section className="lg-panel">
          <div className="lg-panel-h">
            <b>
              {head ? head.label : "Todas as fontes"}{" "}
              <span>
                · {rows.length.toLocaleString("pt-BR")} eventos
                {head && (
                  <>
                    {" "}
                    · <code>{head.table}</code>
                  </>
                )}
              </span>
            </b>
            <div className="lg-seg" role="group" aria-label="Período">
              {(
                [
                  ["24h", "24h"],
                  ["7d", "7 dias"],
                  ["all", "Tudo"],
                ] as Array<[Period, string]>
              ).map(([k, l]) => (
                <button
                  key={k}
                  aria-pressed={period === k}
                  onClick={() => {
                    setPeriod(k);
                    setLimit(PAGE);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="lg-seg" role="group" aria-label="Status">
              {(
                [
                  ["all", "Todos"],
                  ["err", "Erros"],
                ] as Array<["all" | "err", string]>
              ).map(([k, l]) => (
                <button
                  key={k}
                  aria-pressed={statusFilter === k}
                  onClick={() => {
                    setStatusFilter(k);
                    setLimit(PAGE);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            {src !== "all" && facetOptions.length > 1 && (
              <select
                className="lg-select"
                aria-label="Filtro da fonte"
                value={facet}
                onChange={(e) => {
                  setFacet(e.target.value);
                  setLimit(PAGE);
                }}
              >
                <option value="all">{FACET_LABEL[src] ?? "Todos"}</option>
                {facetOptions.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            <input
              className="lg-input"
              placeholder="Buscar evento, pessoa ou detalhe"
              aria-label="Buscar nos logs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(PAGE);
              }}
            />
          </div>

          <div className="lg-vol">
            <div className="lg-vol-t">
              <span>Volume por hora · últimas 24h</span>
              <span>
                <b>{errH}</b> {errH === 1 ? "erro" : "erros"}
              </span>
            </div>
            <div className="lg-bars">
              {hours.map((h) => (
                <span
                  key={h.a}
                  title={`${fmtTime(h.a)} · ${h.n} eventos${h.e ? ` · ${h.e} ${h.e === 1 ? "erro" : "erros"}` : ""}`}
                >
                  {h.e > 0 && <i className="e" style={{ height: `${(h.e / maxH) * 100}%` }} />}
                  <i style={{ height: `${((h.n - h.e) / maxH) * 100}%` }} />
                </span>
              ))}
            </div>
            <div className="lg-vol-ax">
              <span>{fmtTime(now - 86_400_000)}</span>
              <span>{fmtTime(now - 43_200_000)}</span>
              <span>agora</span>
            </div>
          </div>

          <div className="lg-tbl">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  {src === "all" && <th>Fonte</th>}
                  <th>Evento</th>
                  <th>Quem</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="lg-empty">
                      {bySrc.length === 0
                        ? "Nenhum evento registrado nesta fonte."
                        : "Nenhum evento com esses filtros."}
                    </td>
                  </tr>
                ) : (
                  shown.map((e) => {
                    const day = dayLabel(e.at, now);
                    const sep = day !== lastDay;
                    lastDay = day;
                    const s = SRC_BY_KEY[e.src];
                    const Icon = s.icon;
                    const st = STATUS[e.status];
                    return (
                      <React.Fragment key={e.key}>
                        {sep && (
                          <tr className="day">
                            <td colSpan={colCount}>{day}</td>
                          </tr>
                        )}
                        <tr
                          className={`row${e.status === "err" ? " err" : ""}`}
                          tabIndex={0}
                          onClick={() => openEvent(e.key)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") openEvent(e.key);
                          }}
                        >
                          <td className="lg-when">
                            {fmtTime(e.at)}
                            <small>{fmtAgo(e.at, now)}</small>
                          </td>
                          {src === "all" && (
                            <td>
                              <span className="lg-src">
                                <Icon size={14} />
                                {s.label}
                              </span>
                            </td>
                          )}
                          <td className="lg-ev">
                            <b>{e.title}</b>
                            {e.sub && <small title={e.sub}>{e.sub}</small>}
                          </td>
                          <td className="lg-who" title={e.who}>
                            {e.who}
                          </td>
                          <td>
                            <span
                              className="lg-pill"
                              style={{ "--c": st.color } as React.CSSProperties}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="lg-more">
              <span>
                Mostrando {shown.length.toLocaleString("pt-BR")} de{" "}
                {rows.length.toLocaleString("pt-BR")} · carrega os 200–500 mais recentes de cada
                fonte
              </span>
              {rows.length > shown.length && (
                <button className="lg-btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Mostrar mais
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <DetailSheet
        open={sheetOpen && !!selected}
        onOpenChange={setSheetOpen}
        eyebrow={selected ? `${SRC_BY_KEY[selected.src].table} · ${fmtFull(selected.at)}` : ""}
        title={selected?.title ?? ""}
        badges={
          selected && (
            <>
              <span
                className="lg-pill"
                style={{ "--c": STATUS[selected.status].color } as React.CSSProperties}
              >
                {STATUS[selected.status].label}
              </span>
              <span className="lg-tag">{SRC_BY_KEY[selected.src].label}</span>
            </>
          )
        }
        footer={
          <button className="lg-btn" onClick={() => setSheetOpen(false)}>
            Fechar
          </button>
        }
      >
        {selected && (
          <div className="lg-root" style={{ gap: 20 }}>
            <EventDetail event={selected} />
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

// ─── Detalhe do evento (painel lateral) ──────────────────────────────────────

type Item = [string, React.ReactNode, boolean?];

function ErrorBlock({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <DetailSection title="Erro">
      <pre className="lg-json err">{text}</pre>
    </DetailSection>
  );
}

function RawBlock({ data, title = "Dados brutos" }: { data: unknown; title?: string }) {
  const rec = asRecord(data);
  if (!rec || Object.keys(rec).length === 0) return null;
  return (
    <DetailSection title={title}>
      <pre className="lg-json">{JSON.stringify(rec, null, 2)}</pre>
    </DetailSection>
  );
}

function EventDetail({ event }: { event: LogEvent }) {
  switch (event.src) {
    case "sysaudit": {
      const l = event.raw as SystemAuditLog;
      return (
        <>
          <ErrorBlock text={l.mensagem_erro} />
          <DetailSection title="Ação">
            <DetailList
              items={[
                ["Descrição", l.descricao],
                ["Módulo", moduleLabel(l.modulo)],
                ["Ação", SYS_ACTION_LABEL[l.acao] ?? l.acao],
                [
                  "Usuário",
                  l.usuario_nome
                    ? `${l.usuario_nome} (${l.usuario_email ?? "—"})`
                    : (l.usuario_email ?? "—"),
                ],
              ]}
            />
          </DetailSection>
          <RawBlock data={l.detalhes} />
        </>
      );
    }
    case "acessos":
      return <AccessDetail log={event.raw as AccessLog} />;
    case "imports": {
      const l = event.raw as ImportLog;
      return (
        <>
          {l.status === "error" && <ErrorBlock text={l.message} />}
          <DetailSection title="Importação">
            <DetailList
              items={[
                ["Módulo", moduleLabel(l.module)],
                ["Arquivo", l.filename ?? "—", true],
                ["Por", event.who],
                ["Total de linhas", l.total_count.toLocaleString("pt-BR")],
                ["Importadas", l.imported_count.toLocaleString("pt-BR")],
                ["Ignoradas", l.ignored_count.toLocaleString("pt-BR")],
                ...(l.status !== "error" && l.message ? ([["Mensagem", l.message]] as Item[]) : []),
              ]}
            />
          </DetailSection>
        </>
      );
    }
    case "apis": {
      const l = event.raw as ApiLog;
      return (
        <>
          {l.status === "error" && <ErrorBlock text={l.message} />}
          <DetailSection title="Chamada">
            <DetailList
              items={[
                ["Provedor", API_PROVIDER_LABEL[l.provider] ?? l.provider],
                ["Identificador", l.provider, true],
                ["HTTP", l.http_status ?? "—", true],
                ["Duração", fmtDuration(l.duration_ms), true],
                ...(l.status !== "error" && l.message ? ([["Mensagem", l.message]] as Item[]) : []),
              ]}
            />
          </DetailSection>
        </>
      );
    }
    case "emails": {
      const l = event.raw as EmailLog;
      return (
        <>
          <ErrorBlock text={l.error_message} />
          <DetailSection title="E-mail">
            <DetailList
              items={[
                ["Para", l.to_email],
                ["Assunto", l.subject ?? "—"],
                ["Template", l.template ?? "—", true],
                ...(l.related_gmud_id ? ([["GMUD", l.related_gmud_id, true]] as Item[]) : []),
              ]}
            />
          </DetailSection>
        </>
      );
    }
    case "audit":
      return <CfAuditDetail log={event.raw as CfAuditLog} />;
    case "gmud": {
      const l = event.raw as GmudLog;
      return (
        <>
          <DetailSection title="Evento">
            <DetailList
              items={[
                ["Descrição", l.descricao],
                ["GMUD", l.gmud_titulo ?? l.gmud_id ?? "—"],
                ["Evento", GMUD_EVENT_LABEL[l.tipo_evento] ?? l.tipo_evento],
                ["Usuário", l.usuario_nome ?? l.usuario_email ?? "sistema"],
              ]}
            />
          </DetailSection>
          <RawBlock data={l.detalhes} />
        </>
      );
    }
    case "vulns": {
      const l = event.raw as VulnLog;
      return (
        <>
          <DetailSection title="Evento">
            <DetailList
              items={[
                ["Descrição", l.descricao],
                ["FQDN", l.fqdn ?? "—", true],
                ["Evento", VULN_EVENT_LABEL[l.tipo_evento] ?? l.tipo_evento],
                ["Usuário", l.usuario_nome ?? l.usuario_email ?? "sistema"],
              ]}
            />
          </DetailSection>
          <RawBlock data={l.detalhes} />
        </>
      );
    }
  }
}

function AccessDetail({ log }: { log: AccessLog }) {
  const [geo, setGeo] = React.useState<GeoResult | null | undefined>(() =>
    log.ip && geoCache.has(log.ip) ? geoCache.get(log.ip) : undefined,
  );
  React.useEffect(() => {
    if (!log.ip || isPrivateIp(log.ip) || geoCache.has(log.ip)) return;
    let alive = true;
    fetchGeo(log.ip).then((g) => alive && setGeo(g));
    return () => {
      alive = false;
    };
  }, [log.ip]);

  const local = !log.ip || isPrivateIp(log.ip);
  const isLogout = log.event_type === "logout";
  return (
    <>
      <ErrorBlock text={log.error_message} />
      <DetailSection title="Sessão">
        <DetailList
          items={[
            ["Pessoa", log.full_name ?? "—"],
            ["E-mail", log.email],
            ["Papel", log.role ?? "—"],
            isLogout
              ? ["Motivo do logout", LOGOUT_REASON_LABEL[log.logout_reason ?? ""] ?? "—"]
              : ["Método", LOGIN_METHOD_LABEL(log.login_method)],
          ]}
        />
      </DetailSection>
      <DetailSection title="Origem">
        <DetailList
          items={[
            ["IP", log.ip ? `${log.ip}${local ? " (rede local)" : ""}` : "—", true],
            [
              "Localização",
              local
                ? "N/A (IP local)"
                : geo === undefined
                  ? "Buscando…"
                  : geo === null
                    ? "Não identificada"
                    : `${countryFlag(geo.country_code)} ${geo.country_name} · ${geo.city}`,
            ],
            ...(geo ? ([["Provedor (ISP)", geo.org]] as Item[]) : []),
            ["Dispositivo", `${parseDevice(log.user_agent)} · ${parseBrowser(log.user_agent)}`],
            ["User agent", log.user_agent ?? "—", true],
          ]}
        />
      </DetailSection>
    </>
  );
}

type ChangeEntry = { path: string; before: unknown; after: unknown };

function CfAuditDetail({ log }: { log: CfAuditLog }) {
  const d = asRecord(log.details) ?? {};
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const changes = Array.isArray(d.changes) ? (d.changes as ChangeEntry[]) : null;
  let fields: Item[] = [];
  let extra: React.ReactNode = null;

  if (log.action === "purge_cache") {
    const hosts = Array.isArray(d.hostnames) ? (d.hostnames as string[]) : [];
    fields = [["Modo", d.purge_everything ? "Purge total da zona" : "Hostnames específicos"]];
    if (!d.purge_everything && hosts.length)
      extra = (
        <DetailSection title="Hosts purgados">
          <div className="lg-chips">
            {hosts.map((h) => (
              <span key={h} className="lg-tag" style={{ fontFamily: "var(--font-data)" }}>
                {h}
              </span>
            ))}
          </div>
        </DetailSection>
      );
  } else if (log.action === "create_dns" || log.action === "update_dns") {
    fields = [
      ["Tipo", show(d.type), true],
      ["Nome", show(d.name), true],
      ["Conteúdo", show(d.content), true],
      ["TTL", d.ttl === 1 ? "Auto" : show(d.ttl), true],
      ["Proxy", d.proxied ? "Ativo" : "Desativado"],
      ["Record ID", show(d.record_id), true],
    ];
  } else if (
    log.action === "update_rule" ||
    log.action === "toggle_rule" ||
    log.action === "delete_rule"
  ) {
    fields = [
      ["Categoria", show(d.category)],
      ["Descrição", show(d.description)],
      ...(log.action === "toggle_rule"
        ? ([["Novo status", d.enabled ? "Habilitada" : "Desabilitada"]] as Item[])
        : []),
    ];
  }

  return (
    <>
      {log.status === "error" && <ErrorBlock text={log.message} />}
      <DetailSection title="Operação">
        <DetailList
          items={[
            ["Operação", CF_ACTION_LABEL[log.action] ?? log.action],
            ["Zona", log.zone_name ?? log.zone_id ?? "—", true],
            ["Usuário", log.user_email ?? "—"],
            ["Duração", fmtDuration(log.duration_ms), true],
            ...(log.status !== "error" && log.message
              ? ([["Mensagem", log.message]] as Item[])
              : []),
            ...fields,
          ]}
        />
      </DetailSection>
      {extra}
      {(log.action === "update_dns" || log.action === "update_rule") && (
        <DetailSection title="O que mudou">
          {changes && changes.length ? (
            <table className="lg-chg">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Antes</th>
                  <th>Depois</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.path}>
                    <td>{c.path}</td>
                    <td className="b">{show(c.before)}</td>
                    <td className="a">{show(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--v2-fg-3)" }}>
              Nenhum campo alterado (reenviado igual).
            </div>
          )}
        </DetailSection>
      )}
      {!fields.length && !extra && <RawBlock data={log.details} />}
    </>
  );
}
