import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSsoConfig, upsertSsoConfig } from "@/lib/sso.functions";
import { useAuth } from "@/lib/auth-context";
import { Switch } from "@/components/ui/switch";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { AlertTriangle, Check, ChevronDown, Copy, Plus, X } from "lucide-react";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

type FormState = {
  oauthEnabled: boolean;
  samlEnabled: boolean;
  ldapEnabled: boolean;
  tenant: string;
  clientId: string;
  samlUrl: string;
  ldapHost: string;
  ldapPort: string;
  ldapBaseDn: string;
  ldapBindDn: string;
  domains: string[];
};

const EMPTY: FormState = {
  oauthEnabled: false,
  samlEnabled: false,
  ldapEnabled: false,
  tenant: "",
  clientId: "",
  samlUrl: "",
  ldapHost: "",
  ldapPort: "",
  ldapBaseDn: "",
  ldapBindDn: "",
  domains: [],
};

type SsoRow = {
  oauth_enabled?: boolean | null;
  saml_enabled?: boolean | null;
  ldap_enabled?: boolean | null;
  azure_tenant_id?: string | null;
  azure_client_id?: string | null;
  saml_metadata_url?: string | null;
  ldap_host?: string | null;
  ldap_port?: number | null;
  ldap_base_dn?: string | null;
  ldap_bind_dn?: string | null;
  allowed_domains?: string[] | null;
};

