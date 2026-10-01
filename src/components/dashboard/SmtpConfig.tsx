import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSmtpConfig, upsertSmtpConfig, sendTestSmtpEmail } from "@/lib/smtp.functions";
import { listEmailTemplates, upsertEmailTemplate, type EmailTemplateVariable } from "@/lib/email-templates.functions";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mail,
  Send,
  KeyRound,
  FileCode2,
  Save,
  CheckCircle2,
  AlertCircle,
  Server,
  Loader2,
  Layers,
} from "lucide-react";

// ── Design tokens (same palette as Integrações) ────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
  textSubtle: "var(--tl-475569, #475569)",
};

const ACCENTS = {
  blue: { color: "#3B82F6", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  emerald: { color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
  purple: { color: "#A78BFA", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.25)" },
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .smtp-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .smtp-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .smtp-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:12px;
  }
  .smtp-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .smtp-page-sub { font-size:12px; color:${T.textMuted}; margin-top:3px; line-height:1.5; }
  .smtp-status-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .smtp-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .smtp-pill.ok   { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .smtp-pill.warn { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2); }
  .smtp-pill.off  { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }
  .smtp-pill-dot  { width:5px; height:5px; border-radius:50%; background:currentColor; }

  /* ── Card ── */
  .smtp-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    overflow:hidden; display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .smtp-card:hover { border-color:${T.borderHi}; box-shadow:0 8px 32px rgba(0,0,0,0.3); }

  .smtp-card-header {
    padding:16px 20px 14px; background:${T.surfaceAlt};
    border-bottom:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between;
    position:relative; overflow:hidden;
  }
  .smtp-card-header::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--card-color, ${T.accent});
  }
  .smtp-card-header-left { display:flex; align-items:center; gap:10px; }
  .smtp-icon-wrap {
    width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;
    background:var(--card-bg, ${T.accentSoft}); border:1px solid var(--card-border, rgba(59,130,246,0.2));
    flex-shrink:0;
  }
  .smtp-card-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .smtp-card-sub { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:2px; }

  .smtp-badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
    border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .smtp-badge.ok   { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .smtp-badge.warn { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2); }
  .smtp-badge.off  { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }

  /* ── Card body ── */
  .smtp-card-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; flex:1; }

  /* ── Toggle row ── */
  .smtp-toggle-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; background:${T.surfaceAlt}; border-radius:7px;
    border:1px solid ${T.border};
  }
  .smtp-toggle-label { font-size:12px; font-weight:600; color:${T.textSecondary}; }
  .smtp-toggle-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:1px; }

  /* ── Field ── */
  .smtp-field { display:flex; flex-direction:column; gap:5px; }
  .smtp-field-label {
    font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .smtp-field-helper { font-size:10px; color:${T.textSubtle}; line-height:1.5; margin-top:1px; }
  .smtp-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .smtp-grid-2.col-span { grid-column:1/-1; }

  /* ── Sub-section ── */
  .smtp-sub-label {
    font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    display:flex; align-items:center; gap:6px;
  }
  .smtp-sub-label::after { content:''; flex:1; height:1px; background:${T.border}; }

  /* ── Input override ── */
  .smtp-root input[type="text"],
  .smtp-root input[type="email"],
  .smtp-root input[type="number"],
  .smtp-root input[type="password"],
  .smtp-root input:not([type]) {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:12px !important; border-radius:6px !important;
    transition:border-color 0.15s, box-shadow 0.15s !important;
  }
  .smtp-root input:focus {
    border-color:rgba(59,130,246,0.5) !important; outline:none !important;
    box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important;
  }
  .smtp-root input::placeholder { color:${T.textSubtle} !important; }

  /* ── Select override ── */
  .smtp-root [role="combobox"],
  .smtp-root button[data-radix-select-trigger] {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:12px !important; border-radius:6px !important;
  }

  /* ── Textarea override ── */
  .smtp-root textarea {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:11px !important; border-radius:6px !important; resize:vertical !important;
  }

  /* ── Save button ── */
  .smtp-save-btn {
    display:inline-flex; align-items:center; justify-content:center; gap:7px;
    width:100%; padding:10px 16px; border-radius:7px;
    background:var(--card-bg, ${T.accentSoft});
    border:1px solid var(--card-border, rgba(59,130,246,0.35));
    color:var(--card-color, ${T.accent});
    font-size:12px; font-weight:700; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s; margin-top:4px;
  }
  .smtp-save-btn:hover:not(:disabled) { filter:brightness(1.15); box-shadow:0 0 20px rgba(0,0,0,0.2); }
  .smtp-save-btn:disabled { opacity:0.45; cursor:not-allowed; }

  /* ── Password row ── */
  .smtp-pw-box {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:7px;
    padding:12px 14px; display:flex; flex-direction:column; gap:8px;
  }
  .smtp-pw-header { display:flex; align-items:center; gap:6px; }
  .smtp-pw-hint { font-size:10px; color:${T.textSubtle}; line-height:1.55; }

  /* ── Placeholder reference ── */
  .smtp-placeholder-box {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:7px;
    padding:12px 14px;
  }
  .smtp-placeholder-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; margin-top:8px; }
  .smtp-placeholder-item { font-size:10px; color:${T.textMuted}; display:flex; align-items:baseline; gap:4px; }
  .smtp-placeholder-token {
    font-family:'IBM Plex Mono',monospace; font-size:10px;
    background:${T.surface}; border:1px solid ${T.border}; border-radius:3px;
    padding:1px 5px; color:${T.textPrimary}; white-space:nowrap; flex-shrink:0;
  }

  /* ── Editor layout ── */
  .smtp-editor-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:4px; }
  @media (max-width:900px) { .smtp-editor-grid { grid-template-columns:1fr; } }

  /* ── Divider ── */
  .smtp-divider { height:1px; background:${T.border}; }

  /* ── Spin ── */
  @keyframes smtp-spin { to{transform:rotate(360deg)} }
  .smtp-spin { animation:smtp-spin 0.7s linear infinite; }

  /* ── Main two-column layout ── */
  .smtp-main-grid {
    display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;
  }
  .smtp-col { display:flex; flex-direction:column; gap:16px; }

  /* ── Responsive ── */
  @media (max-width:900px) {
    .smtp-main-grid { grid-template-columns:1fr !important; }
  }
  @media (max-width:680px) {
    .smtp-grid-2 { grid-template-columns:1fr !important; }
    .smtp-editor-grid { grid-template-columns:1fr !important; }
  }
