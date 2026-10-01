import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSsoConfig, upsertSsoConfig } from "@/lib/sso.functions";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Shield,
  Server,
  X,
  Plus,
  Copy,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Link2,
  Save,
} from "lucide-react";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
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

const SECTION_ACCENT = {
  oauth: { color: "#0078D4", bg: "rgba(0,120,212,0.10)", border: "rgba(0,120,212,0.25)" },
  domains: { color: "#6366F1", bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.25)" },
  saml: { color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
  ldap: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .sso-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .sso-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .sso-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
  }
  .sso-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .sso-page-sub { font-size:12px; color:${T.textMuted}; margin-top:3px; line-height:1.5; }
  .sso-status-bar { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .sso-status-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .sso-status-pill.ok  { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .sso-status-pill.off { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }
  .sso-status-pill.warn { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2); }
  .sso-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; }

  /* ── Grid ── */
  .sso-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }

  /* ── Section card ── */
  .sso-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    overflow:hidden; display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .sso-card:hover { border-color:${T.borderHi}; box-shadow:0 8px 32px rgba(0,0,0,0.3); }

  .sso-card-header {
    padding:16px 20px 14px; background:${T.surfaceAlt};
    border-bottom:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between;
    position:relative; overflow:hidden;
  }
  .sso-card-header::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--sec-color, ${T.accent});
  }
  .sso-card-header-left { display:flex; align-items:center; gap:10px; }

  .sso-icon-wrap {
    width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;
    background:var(--sec-bg, ${T.accentSoft}); border:1px solid var(--sec-border, rgba(59,130,246,0.2));
    flex-shrink:0;
  }

  .sso-section-name {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .sso-section-sub {
    display:inline-flex; align-items:center; gap:4px;
    font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    margin-top:2px; letter-spacing:0.04em;
  }

  .sso-badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
    border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .sso-badge.yes  { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .sso-badge.off  { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }
  .sso-badge.warn { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2); }

  /* ── Card body ── */
  .sso-card-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; flex:1; }

  /* ── Toggle row ── */
  .sso-toggle-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; background:${T.surfaceAlt}; border-radius:7px;
    border:1px solid ${T.border};
  }
  .sso-toggle-label { font-size:12px; font-weight:600; color:${T.textSecondary}; }
  .sso-toggle-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:1px; }

  /* ── Field ── */
  .sso-field { display:flex; flex-direction:column; gap:5px; }
  .sso-field-label {
    font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .sso-field-helper { font-size:10px; color:${T.textSubtle}; line-height:1.5; margin-top:1px; }

  /* ── Input override ── */
  .sso-root input[type="text"],
  .sso-root input[type="password"],
  .sso-root input[type="number"],
  .sso-root input:not([type]) {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:12px !important; border-radius:6px !important;
    transition:border-color 0.15s, box-shadow 0.15s !important;
  }
  .sso-root input:focus {
    border-color:rgba(59,130,246,0.5) !important; outline:none !important;
    box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important;
  }
  .sso-root input::placeholder { color:${T.textSubtle} !important; }

  /* ── Info box ── */
  .sso-info {
    padding:10px 13px; border-radius:7px; font-size:11px; line-height:1.55;
    display:flex; gap:9px; align-items:flex-start;
  }
  .sso-info.neutral { background:${T.surfaceAlt}; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .sso-info.warn    { background:${T.warningBg}; border:1px solid rgba(245,158,11,0.2); color:${T.warning}; }

  /* ── Copy row ── */
  .sso-copy-row { display:flex; gap:8px; align-items:center; }
  .sso-copy-row input { flex:1; }
  .sso-copy-btn {
    flex-shrink:0; width:34px; height:34px; border-radius:6px; border:1px solid ${T.border};
    background:${T.surfaceAlt}; color:${T.textMuted}; display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:all 0.15s;
  }
  .sso-copy-btn:hover { border-color:${T.borderHi}; color:${T.textSecondary}; }

  /* ── Domain tags ── */
  .sso-tags { display:flex; flex-wrap:wrap; gap:7px; min-height:28px; }
  .sso-tag {
    display:inline-flex; align-items:center; gap:6px; padding:4px 10px;
    border-radius:20px; background:var(--sec-bg); border:1px solid var(--sec-border);
    font-size:11px; font-family:'IBM Plex Mono',monospace; color:var(--sec-color);
  }
  .sso-tag-rm {
    background:none; border:none; cursor:pointer; padding:0; line-height:0;
    color:${T.textMuted}; transition:color 0.1s;
  }
  .sso-tag-rm:hover { color:${T.danger}; }
  .sso-tag-empty { font-size:11px; color:${T.textSubtle}; font-family:'IBM Plex Mono',monospace; align-self:center; }

  /* ── Add domain row ── */
  .sso-add-row { display:flex; gap:8px; }
  .sso-add-row input { flex:1; }
  .sso-add-btn {
    display:inline-flex; align-items:center; gap:5px; padding:0 14px; height:36px;
    border-radius:6px; border:1px solid var(--sec-border); background:var(--sec-bg);
    color:var(--sec-color); font-size:12px; font-weight:600; cursor:pointer;
    font-family:'DM Sans',sans-serif; white-space:nowrap; transition:all 0.15s;
  }
  .sso-add-btn:hover { filter:brightness(1.2); }

  /* ── Save button ── */
  .sso-save-btn {
    display:inline-flex; align-items:center; justify-content:center; gap:7px;
    width:100%; padding:11px 16px; border-radius:8px;
    background:rgba(59,130,246,0.10); border:1px solid rgba(59,130,246,0.35);
    color:${T.accent}; font-size:13px; font-weight:700; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s; margin-top:4px;
  }
  .sso-save-btn:hover:not(:disabled) { filter:brightness(1.15); box-shadow:0 0 20px rgba(0,0,0,0.2); }
  .sso-save-btn:disabled { opacity:0.45; cursor:not-allowed; }

  /* ── Divider ── */
  .sso-divider { height:1px; background:${T.border}; }

  /* ── Sub label ── */
  .sso-sub-label {
    font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    display:flex; align-items:center; gap:6px;
  }
  .sso-sub-label::after { content:''; flex:1; height:1px; background:${T.border}; }

  /* ── Spin ── */
  @keyframes sso-spin { to{transform:rotate(360deg)} }
  .sso-spin { animation:sso-spin 0.7s linear infinite; }
`;

// ══════════════════════════════════════════════════════════════════════════════
export function SsoLdapDashboard() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getSsoConfig);
  const upsert = useServerFn(upsertSsoConfig);

  const q = useQuery({
    queryKey: ["sso-config"],
    queryFn: () => get(),
    enabled: role === "admin" || role === "super_admin",
  });

  const [oauthEnabled, setOauthEnabled] = React.useState(false);
  const [samlEnabled, setSamlEnabled] = React.useState(false);
  const [ldapEnabled, setLdapEnabled] = React.useState(false);
  const [tenant, setTenant] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [samlUrl, setSamlUrl] = React.useState("");
  const [ldapHost, setLdapHost] = React.useState("");
  const [ldapPort, setLdapPort] = React.useState<number | "">("");
  const [ldapBaseDn, setLdapBaseDn] = React.useState("");
  const [ldapBindDn, setLdapBindDn] = React.useState("");
  const [domains, setDomains] = React.useState<string[]>([]);
  const [newDomain, setNewDomain] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const c = q.data?.config;
    if (c) {
      setOauthEnabled(!!c.oauth_enabled);
      setSamlEnabled(!!c.saml_enabled);
      setLdapEnabled(!!c.ldap_enabled);
      setTenant(c.azure_tenant_id ?? "");
      setClientId(c.azure_client_id ?? "");
      setSamlUrl(c.saml_metadata_url ?? "");
      setLdapHost(c.ldap_host ?? "");
      setLdapPort(c.ldap_port ?? "");
      setLdapBaseDn(c.ldap_base_dn ?? "");
      setLdapBindDn(c.ldap_bind_dn ?? "");
      setDomains((c.allowed_domains as string[]) ?? []);
    }
  }, [q.data]);

  if (role !== "admin" && role !== "super_admin") {
    return (
      <div className="sso-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sso-card">
          <div className="sso-card-body">
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Apenas administradores globais podem visualizar/editar esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d)) {
      toast.error("Domínio inválido");
      return;
    }
    if (domains.includes(d)) return;
    setDomains([...domains, d]);
    setNewDomain("");
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          oauth_enabled: oauthEnabled,
          saml_enabled: samlEnabled,
          ldap_enabled: ldapEnabled,
          azure_tenant_id: tenant || null,
          azure_client_id: clientId || null,
          saml_metadata_url: samlUrl || null,
          ldap_host: ldapHost || null,
          ldap_port: ldapPort === "" ? null : Number(ldapPort),
          ldap_base_dn: ldapBaseDn || null,
          ldap_bind_dn: ldapBindDn || null,
          allowed_domains: domains,
        },
      });
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["sso-config"] });
      qc.invalidateQueries({ queryKey: ["sso-public-config"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const redirectUri = q.data?.redirectUri ?? "";
  const secretsOk = q.data?.hasAzureClientSecret && q.data?.hasStateSecret;
  const activeCount = [oauthEnabled, samlEnabled, ldapEnabled].filter(Boolean).length;

  return (
    <div className="sso-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ── */}
      <div className="sso-page-header">
        <div>
          <div className="sso-page-title">SSO / LDAP</div>
          <div className="sso-page-sub">
            Configure autenticação centralizada via Microsoft Entra ID, SAML 2.0 ou LDAP.
          </div>
        </div>
        <div className="sso-status-bar">
          <span className={`sso-status-pill ${activeCount > 0 ? "ok" : "off"}`}>
            <span className="sso-status-dot" />
            {activeCount} ativo{activeCount !== 1 ? "s" : ""}
          </span>
          <span className={`sso-status-pill ${secretsOk ? "ok" : "warn"}`}>
            <span className="sso-status-dot" />
            {secretsOk ? "secrets ok" : "secrets pendentes"}
          </span>
          <span className={`sso-status-pill ${domains.length > 0 ? "ok" : "off"}`}>
            <span className="sso-status-dot" />
            {domains.length} domínio{domains.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Grid row 1: OAuth + Domínios ── */}
      <div className="sso-grid">
        {/* OAuth Microsoft */}
        <SsoCard accent={SECTION_ACCENT.oauth}>
          <div className="sso-card-header">
            <div className="sso-card-header-left">
              <div className="sso-icon-wrap">
                <Shield size={16} style={{ color: SECTION_ACCENT.oauth.color }} />
              </div>
              <div>
                <div className="sso-section-name">SSO Microsoft</div>
                <div className="sso-section-sub">
                  <Link2 size={9} /> OAuth 2.0 / Entra ID
                </div>
              </div>
            </div>
            <span className={`sso-badge ${oauthEnabled ? "yes" : "off"}`}>
              {oauthEnabled ? (
                <>
                  <CheckCircle2 size={10} /> Ativo
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Inativo
                </>
              )}
            </span>
          </div>
          <div className="sso-card-body">
            <div className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Habilitar SSO Microsoft</div>
                <div className="sso-toggle-hint">
                  {oauthEnabled ? "Login via conta Microsoft ativo" : "Desabilitado — login por senha"}
                </div>
              </div>
              <Switch checked={oauthEnabled} onCheckedChange={setOauthEnabled} />
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Tenant ID</span>
              <Input
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Client ID (Application ID)</span>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Redirect URI</span>
              <div className="sso-copy-row">
                <Input value={redirectUri} readOnly />
                <button
                  className="sso-copy-btn"
                  type="button"
                  title="Copiar"
                  onClick={() => {
                    navigator.clipboard.writeText(redirectUri);
                    toast.success("Copiado");
                  }}
                >
                  <Copy size={13} />
                </button>
              </div>
              <span className="sso-field-helper">Registre esta URI no Azure App Registration → Authentication.</span>
            </div>

            <div className="sso-info neutral">
              <KeyRound size={14} style={{ color: T.warning, flexShrink: 0, marginTop: 1 }} />
              <span>
                <b>AZURE_CLIENT_SECRET</b> e <b>SSO_STATE_SECRET</b> são configurados via Secrets do projeto. Status:{" "}
                <span style={{ color: secretsOk ? T.success : T.warning }}>
                  {secretsOk ? "✓ configurados" : "⚠ pendentes"}
                </span>
              </span>
            </div>
          </div>
        </SsoCard>

        {/* Domínios */}
        <SsoCard accent={SECTION_ACCENT.domains}>
          <div className="sso-card-header">
            <div className="sso-card-header-left">
              <div className="sso-icon-wrap">
                <Shield size={16} style={{ color: SECTION_ACCENT.domains.color }} />
              </div>
              <div>
                <div className="sso-section-name">Domínios Permitidos</div>
                <div className="sso-section-sub">
                  <Link2 size={9} /> Filtro por e-mail
                </div>
              </div>
            </div>
            <span className={`sso-badge ${domains.length > 0 ? "yes" : "off"}`}>
              {domains.length > 0 ? (
                <>
                  <CheckCircle2 size={10} /> {domains.length} domínio{domains.length !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Nenhum
                </>
              )}
            </span>
          </div>
          <div className="sso-card-body">
            <div className="sso-info neutral" style={{ marginBottom: 0 }}>
              <span style={{ color: T.textMuted, fontSize: 11, lineHeight: 1.55 }}>
                Apenas e-mails desses domínios são direcionados ao SSO. Os demais continuam com senha.
              </span>
            </div>

            <div className="sso-tags">
              {domains.length === 0 ? (
                <span className="sso-tag-empty">Nenhum domínio cadastrado.</span>
              ) : (
                domains.map((d) => (
                  <span key={d} className="sso-tag">
                    {d}
                    <button
                      type="button"
                      className="sso-tag-rm"
                      onClick={() => setDomains(domains.filter((x) => x !== d))}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="sso-add-row">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="empresa.com"
              />
              <button type="button" className="sso-add-btn" onClick={addDomain}>
                <Plus size={13} /> Adicionar
              </button>
            </div>
          </div>
        </SsoCard>
      </div>

      {/* ── Grid row 2: SAML + LDAP ── */}
      <div className="sso-grid">
        {/* SAML */}
        <SsoCard accent={SECTION_ACCENT.saml}>
          <div className="sso-card-header">
            <div className="sso-card-header-left">
              <div className="sso-icon-wrap">
                <Shield size={16} style={{ color: SECTION_ACCENT.saml.color }} />
              </div>
              <div>
                <div className="sso-section-name">SAML 2.0</div>
                <div className="sso-section-sub">
                  <Link2 size={9} /> Federação de identidade
                </div>
              </div>
            </div>
            <span className={`sso-badge ${samlEnabled ? "yes" : "off"}`}>
              {samlEnabled ? (
                <>
                  <CheckCircle2 size={10} /> Ativo
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Inativo
                </>
              )}
            </span>
          </div>
          <div className="sso-card-body">
            <div className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Habilitar SAML</div>
                <div className="sso-toggle-hint">{samlEnabled ? "Federação SAML habilitada" : "Desabilitado"}</div>
              </div>
              <Switch checked={samlEnabled} onCheckedChange={setSamlEnabled} />
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Metadata URL do IdP</span>
              <Input
                value={samlUrl}
                onChange={(e) => setSamlUrl(e.target.value)}
                placeholder="https://idp.empresa.com/metadata.xml"
              />
              <span className="sso-field-helper">URL do arquivo de metadados do seu Identity Provider.</span>
            </div>

            <div className="sso-info warn">
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Configuração salva. O fluxo SAML completo será habilitado em iteração futura.</span>
            </div>
          </div>
        </SsoCard>

        {/* LDAP */}
        <SsoCard accent={SECTION_ACCENT.ldap}>
          <div className="sso-card-header">
            <div className="sso-card-header-left">
              <div className="sso-icon-wrap">
                <Server size={16} style={{ color: SECTION_ACCENT.ldap.color }} />
              </div>
              <div>
                <div className="sso-section-name">LDAP</div>
                <div className="sso-section-sub">
                  <Link2 size={9} /> Active Directory / OpenLDAP
                </div>
              </div>
            </div>
            <span className={`sso-badge ${ldapEnabled ? "yes" : "off"}`}>
              {ldapEnabled ? (
                <>
                  <CheckCircle2 size={10} /> Ativo
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Inativo
                </>
              )}
            </span>
          </div>
          <div className="sso-card-body">
            <div className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Habilitar LDAP</div>
                <div className="sso-toggle-hint">{ldapEnabled ? "Autenticação LDAP habilitada" : "Desabilitado"}</div>
              </div>
              <Switch checked={ldapEnabled} onCheckedChange={setLdapEnabled} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <div className="sso-field">
                <span className="sso-field-label">Host</span>
                <Input value={ldapHost} onChange={(e) => setLdapHost(e.target.value)} placeholder="ldap.empresa.com" />
              </div>
              <div className="sso-field" style={{ width: 90 }}>
                <span className="sso-field-label">Porta</span>
                <Input
                  type="number"
                  value={ldapPort}
                  onChange={(e) => setLdapPort(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="636"
                />
              </div>
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Base DN</span>
              <Input
                value={ldapBaseDn}
                onChange={(e) => setLdapBaseDn(e.target.value)}
                placeholder="dc=empresa,dc=com"
              />
            </div>

            <div className="sso-field">
              <span className="sso-field-label">Bind DN</span>
              <Input
                value={ldapBindDn}
                onChange={(e) => setLdapBindDn(e.target.value)}
                placeholder="cn=svc,dc=empresa,dc=com"
              />
            </div>

            <div className="sso-info warn">
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Autenticação LDAP via gateway dedicado será habilitada em iteração futura.</span>
            </div>
          </div>
        </SsoCard>
      </div>

      {/* ── Save ── */}
      <button className="sso-save-btn" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={15} className="sso-spin" /> : <Save size={15} />}
        {saving ? "Salvando…" : "Salvar configuração"}
      </button>
    </div>
  );
}

// ── Wrapper que injeta as CSS vars de accent ───────────────────────────────────
function SsoCard({
  accent,
  children,
}: {
  accent: { color: string; bg: string; border: string };
  children: React.ReactNode;
}) {
  return (
    <div
      className="sso-card"
      style={
        {
          "--sec-color": accent.color,
          "--sec-bg": accent.bg,
          "--sec-border": accent.border,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