function fromConfig(c: SsoRow | null | undefined): FormState {
  if (!c) return EMPTY;
  return {
    oauthEnabled: !!c.oauth_enabled,
    samlEnabled: !!c.saml_enabled,
    ldapEnabled: !!c.ldap_enabled,
    tenant: c.azure_tenant_id ?? "",
    clientId: c.azure_client_id ?? "",
    samlUrl: c.saml_metadata_url ?? "",
    ldapHost: c.ldap_host ?? "",
    ldapPort: c.ldap_port ? String(c.ldap_port) : "",
    ldapBaseDn: c.ldap_base_dn ?? "",
    ldapBindDn: c.ldap_bind_dn ?? "",
    domains: c.allowed_domains ?? [],
  };
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)}d`;
}

const CSS = `
  .sso-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .sso-root * { box-sizing:border-box; }
  .sso-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .sso-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .sso-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .sso-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .sso-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .sso-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .sso-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .sso-kpi-value.word { font-size:22px; padding:3px 0; }
  .sso-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .sso-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .sso-two { display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(0, 1fr); gap:16px; align-items:start; }
  @media (max-width: 1000px) { .sso-two { grid-template-columns:minmax(0, 1fr); } }
  .sso-col { display:grid; gap:16px; min-width:0; }
  .sso-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .sso-card-h { display:flex; gap:12px; align-items:center; padding:14px 18px; border-bottom:1px solid var(--v2-line); }
  .sso-card-h b { display:block; font-size:14px; font-weight:600; }
  .sso-card-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .sso-card-h .r { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .sso-card-b { display:grid; gap:14px; padding:16px 18px; }
  .sso-ms { width:34px; height:34px; display:grid; grid-template-columns:1fr 1fr; gap:2px; padding:7px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); flex:none; }
  .sso-ms i:nth-child(1) { background:#f25022; }
  .sso-ms i:nth-child(2) { background:#7fba00; }
  .sso-ms i:nth-child(3) { background:#00a4ef; }
  .sso-ms i:nth-child(4) { background:#ffb900; }

  .sso-g2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 600px) { .sso-g2 { grid-template-columns:1fr; } }
  .sso-field { display:grid; gap:6px; font-size:12.5px; font-weight:500; color:var(--v2-fg-2); min-width:0; }
  .sso-field small { font-size:12px; font-weight:400; color:var(--v2-fg-3); line-height:1.5; }
  .sso-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; min-width:0; }
  .sso-input.mono { font-family:var(--font-data); font-size:12.5px; }
  .sso-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .sso-row { display:flex; gap:6px; }
  .sso-row .sso-input { flex:1; }
  .sso-togrow { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .sso-togrow b { display:block; font-size:13px; font-weight:500; }
  .sso-togrow small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .sso-secrets { display:grid; gap:6px; }
  .sso-secrets div { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:8px 12px; border:1px solid var(--v2-line); border-radius:8px; font:12.5px var(--font-data); }

  .sso-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .sso-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .sso-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .sso-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .sso-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .sso-btn.ghost { border-color:transparent; background:transparent; }
  .sso-btn.icon { width:34px; padding:0; justify-content:center; }

  .sso-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); font-family:var(--font-ui); }
  .sso-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }

  .sso-check > div { display:grid; grid-template-columns:20px minmax(0, 1fr); gap:10px; padding:10px 18px; border-top:1px solid var(--v2-line); font-size:13px; align-items:start; }
  .sso-check > div:first-child { border-top:0; }
  .sso-check b { font-weight:500; }
  .sso-check small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .sso-ic { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; margin-top:1px; }
  .sso-ic.ok { background:color-mix(in oklch, var(--v2-ok) 18%, transparent); color:var(--v2-ok); }
  .sso-ic.no { background:color-mix(in oklch, var(--v2-med) 18%, transparent); color:var(--v2-med); }

  .sso-tags { display:flex; flex-wrap:wrap; gap:6px; }
  .sso-tag { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 6px 0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); font:12.5px var(--font-data); }
  .sso-tag button { width:20px; height:20px; border:0; border-radius:4px; background:transparent; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; }
  .sso-tag button:hover { background:var(--v2-hover); color:var(--v2-crit); }
  .sso-empty { font-size:13px; color:var(--v2-fg-3); }

  .sso-flow { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; padding:14px 18px 18px; }
  @media (max-width: 760px) { .sso-flow { grid-template-columns:1fr 1fr; } }
  .sso-flow div { display:grid; grid-template-rows:auto auto 1fr; gap:6px; font-size:12.5px; color:var(--v2-fg-2); align-content:start; }
  .sso-flow b { font-size:12.5px; color:var(--v2-fg); font-weight:600; }
  .sso-flow .n { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); font:600 11.5px var(--font-data); }

  .sso-sec-h { display:flex; align-items:baseline; gap:8px; margin:4px 0 -6px; font-size:15px; font-weight:600; }
  .sso-sec-h span { font-size:12.5px; font-weight:400; color:var(--v2-fg-3); }
  .sso-others { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
  @media (max-width: 900px) { .sso-others { grid-template-columns:1fr; } }
  .sso-oc { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .sso-oc summary { list-style:none; display:flex; gap:12px; align-items:center; padding:14px 18px; cursor:pointer; }
  .sso-oc summary::-webkit-details-marker { display:none; }
  .sso-oc summary b { display:block; font-size:14px; font-weight:600; }
  .sso-oc summary small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .sso-oc summary .r { margin-left:auto; display:flex; gap:8px; align-items:center; color:var(--v2-fg-3); }
  .sso-oc summary .r svg { transition:transform .15s; }
  .sso-oc[open] summary .r svg { transform:rotate(180deg); }
  .sso-oc[open] summary { border-bottom:1px solid var(--v2-line); }
  .sso-note { display:flex; gap:8px; padding:10px 12px; border-radius:8px; background:color-mix(in oklch, var(--v2-med) 9%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 30%, transparent); font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }
  .sso-note svg { color:var(--v2-med); flex:none; margin-top:2px; }

  .sso-savebar { position:sticky; bottom:12px; z-index:5; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 16px; background:color-mix(in oklch, var(--v2-surface) 92%, transparent); backdrop-filter:blur(6px); border:1px solid var(--v2-line); border-radius:12px; font-size:13px; color:var(--v2-fg-2); }
  .sso-savebar .dot { width:8px; height:8px; border-radius:50%; background:var(--v2-med); display:inline-block; margin-right:8px; }
`;

export function SsoLdapDashboard() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getSsoConfig);
  const upsert = useServerFn(upsertSsoConfig);
  const isAdmin = role === "admin" || role === "super_admin";

  const q = useQuery({ queryKey: ["sso-config"], queryFn: () => get(), enabled: isAdmin });

  // Logins dos últimos 30 dias (método e resultado) para os indicadores
  const loginsQ = useQuery({
    queryKey: ["sso-logins-30d"],
    enabled: isAdmin,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("auth_access_logs")
        .select("login_method, status, created_at")
        .eq("event_type", "login")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Array<{
        login_method: string | null;
        status: string;
        created_at: string;
      }>;
    },
  });

  const saved = React.useMemo(() => fromConfig(q.data?.config as SsoRow | null), [q.data]);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [newDomain, setNewDomain] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm(saved);
  }, [saved]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  if (!isAdmin) {
    return (
      <div className="sso-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sso-card">
          <div className="sso-card-b sso-empty">
            Apenas administradores globais podem visualizar ou editar esta página.
          </div>
        </div>
      </div>
    );
  }
  if (q.isLoading) return <ModuleLoading />;

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (!DOMAIN_RE.test(d)) {
      toast.error("Domínio inválido");
      return;
    }
    if (!form.domains.includes(d)) set("domains", [...form.domains, d]);
    setNewDomain("");
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          oauth_enabled: form.oauthEnabled,
          saml_enabled: form.samlEnabled,
          ldap_enabled: form.ldapEnabled,
          azure_tenant_id: form.tenant.trim() || null,
          azure_client_id: form.clientId.trim() || null,
          saml_metadata_url: form.samlUrl.trim() || null,
          ldap_host: form.ldapHost.trim() || null,
          ldap_port: form.ldapPort === "" ? null : Number(form.ldapPort),
          ldap_base_dn: form.ldapBaseDn.trim() || null,
          ldap_bind_dn: form.ldapBindDn.trim() || null,
          allowed_domains: form.domains,
        },
      });
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["sso-config"] });
      qc.invalidateQueries({ queryKey: ["sso-public-config"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const redirectUri = q.data?.redirectUri ?? "";
  const hasIds = !!form.tenant.trim() && !!form.clientId.trim();
  const checks: Array<[boolean, string, string]> = [
    [hasIds, "Tenant ID e Client ID preenchidos", "App Registration no Microsoft Entra ID"],
    [
      !!q.data?.hasAzureClientSecret,
      "AZURE_CLIENT_SECRET configurado",
      "variável de ambiente do servidor",
    ],
    [
      !!q.data?.hasStateSecret,
      "SSO_STATE_SECRET configurado",
      "assina o state do login (proteção anti-CSRF)",
    ],
    [
      form.domains.length > 0,
      "Ao menos um domínio permitido",
      form.domains.length
        ? `${form.domains.length} ${form.domains.length === 1 ? "domínio" : "domínios"}`
        : "sem domínio, ninguém é enviado ao SSO",
    ],
    [
      form.oauthEnabled,
      "SSO Microsoft habilitado",
      form.oauthEnabled ? "aparece na tela de login" : "login só por e-mail e senha",
    ],
  ];
  const readyCount = checks.filter((c) => c[0]).length;
  const ready = readyCount === checks.length;
  const savedReady = ready && !dirty;

  const logins = loginsQ.data ?? [];
  const okLogins = logins.filter((l) => l.status === "success");
  const ssoOk = okLogins.filter((l) => l.login_method === "sso_azure").length;
  const ssoFails = logins.filter((l) => l.login_method === "sso_azure" && l.status === "error");
  const ssoShare = okLogins.length ? Math.round((ssoOk / okLogins.length) * 100) : 0;

  const ssoState = !saved.oauthEnabled ? "Desligado" : savedReady ? "Ativo" : "Incompleto";
  const ssoColor =
    ssoState === "Ativo"
      ? "var(--v2-ok)"
      : ssoState === "Incompleto"
        ? "var(--v2-med)"
        : "var(--v2-fg-3)";

  return (
    <div className="sso-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="sso-ph-title">SSO / LDAP</h1>
        <p className="sso-ph-sub">Login centralizado com a conta corporativa Microsoft</p>
      </div>

      <div className="sso-kpis">
        <div className="sso-kpi">
          <span className="sso-kpi-label">
            <span className="sso-sw" style={{ background: ssoColor }} />
            SSO Microsoft
          </span>
          <span className="sso-kpi-value word">{ssoState}</span>
          <span className="sso-kpi-foot">
            {readyCount} de {checks.length} itens prontos
          </span>
        </div>
        <div className="sso-kpi">
          <span className="sso-kpi-label">Logins via SSO · 30 dias</span>
          <span className="sso-kpi-value">{ssoOk.toLocaleString("pt-BR")}</span>
          <span className="sso-kpi-foot">
            {okLogins.length ? `${ssoShare}% dos logins com sucesso` : "nenhum login no período"}
          </span>
        </div>
        <div className="sso-kpi">
          <span className="sso-kpi-label">
            {ssoFails.length > 0 && (
              <span className="sso-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Falhas de SSO · 30 dias
          </span>
          <span className="sso-kpi-value">{ssoFails.length}</span>
          <span className="sso-kpi-foot">
            {ssoFails.length
              ? `última ${fmtAgo(ssoFails[0].created_at)} · detalhes na Central de Logs`
              : "nenhuma falha"}
          </span>
        </div>
        <div className="sso-kpi">
          <span className="sso-kpi-label">Domínios permitidos</span>
          <span className="sso-kpi-value">{saved.domains.length}</span>
          <span className="sso-kpi-foot">e-mails desses domínios vão para o SSO</span>
        </div>
      </div>

      <div className="sso-two">
        <div className="sso-col">
          <section className="sso-card">
            <div className="sso-card-h">
              <span className="sso-ms" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>Microsoft Entra ID</b>
                <small>OAuth 2.0 / OpenID Connect</small>
              </span>
              <span className="r">
                <span
                  className="sso-pill"
                  style={
                    {
                      "--c": form.oauthEnabled ? "var(--v2-ok)" : "var(--v2-fg-3)",
                    } as React.CSSProperties
                  }
                >
                  {form.oauthEnabled ? "Ativo" : "Desligado"}
                </span>
              </span>
            </div>
            <div className="sso-card-b">
              <div className="sso-togrow">
                <span>
                  <b>Entrar com Microsoft</b>
                  <small>
                    {form.oauthEnabled
                      ? "E-mails dos domínios permitidos são enviados para a Microsoft"
                      : "Todos entram com e-mail e senha"}
                  </small>
                </span>
                <Switch
                  checked={form.oauthEnabled}
                  onCheckedChange={(v) => set("oauthEnabled", v)}
                  aria-label="Entrar com Microsoft"
                />
              </div>
              <div className="sso-g2">
                <label className="sso-field">
                  Tenant ID
                  <input
                    className="sso-input mono"
                    value={form.tenant}
                    onChange={(e) => set("tenant", e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </label>
                <label className="sso-field">
                  Client ID (Application ID)
                  <input
                    className="sso-input mono"
                    value={form.clientId}
                    onChange={(e) => set("clientId", e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </label>
              </div>
              <div className="sso-field">
                Redirect URI
                <div className="sso-row">
                  <input
                    className="sso-input mono"
                    value={redirectUri}
                    readOnly
                    aria-label="Redirect URI"
                  />
                  <button
                    type="button"
                    className="sso-btn icon"
                    title="Copiar"
                    aria-label="Copiar Redirect URI"
                    onClick={() => {
                      navigator.clipboard.writeText(redirectUri).then(
                        () => toast.success("Copiado"),
                        () => toast.error("Não foi possível copiar"),
                      );
                    }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <small>Cadastre em App Registration → Authentication → Web → Redirect URIs.</small>
              </div>
              <div className="sso-field">
                Segredos do servidor
                <div className="sso-secrets">
                  {(
                    [
                      ["AZURE_CLIENT_SECRET", q.data?.hasAzureClientSecret],
                      ["SSO_STATE_SECRET", q.data?.hasStateSecret],
                    ] as Array<[string, boolean | undefined]>
                  ).map(([name, ok]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <span
                        className="sso-pill"
                        style={
                          { "--c": ok ? "var(--v2-ok)" : "var(--v2-med)" } as React.CSSProperties
                        }
                      >
                        {ok ? "Configurado" : "Pendente"}
                      </span>
                    </div>
                  ))}
                </div>
                <small>
                  Ficam nas variáveis de ambiente do servidor, nunca no banco nem nesta tela.
                </small>
              </div>
            </div>
          </section>

          <section className="sso-card">
            <div className="sso-card-h">
              <span>
                <b>Como o login funciona</b>
                <small>do e-mail digitado até a sessão no Z-Sec</small>
              </span>
            </div>
            <div className="sso-flow">
              {[
                ["E-mail", "A pessoa digita o e-mail na tela de login"],
                ["Domínio", "Se for de um domínio permitido, vai para a Microsoft"],
                [
                  "Microsoft",
                  "Autentica com a conta corporativa e as políticas do Entra (ex.: MFA)",
                ],
                ["Retorno", "A Redirect URI valida o state e abre a sessão"],
              ].map(([t, d], i) => (
                <div key={t}>
                  <span className="n">{i + 1}</span>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="sso-col">
          <section className="sso-card">
            <div className="sso-card-h">
              <span>
                <b>Prontidão</b>
                <small>o que falta para o SSO funcionar</small>
              </span>
              <span className="r">
                <span
                  className="sso-pill"
                  style={{ "--c": ready ? "var(--v2-ok)" : "var(--v2-med)" } as React.CSSProperties}
                >
                  {ready ? "Pronto" : "Pendente"}
                </span>
              </span>
            </div>
            <div className="sso-check">
              {checks.map(([ok, title, sub]) => (
                <div key={title}>
                  <span className={`sso-ic ${ok ? "ok" : "no"}`}>
                    {ok ? <Check size={12} /> : <AlertTriangle size={11} />}
                  </span>
                  <span>
                    <b>{title}</b>
                    <small>{sub}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="sso-card">
            <div className="sso-card-h">
              <span>
                <b>Domínios permitidos</b>
                <small>só e-mails destes domínios vão para o SSO; os demais usam senha</small>
              </span>
            </div>
            <div className="sso-card-b">
              <div className="sso-tags">
                {form.domains.length === 0 ? (
                  <span className="sso-empty">Nenhum domínio cadastrado.</span>
                ) : (
                  form.domains.map((d) => (
                    <span key={d} className="sso-tag">
                      {d}
                      <button
                        type="button"
                        aria-label={`Remover ${d}`}
                        onClick={() =>
                          set(
                            "domains",
                            form.domains.filter((x) => x !== d),
                          )
                        }
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="sso-row">
                <input
                  className="sso-input"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                  placeholder="empresa.com.br"
                  aria-label="Novo domínio"
                />
                <button type="button" className="sso-btn" onClick={addDomain}>
                  <Plus size={14} />
                  Adicionar
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="sso-sec-h">
        Outros métodos <span>· configuração guardada, login ainda não disponível</span>
      </div>
      <div className="sso-others">
        <details className="sso-oc">
          <summary>
            <span>
              <b>SAML 2.0</b>
              <small>Federação com outro provedor de identidade</small>
            </span>
            <span className="r">
              <span className="sso-pill" style={{ "--c": "var(--v2-fg-3)" } as React.CSSProperties}>
                Em breve
              </span>
              <ChevronDown size={14} />
            </span>
          </summary>
          <div className="sso-card-b">
            <div className="sso-note">
              <AlertTriangle size={13} />
              <span>
                O fluxo SAML ainda não foi implementado. O que for salvo aqui fica guardado para
                quando existir.
              </span>
            </div>
            <div className="sso-togrow">
              <span>
                <b>Habilitar SAML</b>
                <small>
                  {form.samlEnabled ? "Habilitado (sem efeito no login por enquanto)" : "Desligado"}
                </small>
              </span>
              <Switch
                checked={form.samlEnabled}
                onCheckedChange={(v) => set("samlEnabled", v)}
                aria-label="Habilitar SAML"
              />
            </div>
            <label className="sso-field">
              Metadata URL do IdP
              <input
                className="sso-input"
                value={form.samlUrl}
                onChange={(e) => set("samlUrl", e.target.value)}
                placeholder="https://idp.empresa.com/metadata.xml"
              />
            </label>
          </div>
        </details>

        <details className="sso-oc">
          <summary>
            <span>
              <b>LDAP</b>
              <small>Active Directory / OpenLDAP</small>
            </span>
            <span className="r">
              <span className="sso-pill" style={{ "--c": "var(--v2-fg-3)" } as React.CSSProperties}>
                Em breve
              </span>
              <ChevronDown size={14} />
            </span>
          </summary>
          <div className="sso-card-b">
            <div className="sso-note">
              <AlertTriangle size={13} />
              <span>A autenticação LDAP via gateway dedicado ainda não foi implementada.</span>
            </div>
            <div className="sso-togrow">
              <span>
                <b>Habilitar LDAP</b>
                <small>
                  {form.ldapEnabled ? "Habilitado (sem efeito no login por enquanto)" : "Desligado"}
                </small>
              </span>
              <Switch
                checked={form.ldapEnabled}
                onCheckedChange={(v) => set("ldapEnabled", v)}
                aria-label="Habilitar LDAP"
              />
            </div>
            <div className="sso-g2">
              <label className="sso-field">
                Host
                <input
                  className="sso-input mono"
                  value={form.ldapHost}
                  onChange={(e) => set("ldapHost", e.target.value)}
                  placeholder="ldap.empresa.com"
                />
              </label>
              <label className="sso-field">
                Porta
                <input
                  className="sso-input mono"
                  type="number"
                  value={form.ldapPort}
                  onChange={(e) => set("ldapPort", e.target.value)}
                  placeholder="636"
                />
              </label>
            </div>
            <label className="sso-field">
              Base DN
              <input
                className="sso-input mono"
                value={form.ldapBaseDn}
                onChange={(e) => set("ldapBaseDn", e.target.value)}
                placeholder="dc=empresa,dc=com"
              />
            </label>
            <label className="sso-field">
              Bind DN
              <input
                className="sso-input mono"
                value={form.ldapBindDn}
                onChange={(e) => set("ldapBindDn", e.target.value)}
                placeholder="cn=svc,dc=empresa,dc=com"
              />
            </label>
          </div>
        </details>
      </div>

      <div className="sso-savebar">
        <span>
          {dirty ? (
            <>
              <span className="dot" />
              Alterações não salvas
            </>
          ) : (
            "Tudo salvo"
          )}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {dirty && (
            <button className="sso-btn ghost" onClick={() => setForm(saved)} disabled={saving}>
              Descartar
            </button>
          )}
          <button className="sso-btn primary" onClick={save} disabled={saving || !dirty}>
            <Check size={14} />
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </span>
      </div>
    </div>
  );
}
