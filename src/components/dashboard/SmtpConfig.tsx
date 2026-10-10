import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSmtpConfig, upsertSmtpConfig, sendTestSmtpEmail } from "@/lib/smtp.functions";
import {
  listEmailTemplates,
  upsertEmailTemplate,
  type EmailTemplateVariable,
} from "@/lib/email-templates.functions";
import { useAuth } from "@/lib/auth-context";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { dialogStyle } from "./ColaboradoresPanel";
import { Check, ChevronRight, KeyRound, Send } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTemplateSkeleton(variables: EmailTemplateVariable[]): string {
  const rows = variables.map((v) => `  <p><b>${v.token}:</b> {{${v.token}}}</p>`).join("\n");
  return `<div style="font-family:Arial,sans-serif">\n${rows}\n</div>`;
}

function renderTemplatePreview(html: string, variables: EmailTemplateVariable[]): string {
  let out = html;
  for (const v of variables) out = out.split(`{{${v.token}}}`).join(v.sample);
  return out;
}

function fmtAgo(iso: string | null | undefined, now: number) {
  if (!iso) return "nunca";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)}d`;
}

const fmtShort = (iso: string, now: number) => {
  const d = new Date(iso);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

type EmailLogRow = {
  id: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type TemplateStat = { sent: number; failed: number; last: string | null };

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  .sm-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .sm-root * { box-sizing:border-box; }
  .sm-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .sm-ph { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .sm-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .sm-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .sm-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .sm-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; text-align:left; background:transparent; border:0; color:inherit; font:inherit; }
  button.sm-kpi { cursor:pointer; }
  button.sm-kpi:hover { background:var(--v2-hover); }
  .sm-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .sm-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .sm-kpi-value.word { font-size:22px; padding:3px 0; }
  .sm-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .sm-kpi-foot { font-size:12px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sm-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .sm-subnav { display:flex; gap:4px; border-bottom:1px solid var(--v2-line); }
  .sm-subnav button { height:38px; padding:0 12px; border:0; background:transparent; color:var(--v2-fg-2); font:500 13.5px var(--font-ui); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; display:inline-flex; gap:8px; align-items:center; }
  .sm-subnav button:hover { color:var(--v2-fg); }
  .sm-subnav button[aria-selected="true"] { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .sm-subnav .c { font:500 11.5px var(--font-data); color:var(--v2-fg-3); }

  .sm-two { display:grid; grid-template-columns:minmax(0, 1.35fr) minmax(0, 1fr); gap:16px; align-items:start; }
  @media (max-width: 1000px) { .sm-two { grid-template-columns:minmax(0, 1fr); } }
  .sm-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .sm-card-h { display:flex; gap:12px; align-items:center; padding:14px 18px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; }
  .sm-card-h b { display:block; font-size:14px; font-weight:600; }
  .sm-card-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .sm-card-h .r { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .sm-card-b { display:grid; gap:14px; padding:16px 18px; }
  .sm-card-f { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid var(--v2-line); }
  .sm-sublabel { font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); }
  .sm-g2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .sm-g3 { display:grid; grid-template-columns:2fr 1fr 1fr; gap:12px; }
  @media (max-width: 600px) { .sm-g2, .sm-g3 { grid-template-columns:1fr; } }
  .sm-field { display:grid; gap:6px; font-size:12.5px; font-weight:500; color:var(--v2-fg-2); min-width:0; }
  .sm-field small { font-size:12px; font-weight:400; color:var(--v2-fg-3); line-height:1.5; }
  .sm-input, .sm-select { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; min-width:0; }
  .sm-input.mono { font-family:var(--font-data); font-size:12.5px; }
  .sm-input:focus, .sm-select:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .sm-togrow { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .sm-togrow b { display:block; font-size:13px; font-weight:500; }
  .sm-togrow small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .sm-secret { display:flex; gap:6px; }
  .sm-secret .s { flex:1; min-width:0; display:flex; align-items:center; gap:8px; height:34px; padding:0 10px; border:1px dashed var(--v2-line-strong); border-radius:8px; font-size:13px; color:var(--v2-fg-2); }
  .sm-secret .s svg { color:var(--v2-ok); flex:none; }
  .sm-secret .s.warn svg { color:var(--v2-med); }
  .sm-secret .s span { font:12px var(--font-data); color:var(--v2-fg-3); }

  .sm-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .sm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .sm-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .sm-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .sm-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .sm-btn.ghost { border-color:transparent; background:transparent; }

  .sm-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .sm-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .sm-link { font-size:12.5px; color:var(--v2-accent); text-decoration:none; display:inline-flex; gap:4px; align-items:center; }
  .sm-link:hover { text-decoration:underline; }

  .sm-sends > div { display:grid; grid-template-columns:8px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:9px 18px; border-top:1px solid var(--v2-line); font-size:13px; }
  .sm-sends > div:first-child { border-top:0; }
  .sm-sends i { width:8px; height:8px; border-radius:50%; background:var(--c); }
  .sm-sends b { display:block; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sm-sends small { display:block; font-size:12px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sm-sends time { font:12px var(--font-data); color:var(--v2-fg-3); }
  .sm-empty { padding:20px 18px; color:var(--v2-fg-3); font-size:13px; }
  .sm-errnote { margin:0 18px 16px; padding:10px 12px; border-radius:8px; background:color-mix(in oklch, var(--v2-crit) 8%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 30%, transparent); font:12px/1.5 var(--font-data); color:var(--v2-fg-2); overflow-wrap:anywhere; }
  .sm-errnote b { font-family:var(--font-ui); }

  .sm-tbl { overflow-x:auto; }
  .sm-tbl table { width:100%; border-collapse:collapse; font-size:13px; }
  .sm-tbl th { text-align:left; font-weight:500; font-size:12.5px; color:var(--v2-fg-3); padding:10px 18px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .sm-tbl td { padding:10px 18px; border-bottom:1px solid var(--v2-line); }
  .sm-tbl tr.row { cursor:pointer; }
  .sm-tbl tr.row:hover td { background:var(--v2-hover); }
  .sm-tbl tr.grp td { background:var(--v2-surface-2); font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); padding:7px 18px; }
  .sm-tbl .num { text-align:right; font-family:var(--font-data); font-variant-numeric:tabular-nums; }
  .sm-tn b { display:block; font-weight:500; }
  .sm-tn small { display:block; font:12px var(--font-data); color:var(--v2-fg-3); }

  .sm-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); justify-self:start; }
  .sm-seg button { height:28px; padding:0 12px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; }
  .sm-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
  .sm-defbox { padding:16px; border:1px dashed var(--v2-line-strong); border-radius:8px; color:var(--v2-fg-2); font-size:13px; line-height:1.6; }
  .sm-tokens { display:flex; flex-wrap:wrap; gap:6px; }
  .sm-tokens button { display:inline-flex; gap:6px; align-items:center; height:26px; padding:0 8px; border:1px solid var(--v2-line); border-radius:5px; background:var(--v2-surface-2); color:var(--v2-fg); font:12px var(--font-data); cursor:pointer; }
  .sm-tokens button:hover:not(:disabled) { border-color:var(--v2-accent); }
  .sm-tokens button:disabled { cursor:default; }
  .sm-tokens-help { display:grid; gap:4px; margin-top:8px; font-size:12px; color:var(--v2-fg-3); }
  .sm-tokens-help code { font-family:var(--font-data); color:var(--v2-fg-2); }
  .sm-ed { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 900px) { .sm-ed { grid-template-columns:1fr; } }
  .sm-ed textarea { width:100%; min-height:440px; resize:vertical; padding:12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font:12.5px/1.6 var(--font-data); outline:none; }
  .sm-ed textarea:focus { border-color:var(--v2-accent); }
  .sm-ed iframe { width:100%; min-height:440px; border:1px solid var(--v2-line); border-radius:8px; background:#fff; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA
// ══════════════════════════════════════════════════════════════════════════════

export function SmtpConfigDashboard() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getSmtpConfig);
  const upsert = useServerFn(upsertSmtpConfig);
  const test = useServerFn(sendTestSmtpEmail);
  const listTemplates = useServerFn(listEmailTemplates);
  const isAdmin = role === "admin" || role === "super_admin";

  const q = useQuery({ queryKey: ["smtp-config"], queryFn: () => get(), enabled: isAdmin });
  const templatesQ = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listTemplates(),
    enabled: isAdmin,
  });

  // Envios dos últimos 30 dias (estatísticas e últimos envios)
  const logsQ = useQuery({
    queryKey: ["smtp-email-logs-30d"],
    enabled: isAdmin,
    queryFn: async (): Promise<EmailLogRow[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("email_logs")
        .select("id, to_email, subject, template, status, error_message, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EmailLogRow[];
    },
    refetchInterval: 60_000,
  });

  const [tab, setTab] = React.useState<"server" | "templates">("server");
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState(587);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [replacingPw, setReplacingPw] = React.useState(false);
  const [fromEmail, setFromEmail] = React.useState("");
  const [fromName, setFromName] = React.useState(APP_NAME);
  const [secure, setSecure] = React.useState(true);
  const [enabled, setEnabled] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [openTpl, setOpenTpl] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [now] = React.useState(() => Date.now());

  React.useEffect(() => {
    const c = q.data?.config;
    if (c) {
      setHost(c.host ?? "");
      setPort(c.port ?? 587);
      setUsername(c.username ?? "");
      setFromEmail(c.from_email ?? "");
      setFromName(c.from_name ?? APP_NAME);
      setSecure(!!c.secure);
      setEnabled(!!c.enabled);
    }
  }, [q.data]);

  React.useEffect(() => {
    if (user?.email && !testTo) setTestTo(user.email);
  }, [user?.email, testTo]);

  if (!isAdmin) {
    return (
      <div className="sm-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sm-card">
          <div className="sm-empty">
            Apenas administradores podem visualizar ou editar esta página.
          </div>
        </div>
      </div>
    );
  }
  if (q.isLoading) return <ModuleLoading />;

  const savedConfig = q.data?.config;
  const isConfigured = !!savedConfig?.host;
  const hasPassword = !!q.data?.hasPassword;
  const templates = templatesQ.data ?? [];
  const logs = logsQ.data ?? [];

  const stats = new Map<string, TemplateStat>();
  for (const l of logs) {
    if (!l.template) continue;
    const s = stats.get(l.template) ?? { sent: 0, failed: 0, last: null };
    s.sent += 1;
    if (l.status === "error") s.failed += 1;
    if (!s.last || l.created_at > s.last) s.last = l.created_at;
    stats.set(l.template, s);
  }
  const failed = logs.filter((l) => l.status === "error");
  const lastFail = failed[0];
  const customCount = templates.filter((t) => t.mode === "custom").length;

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          host,
          port,
          username,
          from_email: fromEmail,
          from_name: fromName,
          secure,
          enabled,
          updated_by: user?.id ?? null,
          password: password || null,
        },
      });
      toast.success("Configuração salva");
      setPassword("");
      setReplacingPw(false);
      qc.invalidateQueries({ queryKey: ["smtp-config"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo) return toast.error("Informe um e-mail destinatário");
    setTesting(true);
    try {
      const r = await test({ data: { to: testTo } });
      if (r.ok) {
        toast.success("E-mail de teste enviado");
        setTestOpen(false);
      } else toast.error("Falha: " + r.error);
      qc.invalidateQueries({ queryKey: ["smtp-email-logs-30d"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const openTemplate = (key: string) => {
    setOpenTpl(key);
    setSheetOpen(true);
  };
  const selectedTpl = templates.find((t) => t.key === openTpl) ?? null;

  return (
    <div className="sm-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sm-ph">
        <div>
          <h1 className="sm-ph-title">E-mail (SMTP)</h1>
          <p className="sm-ph-sub">Servidor de envio e templates das notificações por e-mail</p>
        </div>
        <button
          className="sm-btn"
          onClick={() => setTestOpen(true)}
          disabled={!savedConfig?.enabled}
          title={savedConfig?.enabled ? undefined : "Habilite e salve o SMTP para enviar um teste"}
        >
          <Send size={14} />
          Enviar teste
        </button>
      </div>

      <div className="sm-kpis">
        <div className="sm-kpi">
          <span className="sm-kpi-label">
            <span
              className="sm-sw"
              style={{ background: savedConfig?.enabled ? "var(--v2-ok)" : "var(--v2-fg-3)" }}
            />
            Envio de e-mails
          </span>
          <span className="sm-kpi-value word">
            {!isConfigured ? "Não configurado" : savedConfig?.enabled ? "Ativo" : "Desligado"}
          </span>
          <span className="sm-kpi-foot">
            {isConfigured
              ? `${savedConfig?.host}:${savedConfig?.port}${savedConfig?.secure ? " · TLS" : ""}`
              : "—"}
          </span>
        </div>
        <div className="sm-kpi">
          <span className="sm-kpi-label">Enviados · 30 dias</span>
          <span className="sm-kpi-value">{logs.length.toLocaleString("pt-BR")}</span>
          <span className="sm-kpi-foot">último {fmtAgo(logs[0]?.created_at, now)}</span>
        </div>
        <div className="sm-kpi">
          <span className="sm-kpi-label">
            {failed.length > 0 && (
              <span className="sm-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Falhas · 30 dias
          </span>
          <span className="sm-kpi-value">{failed.length}</span>
          <span className="sm-kpi-foot">
            {logs.length
              ? `${((failed.length / logs.length) * 100).toFixed(1).replace(".", ",")}% dos envios`
              : "nenhum envio"}
          </span>
        </div>
        <button className="sm-kpi" onClick={() => setTab("templates")}>
          <span className="sm-kpi-label">Templates customizados</span>
          <span className="sm-kpi-value">
            {customCount}
            <small>de {templates.length}</small>
          </span>
          <span className="sm-kpi-foot">os demais usam o padrão</span>
        </button>
      </div>

      <div className="sm-subnav" role="tablist">
        <button role="tab" aria-selected={tab === "server"} onClick={() => setTab("server")}>
          Servidor
        </button>
        <button role="tab" aria-selected={tab === "templates"} onClick={() => setTab("templates")}>
          Templates <span className="c">{templates.length}</span>
        </button>
      </div>

      {tab === "server" ? (
        <div className="sm-two">
          <section className="sm-card">
            <div className="sm-card-h">
              <span>
                <b>Servidor SMTP</b>
                <small>Usado por todos os módulos que enviam e-mail</small>
              </span>
              <span className="r">
                <span
                  className="sm-pill"
                  style={
                    {
                      "--c": isConfigured ? "var(--v2-ok)" : "var(--v2-med)",
                    } as React.CSSProperties
                  }
                >
                  {isConfigured ? "Configurado" : "Pendente"}
                </span>
              </span>
            </div>
            <div className="sm-card-b">
              <div className="sm-togrow">
                <span>
                  <b>Envio de e-mails habilitado</b>
                  <small>
                    {enabled
                      ? "Os módulos enviam notificações normalmente"
                      : "Nenhum e-mail será disparado"}
                  </small>
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  aria-label="Envio de e-mails habilitado"
                />
              </div>

              <div className="sm-sublabel">Servidor</div>
              <div className="sm-g3">
                <label className="sm-field">
                  Host
                  <input
                    className="sm-input mono"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.office365.com"
                  />
                </label>
                <label className="sm-field">
                  Porta
                  <input
                    className="sm-input mono"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="587"
                  />
                </label>
                <label className="sm-field">
                  TLS / SSL
                  <select
                    className="sm-select"
                    value={secure ? "on" : "off"}
                    onChange={(e) => setSecure(e.target.value === "on")}
                  >
                    <option value="on">Ativo</option>
                    <option value="off">Desativado</option>
                  </select>
                </label>
              </div>

              <div className="sm-sublabel">Remetente</div>
              <div className="sm-g2">
                <label className="sm-field">
                  E-mail do remetente
                  <input
                    className="sm-input"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="alertas@empresa.com.br"
                  />
                </label>
                <label className="sm-field">
                  Nome exibido
                  <input
                    className="sm-input"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder={APP_NAME}
                  />
                </label>
              </div>

              <div className="sm-sublabel">Autenticação</div>
              <div className="sm-g2">
                <label className="sm-field">
                  Usuário
                  <input
                    className="sm-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario@empresa.com.br"
                  />
                </label>
                <div className="sm-field">
                  Senha
                  {hasPassword && !replacingPw ? (
                    <div className="sm-secret">
                      <span className="s">
                        <KeyRound size={13} />
                        Salva{" "}
                        <span>
                          {q.data?.passwordSource === "db" ? "no banco" : "em variável de ambiente"}
                        </span>
                      </span>
                      <button type="button" className="sm-btn" onClick={() => setReplacingPw(true)}>
                        Substituir
                      </button>
                    </div>
                  ) : (
                    <div className="sm-secret">
                      <input
                        className="sm-input"
                        type="password"
                        aria-label="Senha SMTP"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={hasPassword ? "Nova senha" : "Digite a senha SMTP"}
                        autoComplete="new-password"
                        autoFocus={replacingPw}
                      />
                      {replacingPw && (
                        <button
                          type="button"
                          className="sm-btn ghost"
                          onClick={() => {
                            setPassword("");
                            setReplacingPw(false);
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                  <small>Só de escrita: nunca é exibida depois de salva.</small>
                </div>
              </div>
            </div>
            <div className="sm-card-f">
              <button className="sm-btn primary" onClick={save} disabled={saving}>
                <Check size={14} />
                {saving ? "Salvando…" : "Salvar configuração"}
              </button>
            </div>
          </section>

          <section className="sm-card">
            <div className="sm-card-h">
              <span>
                <b>Últimos envios</b>
                <small>email_logs · todos os módulos</small>
              </span>
              <span className="r">
                <Link to="/app/$module" params={{ module: "logs" }} className="sm-link">
                  Central de Logs <ChevronRight size={13} />
                </Link>
              </span>
            </div>
            {logs.length === 0 ? (
              <div className="sm-empty">Nenhum e-mail enviado nos últimos 30 dias.</div>
            ) : (
              <div className="sm-sends">
                {logs.slice(0, 6).map((l) => (
                  <div key={l.id}>
                    <i
                      style={
                        {
                          "--c": l.status === "error" ? "var(--v2-crit)" : "var(--v2-ok)",
                        } as React.CSSProperties
                      }
                    />
                    <span style={{ minWidth: 0 }}>
                      <b>{l.subject ?? l.template ?? "E-mail"}</b>
                      <small>
                        {l.to_email}
                        {l.template ? ` · ${l.template}` : ""}
                      </small>
                    </span>
                    <time dateTime={l.created_at}>{fmtShort(l.created_at, now)}</time>
                  </div>
                ))}
              </div>
            )}
            {lastFail && (
              <div className="sm-errnote">
                <b>
                  Última falha · {fmtShort(lastFail.created_at, now)} · {lastFail.to_email}
                </b>
                <br />
                {lastFail.error_message ?? "sem mensagem de erro"}
              </div>
            )}
          </section>
        </div>
      ) : (
        <TemplatesTable templates={templates} stats={stats} now={now} onOpen={openTemplate} />
      )}

      {selectedTpl && (
        <TemplateSheet
          key={selectedTpl.key}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          template={selectedTpl}
        />
      )}

      <Dialog open={testOpen} onOpenChange={(o) => !testing && setTestOpen(o)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle>Enviar e-mail de teste</DialogTitle>
          </DialogHeader>
          <div className="sm-root" style={{ gap: 12 }}>
            <label className="sm-field">
              Destinatário
              <input
                className="sm-input"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="voce@empresa.com.br"
                autoFocus
              />
              <small>Usa a configuração salva. O envio aparece na Central de Logs.</small>
            </label>
          </div>
          <DialogFooter>
            <button className="sm-btn ghost" onClick={() => setTestOpen(false)} disabled={testing}>
              Cancelar
            </button>
            <button className="sm-btn primary" onClick={sendTest} disabled={testing || !testTo}>
              <Send size={14} />
              {testing ? "Enviando…" : "Enviar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

type TemplateItem = Awaited<ReturnType<typeof listEmailTemplates>>[number];

function TemplatesTable({
  templates,
  stats,
  now,
  onOpen,
}: {
  templates: TemplateItem[];
  stats: Map<string, TemplateStat>;
  now: number;
  onOpen: (key: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const q = search.trim().toLowerCase();
  const rows = templates.filter(
    (t) => !q || `${t.label} ${t.key} ${t.module_label}`.toLowerCase().includes(q),
  );
  let group = "";
  return (
    <section className="sm-card">
      <div className="sm-card-h">
        <span>
          <b>Templates de e-mail</b>
          <small>
            Padrão do sistema ou HTML próprio, por notificação · estatísticas dos últimos 30 dias
          </small>
        </span>
        <span className="r">
          <input
            className="sm-input"
            style={{ width: 220 }}
            placeholder="Buscar template"
            aria-label="Buscar template"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </span>
      </div>
      <div className="sm-tbl">
        <table>
          <thead>
            <tr>
              <th>Notificação</th>
              <th>Modo</th>
              <th className="num">Enviados</th>
              <th className="num">Falhas</th>
              <th>Último envio</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="sm-empty">
                  Nenhum template encontrado.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const s = stats.get(t.key);
              const sep = t.module_label !== group;
              group = t.module_label;
              return (
                <React.Fragment key={t.key}>
                  {sep && (
                    <tr className="grp">
                      <td colSpan={5}>{t.module_label}</td>
                    </tr>
                  )}
                  <tr
                    className="row"
                    tabIndex={0}
                    onClick={() => onOpen(t.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onOpen(t.key);
                    }}
                  >
                    <td className="sm-tn">
                      <b>{t.label}</b>
                      <small>{t.key}</small>
                    </td>
                    <td>
                      <span
                        className="sm-pill"
                        style={
                          {
                            "--c": t.mode === "custom" ? "var(--v2-accent)" : "var(--v2-fg-3)",
                          } as React.CSSProperties
                        }
                      >
                        {t.mode === "custom" ? "Customizado" : "Padrão"}
                      </span>
                    </td>
                    <td className="num">{s?.sent ?? 0}</td>
                    <td className="num" style={s?.failed ? { color: "var(--v2-crit)" } : undefined}>
                      {s?.failed ?? 0}
                    </td>
                    <td style={{ color: "var(--v2-fg-3)" }}>{fmtAgo(s?.last, now)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TemplateSheet({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: TemplateItem;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upsert = useServerFn(upsertEmailTemplate);
  const [mode, setMode] = React.useState<"default" | "custom">(
    (template.mode as "default" | "custom") ?? "default",
  );
  const [html, setHtml] = React.useState<string>(template.custom_html ?? "");
  const [saving, setSaving] = React.useState(false);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  function changeMode(next: "default" | "custom") {
    setMode(next);
    if (next === "custom" && !html.trim()) setHtml(buildTemplateSkeleton(template.variables));
  }

  // Insere o placeholder na posição do cursor do editor
  function insertToken(token: string) {
    const el = textRef.current;
    const text = `{{${token}}}`;
    if (!el) return setHtml((h) => h + text);
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    const next = html.slice(0, start) + text + html.slice(end);
    setHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const preview = React.useMemo(
    () => renderTemplatePreview(html, template.variables),
    [html, template.variables],
  );

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          template_key: template.key,
          mode,
          custom_html: html.trim().length > 0 ? html : null,
          updated_by: user?.id ?? null,
        },
      });
      toast.success("Template salvo");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width={1100}
      eyebrow={`${template.module_label} · ${template.key}`}
      title={template.label}
      badges={
        <span
          className="sm-pill"
          style={
            {
              "--c": mode === "custom" ? "var(--v2-accent)" : "var(--v2-fg-3)",
            } as React.CSSProperties
          }
        >
          {mode === "custom" ? "Customizado" : "Padrão"}
        </span>
      }
      footer={
        <>
          <button
            className="sm-btn ghost"
            style={{ marginRight: "auto" }}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </button>
          <button className="sm-btn primary" onClick={save} disabled={saving}>
            <Check size={14} />
            {saving ? "Salvando…" : "Salvar template"}
          </button>
        </>
      }
    >
      <div className="sm-root" style={{ gap: 18 }}>
        <div className="sm-seg" role="group" aria-label="Modo do template">
          <button aria-pressed={mode === "default"} onClick={() => changeMode("default")}>
            Padrão do sistema
          </button>
          <button aria-pressed={mode === "custom"} onClick={() => changeMode("custom")}>
            HTML próprio
          </button>
        </div>

        {mode === "default" && (
          <div className="sm-defbox">
            Este e-mail usa o layout padrão do {APP_NAME}, mantido junto com o código. Escolha{" "}
            <b>HTML próprio</b> para escrever outro corpo usando os campos abaixo
            {html.trim() ? " (o HTML salvo antes continua guardado e volta ao trocar de modo)" : ""}
            .
          </div>
        )}

        <DetailSection
          title={
            mode === "custom"
              ? "Campos disponíveis · clique para inserir no cursor"
              : "Campos disponíveis"
          }
        >
          <div className="sm-tokens">
            {template.variables.map((v) => (
              <button
                key={v.token}
                type="button"
                disabled={mode !== "custom"}
                onClick={() => insertToken(v.token)}
                title={`${v.description} · exemplo: ${v.sample}`}
              >
                {`{{${v.token}}}`}
              </button>
            ))}
          </div>
          <div className="sm-tokens-help">
            {template.variables.map((v) => (
              <span key={v.token}>
                <code>{v.token}</code> — {v.description}
              </span>
            ))}
          </div>
        </DetailSection>

        {mode === "custom" && (
          <div className="sm-ed">
            <label className="sm-field">
              HTML
              <textarea
                ref={textRef}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="sm-field">
              Pré-visualização · dados de exemplo
              <iframe title="Pré-visualização do template" sandbox="" srcDoc={preview} />
            </label>
          </div>
        )}
      </div>
    </DetailSheet>
  );
}