`;

// ── CSS vars helper ────────────────────────────────────────────────────────────
function accentVars(a: (typeof ACCENTS)["blue"]): React.CSSProperties {
  return { "--card-color": a.color, "--card-bg": a.bg, "--card-border": a.border } as React.CSSProperties;
}

// ── Helpers (template panel) ───────────────────────────────────────────────────
function buildTemplateSkeleton(variables: EmailTemplateVariable[]): string {
  const rows = variables.map((v) => `  <p><b>${v.token}:</b> {{${v.token}}}</p>`).join("\n");
  return `<div style="font-family:Arial,sans-serif">\n${rows}\n</div>`;
}

function renderTemplatePreview(html: string, variables: EmailTemplateVariable[]): string {
  let out = html;
  for (const v of variables) out = out.split(`{{${v.token}}}`).join(v.sample);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export function SmtpConfigDashboard() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getSmtpConfig);
  const upsert = useServerFn(upsertSmtpConfig);
  const test = useServerFn(sendTestSmtpEmail);

  const q = useQuery({ queryKey: ["smtp-config"], queryFn: () => get() });

  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState(587);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fromEmail, setFromEmail] = React.useState("");
  const [fromName, setFromName] = React.useState("B-Security");
  const [secure, setSecure] = React.useState(true);
  const [enabled, setEnabled] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    const c = q.data?.config;
    if (c) {
      setHost(c.host ?? "");
      setPort(c.port ?? 587);
      setUsername(c.username ?? "");
      setFromEmail(c.from_email ?? "");
      setFromName(c.from_name ?? "B-Security");
      setSecure(!!c.secure);
      setEnabled(!!c.enabled);
    }
  }, [q.data]);

  if (role !== "admin" && role !== "super_admin") {
    return (
      <div className="smtp-root" style={{ padding: 24 }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: "24px 28px",
            color: T.textMuted,
            fontSize: 13,
          }}
        >
          Apenas administradores podem visualizar/editar esta página.
        </div>
      </div>
    );
  }

  const isSmtpConfigured = !!q.data?.config?.host;
  const hasPassword = !!q.data?.hasPassword;

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
      qc.invalidateQueries({ queryKey: ["smtp-config"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo) return toast.error("Informe um e-mail destinatário");
    setTesting(true);
    try {
      const r = await test({ data: { to: testTo } });
      if (r.ok) toast.success("E-mail de teste enviado");
      else toast.error("Falha: " + r.error);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="smtp-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="smtp-page-header">
        <div>
          <div className="smtp-page-title">Configuração SMTP</div>
          <div className="smtp-page-sub">
            Configure o servidor de envio e personalize os templates de notificação por módulo.
          </div>
        </div>
        <div className="smtp-status-bar">
          <span className={`smtp-pill ${enabled ? "ok" : "off"}`}>
            <span className="smtp-pill-dot" />
            {enabled ? "SMTP ativo" : "SMTP inativo"}
          </span>
          <span className={`smtp-pill ${isSmtpConfigured ? "ok" : "off"}`}>
            <span className="smtp-pill-dot" />
            {isSmtpConfigured ? "Servidor configurado" : "Servidor pendente"}
          </span>
          <span className={`smtp-pill ${hasPassword ? "ok" : "warn"}`}>
            <span className="smtp-pill-dot" />
            {hasPassword ? "Senha configurada" : "Senha pendente"}
          </span>
        </div>
      </div>

      {/* ── Main grid: left = server+test, right = templates ────────────────── */}
      <div className="smtp-main-grid">
        <div className="smtp-col">
          {/* ── SMTP Server card ─────────────────────────────────────────────────── */}
          <div className="smtp-card" style={accentVars(ACCENTS.blue)}>
            <div className="smtp-card-header">
              <div className="smtp-card-header-left">
                <div className="smtp-icon-wrap">
                  <Server size={16} style={{ color: ACCENTS.blue.color }} />
                </div>
                <div>
                  <div className="smtp-card-title">Servidor SMTP</div>
                  <div className="smtp-card-sub">Credenciais de envio de e-mail</div>
                </div>
              </div>
              <span className={`smtp-badge ${isSmtpConfigured ? "ok" : "off"}`}>
                {isSmtpConfigured ? (
                  <>
                    <CheckCircle2 size={10} /> Configurado
                  </>
                ) : (
                  <>
                    <AlertCircle size={10} /> Pendente
                  </>
                )}
              </span>
            </div>

            <div className="smtp-card-body">
              {/* Toggle habilitar */}
              <div className="smtp-toggle-row">
                <div>
                  <div className="smtp-toggle-label">Habilitar envios de e-mail</div>
                  <div className="smtp-toggle-hint">
                    {enabled ? "Módulos enviarão notificações normalmente" : "Nenhum e-mail será disparado"}
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              {/* Servidor */}
              <div className="smtp-sub-label">Servidor</div>
              <div className="smtp-grid-2">
                <div className="smtp-field" style={{ gridColumn: "1/-1" }}>
                  <span className="smtp-field-label">Host</span>
                  <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
                </div>
                <div className="smtp-field">
                  <span className="smtp-field-label">Porta</span>
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="587"
                  />
                </div>
                <div className="smtp-field">
                  <span className="smtp-field-label">TLS / SSL seguro</span>
                  <div className="smtp-toggle-row" style={{ padding: "8px 12px", marginTop: 0 }}>
                    <span style={{ fontSize: 11, color: T.textSecondary, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {secure ? "Habilitado (recomendado)" : "Desabilitado"}
                    </span>
                    <Switch checked={secure} onCheckedChange={setSecure} />
                  </div>
                </div>
              </div>

              {/* Identidade */}
              <div className="smtp-sub-label">Identidade</div>
              <div className="smtp-grid-2">
                <div className="smtp-field">
                  <span className="smtp-field-label">Usuário (login SMTP)</span>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div className="smtp-field">
                  <span className="smtp-field-label">From — e-mail</span>
                  <Input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="alertas@empresa.com"
                  />
                </div>
                <div className="smtp-field">
                  <span className="smtp-field-label">From — nome exibido</span>
                  <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="B-Security" />
                </div>
              </div>

              {/* Senha */}
              <div className="smtp-sub-label">Credencial</div>
              <div className="smtp-pw-box">
                <div className="smtp-pw-header">
                  <KeyRound
                    size={13}
                    style={{ color: hasPassword ? ACCENTS.emerald.color : T.warning, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary }}>Senha SMTP</span>
                  <span className={`smtp-badge ${hasPassword ? "ok" : "warn"}`} style={{ marginLeft: "auto" }}>
                    {hasPassword ? (
                      <>
                        <CheckCircle2 size={9} /> {q.data?.passwordSource === "db" ? "banco" : "secret"}
                      </>
                    ) : (
                      <>
                        <AlertCircle size={9} /> não configurada
                      </>
                    )}
                  </span>
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasPassword ? "•••••••• (deixe em branco para manter)" : "Digite a senha SMTP"}
                  autoComplete="new-password"
                />
                <p className="smtp-pw-hint">
                  A senha é armazenada de forma segura — apenas administradores têm acesso. Para trocar a credencial,
                  basta digitar a nova senha e salvar.
                </p>
              </div>

              <button className="smtp-save-btn" onClick={save} disabled={saving}>
                {saving ? <Loader2 size={13} className="smtp-spin" /> : <Save size={13} />}
                {saving ? "Salvando…" : "Salvar configuração"}
              </button>
            </div>
          </div>

          {/* ── Test email card ──────────────────────────────────────────────────── */}
          <div className="smtp-card" style={accentVars(ACCENTS.emerald)}>
            <div className="smtp-card-header">
              <div className="smtp-card-header-left">
                <div className="smtp-icon-wrap">
                  <Send size={16} style={{ color: ACCENTS.emerald.color }} />
                </div>
                <div>
                  <div className="smtp-card-title">Envio de Teste</div>
                  <div className="smtp-card-sub">Verifica se o servidor está respondendo</div>
                </div>
              </div>
              {!enabled && (
                <span className="smtp-badge warn">
                  <AlertCircle size={10} /> SMTP inativo
                </span>
              )}
            </div>

            <div className="smtp-card-body">
              <div className="smtp-field">
                <span className="smtp-field-label">Destinatário</span>
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="voce@empresa.com"
                />
                {!enabled && (
                  <span className="smtp-field-helper">
                    Habilite o SMTP no painel acima para enviar e-mails de teste.
                  </span>
                )}
              </div>

              <button className="smtp-save-btn" onClick={sendTest} disabled={testing || !enabled}>
                {testing ? <Loader2 size={13} className="smtp-spin" /> : <Send size={13} />}
                {testing ? "Enviando…" : "Enviar e-mail de teste"}
              </button>
            </div>
          </div>
        </div>
        {/* /smtp-col left */}

        {/* ── Right column: templates ──────────────────────────────────────────── */}
        <div className="smtp-col">
          <EmailTemplatesCard />
        </div>
      </div>
      {/* /smtp-main-grid */}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES CARD
// ══════════════════════════════════════════════════════════════════════════════
function EmailTemplatesCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listEmailTemplates);
  const upsert = useServerFn(upsertEmailTemplate);

  const q = useQuery({ queryKey: ["email-templates"], queryFn: () => list() });

  const [selectedModule, setSelectedModule] = React.useState("");
  const [selectedKey, setSelectedKey] = React.useState("");
  const [mode, setMode] = React.useState<"default" | "custom">("default");
  const [customHtml, setCustomHtml] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const templates = q.data ?? [];

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof templates>();
    for (const t of templates) {
      const arr = map.get(t.module_label) ?? [];
      arr.push(t);
      map.set(t.module_label, arr);
    }
    return Array.from(map.entries());
  }, [templates]);

  const moduleLabels = groups.map(([label]) => label);

  const templatesForModule = React.useMemo(
    () => groups.find(([label]) => label === selectedModule)?.[1] ?? [],
    [groups, selectedModule],
  );

  React.useEffect(() => {
    if (!selectedModule && moduleLabels.length > 0) setSelectedModule(moduleLabels[0]);
  }, [moduleLabels, selectedModule]);

  React.useEffect(() => {
    if (templatesForModule.length > 0) setSelectedKey(templatesForModule[0].key);
  }, [selectedModule]);

  const selected = templates.find((t) => t.key === selectedKey);

  React.useEffect(() => {
    if (!selected) return;
    setMode((selected.mode as "default" | "custom") ?? "default");
    setCustomHtml(selected.custom_html ?? "");
  }, [selected?.key]);

  function handleModeChange(next: "default" | "custom") {
    setMode(next);
    if (next === "custom" && !customHtml.trim() && selected) {
      setCustomHtml(buildTemplateSkeleton(selected.variables));
    }
  }

  const previewHtml = React.useMemo(() => {
    if (!selected) return "";
    return renderTemplatePreview(customHtml, selected.variables);
  }, [customHtml, selected]);

  const customCount = templates.filter((t) => t.mode === "custom").length;

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await upsert({
        data: {
          template_key: selected.key,
          mode,
          custom_html: customHtml.trim().length > 0 ? customHtml : null,
          updated_by: user?.id ?? null,
        },
      });
      toast.success("Template salvo");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="smtp-card" style={accentVars(ACCENTS.purple)}>
      <div className="smtp-card-header">
        <div className="smtp-card-header-left">
          <div className="smtp-icon-wrap">
            <FileCode2 size={16} style={{ color: ACCENTS.purple.color }} />
          </div>
          <div>
            <div className="smtp-card-title">Templates SMTP</div>
            <div className="smtp-card-sub">HTML dos e-mails disparados por módulo</div>
          </div>
        </div>
        <span className={`smtp-badge ${customCount > 0 ? "ok" : "off"}`}>
          <Layers size={9} />
          {customCount > 0 ? `${customCount} customizado${customCount > 1 ? "s" : ""}` : "todos padrão"}
        </span>
      </div>

      <div className="smtp-card-body">
        {/* Seletores */}
        <div className="smtp-grid-2">
          <div className="smtp-field">
            <span className="smtp-field-label">Módulo</span>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um módulo" />
              </SelectTrigger>
              <SelectContent>
                {moduleLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="smtp-field">
            <span className="smtp-field-label">Template do módulo</span>
            <Select value={selectedKey} onValueChange={setSelectedKey} disabled={templatesForModule.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templatesForModule.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Modo */}
        {selected && (
          <>
            <div className="smtp-divider" />
            <div className="smtp-grid-2">
              <div className="smtp-field">
                <span className="smtp-field-label">Modo do template</span>
                <Select value={mode} onValueChange={(v) => handleModeChange(v as "default" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão (já configurado)</SelectItem>
                    <SelectItem value="custom">Customizado (HTML próprio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="smtp-field" style={{ justifyContent: "flex-end" }}>
                <span className="smtp-field-label">&nbsp;</span>
                <span
                  className={`smtp-badge ${mode === "custom" ? "warn" : "off"}`}
                  style={{ alignSelf: "center", marginTop: 6 }}
                >
                  {mode === "custom" ? (
                    <>
                      <FileCode2 size={9} /> HTML customizado ativo
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={9} /> Usando template padrão
                    </>
                  )}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Editor customizado */}
        {mode === "custom" && selected && (
          <>
            <div className="smtp-divider" />

            {/* Placeholders */}
            <div className="smtp-placeholder-box">
              <span className="smtp-field-label">Placeholders disponíveis</span>
              <div className="smtp-placeholder-grid">
                {selected.variables.map((v) => (
                  <div key={v.token} className="smtp-placeholder-item">
                    <span className="smtp-placeholder-token">{`{{${v.token}}}`}</span>
                    <span style={{ color: T.textSubtle }}>— {v.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Editor + Preview */}
            <div className="smtp-editor-grid">
              <div className="smtp-field">
                <span className="smtp-field-label">HTML do e-mail</span>
                <Textarea
                  value={customHtml}
                  onChange={(e) => setCustomHtml(e.target.value)}
                  style={{ minHeight: 380, marginTop: 4 }}
                  spellCheck={false}
                />
              </div>
              <div className="smtp-field">
                <span className="smtp-field-label">Preview — dados de exemplo</span>
                <iframe
                  title="Preview do template"
                  sandbox=""
                  srcDoc={previewHtml}
                  style={{
                    width: "100%",
                    minHeight: 380,
                    marginTop: 4,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: "#fff",
                  }}
                />
              </div>
            </div>
          </>
        )}

        <button className="smtp-save-btn" onClick={save} disabled={saving || !selected}>
          {saving ? <Loader2 size={13} className="smtp-spin" /> : <Save size={13} />}
          {saving ? "Salvando…" : "Salvar template"}
        </button>
      </div>
    </div>
  );
}
