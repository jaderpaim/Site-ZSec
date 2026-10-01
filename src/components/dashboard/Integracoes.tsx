import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { upsertIntegration } from "@/lib/integrations.functions";
import { generateSekRenewalToken, getSekSessionStatus, listSekZendeskAuthLog } from "@/lib/sek-zendesk.functions";
import {
  getSastIngestKeyStatus,
  revokePreviousSastIngestKey,
  rotateSastIngestKey,
} from "@/lib/sast-ingest-key.functions";
import { Panel, Badge } from "./primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Globe,
  ShieldCheck,
  Lock,
  Fish,
  Save,
  Link2,
  Radar,
  CheckCircle2,
  AlertCircle,
  Activity,
  Mail,
  FileWarning,
  Ticket,
  RefreshCw,
  Copy,
  Download,
  GitBranch,
} from "lucide-react";

// ── Types — INALTERADOS ────────────────────────────────────────────────────────
type Provider =
  | "cloudflare"
  | "sophos"
  | "privacy_tools"
  | "gophish"
  | "qradar"
  | "zabbix"
  | "sendgrid"
  | "dast_scanner"
  | "purview_dlp"
  | "azure_app_insights"
  | "azure_devops_sast";

type Integration = {
  id: string;
  provider: Provider;
  name: string;
  enabled: boolean;
  base_url: string | null;
  api_key: string | null;
  config: Record<string, unknown> | null;
};

const PROVIDERS: Array<{
  key: Provider;
  name: string;
  module: string;
  moduleSlug: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  defaultBaseUrl: string;
  apiKeyLabel: string;
  helper: string;
}> = [
  {
    key: "cloudflare",
    name: "Cloudflare",
    module: "Cloudflare WAF",
    moduleSlug: "cloudflare-waf",
    icon: Globe,
    defaultBaseUrl: "https://api.cloudflare.com/client/v4",
    apiKeyLabel: "API Token",
    helper: "Token com permissão de leitura em Zone / WAF.",
  },
  {
    key: "sophos",
    name: "Sophos",
    module: "Sophos XDR",
    moduleSlug: "sophos-xdr",
    icon: ShieldCheck,
    defaultBaseUrl: "https://api.central.sophos.com",
    apiKeyLabel: "Client Secret",
    helper:
      "Sophos Central usa OAuth2 (client_credentials). Crie em Sophos Central → Global Settings → API Credentials Management e copie Client ID + Client Secret.",
  },
  {
    key: "privacy_tools",
    name: "Privacy Tools",
    module: "Privacy Tools (LGPD)",
    moduleSlug: "privacy-tools",
    icon: Lock,
    defaultBaseUrl: "https://dpo.privacytools.com.br",
    apiKeyLabel: "Segredo do Cliente",
    helper:
      "Privacy Tools usa OAuth2 Password Grant. Preencha Client ID, Segredo do Cliente, Chave Pública e Senha conforme as Variáveis exibidas no painel Privacy Tools → Integrações.",
  },
  {
    key: "gophish",
    name: "Gophish",
    module: "Simulação de Phishing",
    moduleSlug: "phishing",
    icon: Fish,
    defaultBaseUrl: "https://gophish.local:3333",
    apiKeyLabel: "API Key",
    helper: "API Key disponível em Settings → Account do Gophish.",
  },
  {
    key: "qradar",
    name: "IBM QRadar SIEM",
    module: "SOC",
    moduleSlug: "soc",
    icon: Radar,
    defaultBaseUrl: "https://qradar.local/api",
    apiKeyLabel: "SEC Token",
    helper:
      "Token de autorização do QRadar (Admin → User Management → Authorized Services). Configure após salvar a integração.",
  },
  {
    key: "zabbix",
    name: "Zabbix",
    module: "Monitoramento Zabbix",
    moduleSlug: "zabbix",
    icon: Activity,
    defaultBaseUrl: "https://zabbix.local/api_jsonrpc.php",
    apiKeyLabel: "API Token",
    helper:
      "Gere um API Token em Users → API tokens no Zabbix. Configurações adicionais podem ser definidas após salvar a integração.",
  },
  {
    key: "sendgrid",
    name: "SendGrid",
    module: "Estatísticas e Logs de E-mail",
    moduleSlug: "sendgrid",
    icon: Mail,
    defaultBaseUrl: "https://api.sendgrid.com/v3",
    apiKeyLabel: "API Key",
    helper:
      "Somente leitura — o envio de e-mails continua exclusivamente pelo módulo SMTP. Crie uma Restricted API Key em Settings → API Keys no SendGrid com permissões de leitura (Stats, Activity, Account Details).",
  },
  {
    key: "dast_scanner",
    name: "DAST Scanner",
    module: "DAST Security Scanner",
    moduleSlug: "dast-scanner",
    icon: Radar,
    defaultBaseUrl: "https://scanner.seudominio.com.br",
    apiKeyLabel: "API Key (SCANNER_API_SECRET)",
    helper:
      "Hostname público do túnel Cloudflare até a VM do scanner (ZAP/Nuclei/Amass/Nmap/Nikto) e a mesma chave configurada em SCANNER_API_SECRET no .env do scanner.",
  },
  {
    key: "purview_dlp",
    name: "Microsoft Purview DLP",
    module: "DLP",
    moduleSlug: "dlp",
    icon: FileWarning,
    defaultBaseUrl: "",
    apiKeyLabel: "Client Secret",
    helper:
      "Microsoft Purview DLP usa OAuth2 (client_credentials) via Office 365 Management Activity API. Crie em Microsoft Entra ID → App registrations → New registration, e em Certificates & secrets copie o Client Secret.",
  },
];

// SAST não entra em PROVIDERS: é um card próprio (SastIntegrationCard) com duas
// abas de ativação independente, mesmo padrão do Sophos SIEM/Auditoria. Cada
// aba grava na sua própria linha de `integrations` (o backend lê cada uma
// separado -- sast.server.ts / sast-ingest.server.ts).
const SAST_APP_INSIGHTS = "azure_app_insights" as const;
const SAST_DEVOPS = "azure_devops_sast" as const;

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  surfaceHover: "var(--tl-161c2e, #161C2E)",
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

// ── Provider accent colors ─────────────────────────────────────────────────────
const PROVIDER_ACCENT: Record<Provider, { color: string; bg: string; border: string }> = {
  cloudflare: { color: "#F6821F", bg: "rgba(246,130,31,0.10)", border: "rgba(246,130,31,0.25)" },
  sophos: { color: "#00B6DE", bg: "rgba(0,182,222,0.10)", border: "rgba(0,182,222,0.25)" },
  privacy_tools: {
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.10)",
    border: "rgba(167,139,250,0.25)",
  },
  gophish: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
  qradar: { color: "#3B82F6", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  zabbix: { color: "#D40000", bg: "rgba(212,0,0,0.10)", border: "rgba(212,0,0,0.25)" },
  sendgrid: { color: "#1A82E2", bg: "rgba(26,130,226,0.10)", border: "rgba(26,130,226,0.25)" },
  dast_scanner: { color: "#EF4444", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)" },
  purview_dlp: { color: "#14B8A6", bg: "rgba(20,184,166,0.10)", border: "rgba(20,184,166,0.25)" },
  azure_app_insights: { color: "#8B5CF6", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.25)" },
  azure_devops_sast: { color: "#0EA5E9", bg: "rgba(14,165,233,0.10)", border: "rgba(14,165,233,0.25)" },
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .int-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .int-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .int-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
  }
  .int-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .int-page-sub {
    font-size:12px; color:${T.textMuted}; margin-top:3px;
    font-family:'DM Sans',sans-serif; line-height:1.5;
  }
  .int-status-bar { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .int-status-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .int-status-pill.ok  { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .int-status-pill.off { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }
  .int-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; }

  /* ── Grid ── */
  .int-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }

  /* ── Provider card ── */
  .int-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    overflow:hidden; display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .int-card:hover { border-color:${T.borderHi}; box-shadow:0 8px 32px rgba(0,0,0,0.3); }

  .int-card-header {
    padding:16px 20px 14px; background:${T.surfaceAlt};
    border-bottom:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between;
    position:relative; overflow:hidden;
  }
  .int-card-header::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--provider-color, ${T.accent});
  }
  .int-card-header-left { display:flex; align-items:center; gap:10px; }

  .int-icon-wrap {
    width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;
    background:var(--provider-bg, ${T.accentSoft}); border:1px solid var(--provider-border, rgba(59,130,246,0.2));
    flex-shrink:0;
  }

  .int-provider-name {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .int-module-link {
    display:inline-flex; align-items:center; gap:4px;
    font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    margin-top:2px; letter-spacing:0.04em;
  }

  .int-configured-badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
    border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .int-configured-badge.yes { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .int-configured-badge.no  { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }

  /* ── Card body ── */
  .int-card-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; flex:1; }

  /* ── Toggle row ── */
  .int-toggle-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; background:${T.surfaceAlt}; border-radius:7px;
    border:1px solid ${T.border};
  }
  .int-toggle-label { font-size:12px; font-weight:600; color:${T.textSecondary}; }
  .int-toggle-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:1px; }

  /* ── Field ── */
  .int-field { display:flex; flex-direction:column; gap:5px; }
  .int-field-label {
    font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .int-field-helper {
    font-size:10px; color:${T.textSubtle}; font-family:'DM Sans',sans-serif;
    line-height:1.5; margin-top:1px;
  }

  /* ── Input override ── */
  .int-root input[type="text"],
  .int-root input[type="password"],
  .int-root input:not([type]) {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:12px !important; border-radius:6px !important;
    transition:border-color 0.15s, box-shadow 0.15s !important;
  }
  .int-root input:focus {
    border-color:rgba(59,130,246,0.5) !important; outline:none !important;
    box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important;
  }
  .int-root input::placeholder { color:${T.textSubtle} !important; }

  /* ── Divider ── */
  .int-divider { height:1px; background:${T.border}; margin:2px 0; }

  /* ── Tab content (Sophos: SIEM / Auditoria) ── */
  .int-tab-body { display:flex; flex-direction:column; gap:14px; margin-top:14px; }

  /* ── Sub-section label ── */
  .int-sub-label {
    font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    display:flex; align-items:center; gap:6px; margin-bottom:2px;
  }
  .int-sub-label::after { content:''; flex:1; height:1px; background:${T.border}; }

  /* ── Save button ── */
  .int-save-btn {
    display:inline-flex; align-items:center; justify-content:center; gap:7px;
    width:100%; padding:10px 16px; border-radius:7px;
    background:var(--provider-bg, ${T.accentSoft});
    border:1px solid var(--provider-border, rgba(59,130,246,0.35));
    color:var(--provider-color, ${T.accent});
    font-size:12px; font-weight:700; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s;
    margin-top:4px;
  }
  .int-save-btn:hover:not(:disabled) { filter:brightness(1.15); box-shadow:0 0 20px rgba(0,0,0,0.2); }
  .int-save-btn:disabled { opacity:0.45; cursor:not-allowed; }

  /* ── Scrollbar ── */
  .int-root ::-webkit-scrollbar { width:4px; height:4px; }
  .int-root ::-webkit-scrollbar-track { background:transparent; }
  .int-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Spin ── */
  @keyframes int-spin { to{transform:rotate(360deg)} }
  .int-spin { animation:int-spin 0.7s linear infinite; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export function IntegracoesDashboard() {
  const qc = useQueryClient();

  // ── Query — INALTERADA ─────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async (): Promise<Integration[]> => {
      const { data, error } = await supabase
        .from("integrations")
        .select("id, provider, name, enabled, base_url, api_key, config");
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
  });

  const byProvider = React.useMemo(() => {
    const m = new Map<Provider, Integration>();
    data?.forEach((i) => m.set(i.provider, i));
    return m;
  }, [data]);

  // O card SAST conta como uma integração: configurada se qualquer aba estiver
  // pronta (App Insights com credencial, ou Azure DevOps ligado -- não tem credencial).
  const sastAi = byProvider.get(SAST_APP_INSIGHTS);
  const sastAdo = byProvider.get(SAST_DEVOPS);
  const sastConfigured = !!sastAi?.api_key || !!sastAdo?.enabled;
  const sastActive = !!sastAi?.enabled || !!sastAdo?.enabled;
  const totalCount = PROVIDERS.length + 1;
  const configuredCount = PROVIDERS.filter((p) => byProvider.get(p.key)?.api_key).length + (sastConfigured ? 1 : 0);
  const activeCount = PROVIDERS.filter((p) => byProvider.get(p.key)?.enabled).length + (sastActive ? 1 : 0);

  return (
    <div className="int-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="int-page-header">
        <div>
          <div className="int-page-title">Integrações de API</div>
          <div className="int-page-sub">
            Configure credenciais das ferramentas externas. Cada integração alimenta o módulo correspondente.
          </div>
        </div>
        <div className="int-status-bar">
          <span className="int-status-pill ok">
            <span className="int-status-dot" />
            {configuredCount} configuradas
          </span>
          <span className="int-status-pill ok">
            <span className="int-status-dot" />
            {activeCount} ativas
          </span>
          <span className="int-status-pill off">
            <span className="int-status-dot" />
            {totalCount - configuredCount} pendentes
          </span>
        </div>
      </div>

      {/* ── Provider grid ─────────────────────────────────────────────────── */}
      <div className="int-grid">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.key}
            provider={p}
            integration={byProvider.get(p.key)}
            loading={isLoading}
            onSaved={() => qc.invalidateQueries({ queryKey: ["integrations"] })}
          />
        ))}
        <SastIntegrationCard
          appInsights={sastAi}
          devops={sastAdo}
          loading={isLoading}
          onSaved={() => qc.invalidateQueries({ queryKey: ["integrations"] })}
        />
        <SekZendeskCard />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEK / ZENDESK — não é um provider genérico (sem base_url/api_key): a sessão
// é renovada localmente via sek-session-capture (Playwright), não por
// credencial de API armazenada aqui. Ver handoff em memória do projeto.
// ══════════════════════════════════════════════════════════════════════════════
const SEK_ACCENT = { color: "#22D3EE", bg: "rgba(34,211,238,0.10)", border: "rgba(34,211,238,0.25)" };
// Instalador Windows do sek-session-capture, hospedado no Storage do próprio
// Supabase/Lovable (bucket público "installers"). macOS fica pra uma próxima
// leva -- combinado com o usuário.
const SEK_INSTALLER_URL =
  "https://tcacmepuiyoqkypatkqa.supabase.co/storage/v1/object/public/installers/sek-session-capture-setup.exe";

function SekZendeskCard() {
  const generateTokenFn = useServerFn(generateSekRenewalToken);
  const listLogFn = useServerFn(listSekZendeskAuthLog);
  const statusFn = useServerFn(getSekSessionStatus);
  const [token, setToken] = React.useState<string | null>(null);

  const { data: log, error: logError } = useQuery({
    queryKey: ["sek-zendesk-auth-log"],
    queryFn: () => listLogFn(),
  });
  React.useEffect(() => {
    if (logError) toast.error((logError as Error).message);
  }, [logError]);

  const { data: sessionStatus, error: statusError } = useQuery({
    queryKey: ["sek-zendesk-session-status"],
    queryFn: () => statusFn(),
  });
  React.useEffect(() => {
    if (statusError) toast.error((statusError as Error).message);
  }, [statusError]);

  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: () => generateTokenFn(),
    onSuccess: (result) => {
      setToken(result.token);
      toast.success(`Token gerado — válido por ${Math.round(result.expiresInSeconds / 60)} min, uso único`);
      // A sessão nova só existe de fato depois que o usuário roda o SEK
      // Session Capture localmente e ele reporta pro worker -- invalida
      // aqui de qualquer forma pra pegar o refresh se o usuário já tiver
      // feito isso rápido (ex.: renovação de rotina, app já configurado).
      qc.invalidateQueries({ queryKey: ["sek-zendesk-session-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyToken() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    toast.success("Token copiado");
  }

  const cssVars = {
    "--provider-color": SEK_ACCENT.color,
    "--provider-bg": SEK_ACCENT.bg,
    "--provider-border": SEK_ACCENT.border,
  } as React.CSSProperties;

  return (
    <div className="int-card" style={cssVars}>
      <div className="int-card-header">
        <div className="int-card-header-left">
          <div className="int-icon-wrap">
            <Ticket className="size-4" style={{ color: SEK_ACCENT.color }} />
          </div>
          <div>
            <div className="int-provider-name">SEK / Zendesk</div>
            <div className="int-module-link">
              <Link2 size={9} />
              Automação de Chamados
            </div>
          </div>
        </div>
        <span className={`int-configured-badge ${sessionStatus?.sessions.length ? "yes" : "no"}`}>
          {sessionStatus?.sessions.length ? (
            <>
              <CheckCircle2 size={10} /> {sessionStatus.sessions.length} sessão(ões) vigente(s)
            </>
          ) : (
            <>
              <AlertCircle size={10} /> Nunca renovada
            </>
          )}
        </span>
      </div>

      <div className="int-card-body">
        <div className="int-field">
          <span className="int-field-label">Sessões vigentes</span>
          {sessionStatus?.sessions.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sessionStatus.sessions.map((s) => (
                <div
                  key={s.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--provider-border)",
                    background: "var(--provider-bg)",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</span>
                  <span className="int-toggle-hint" style={{ marginTop: 0 }}>
                    {new Date(s.lastModified).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="int-toggle-hint" style={{ marginTop: 0 }}>
              Nenhuma sessão vigente ainda.
            </div>
          )}
          {sessionStatus?.legacy && (
            <div className="int-field-helper">
              Existe uma sessão no formato antigo (de antes de sessões por usuário) ainda sendo usada só como
              apoio pro sync — quem a criou precisa renovar de novo pra aparecer aqui e poder responder chamados.
            </div>
          )}
        </div>

        <Button onClick={() => generate.mutate()} disabled={generate.isPending} size="sm">
          <RefreshCw className="size-3.5" />
          Gerar token de renovação
        </Button>

        <Button variant="outline" size="sm" asChild>
          <a href={SEK_INSTALLER_URL} download>
            <Download className="size-3.5" />
            Baixar instalador (Windows)
          </a>
        </Button>

        {token && (
          <div className="int-field">
            <span className="int-field-label">Token de renovação (10 min, uso único)</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Input readOnly value={token} onFocus={(e) => e.target.select()} />
              <Button variant="secondary" size="sm" onClick={copyToken}>
                <Copy className="size-3.5" />
              </Button>
            </div>
            <div className="int-field-helper">
              Abra o <strong>SEK Session Capture</strong> (instalado localmente) e cole esse token quando ele pedir.
            </div>
          </div>
        )}

        {Array.isArray(log) && log.length > 0 && (
          <div className="int-field">
            <span className="int-field-label">Histórico recente</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
              {(log as Array<{ id: string; reported_at?: string; created_at?: string; triggered_by_name?: string }>)
                .slice(0, 6)
                .map((entry) => (
                  <div key={entry.id} className="int-toggle-hint">
                    {new Date(entry.reported_at ?? entry.created_at ?? "").toLocaleString("pt-BR")} —{" "}
                    {entry.triggered_by_name ?? "desconhecido"}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAST — um card, duas origens com ativação independente (padrão Sophos
// SIEM/Auditoria). Cada aba = uma linha própria em `integrations`:
//   azure_devops_sast  -> ingestão direta da pipeline (sast-ingest), sem credencial
//   azure_app_insights -> sync do App Insights (sast-sync), Service Principal
// As duas convivem: caem nos mesmos achados sem duplicar (migration 20260929100000).
// ══════════════════════════════════════════════════════════════════════════════
const ADO_ORG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/; // mesma regra de sast-ingest.server.ts

function SastIntegrationCard({
  appInsights,
  devops,
  loading,
  onSaved,
}: {
  appInsights?: Integration;
  devops?: Integration;
  loading: boolean;
  onSaved: () => void;
}) {
  const aiCfg = (appInsights?.config ?? {}) as Record<string, any>;
  const adoCfg = (devops?.config ?? {}) as Record<string, any>;

  const [adoEnabled, setAdoEnabled] = React.useState(devops?.enabled ?? false);
  const [adoOrg, setAdoOrg] = React.useState<string>(adoCfg.organization ?? "bernoullidevops");
  // Credencial de leitura que o b-security usa pra conferir a build no Azure
  // DevOps -- sempre própria desta aba (pra um App Registration só, colar o
  // mesmo aqui e na aba App Insights).
  const [adoTenantId, setAdoTenantId] = React.useState<string>(adoCfg.tenant_id ?? "");
  const [adoClientId, setAdoClientId] = React.useState<string>(adoCfg.client_id ?? "");
  const [adoSecret, setAdoSecret] = React.useState<string>(devops?.api_key ?? "");
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = React.useState(appInsights?.enabled ?? false);
  const [aiTenantId, setAiTenantId] = React.useState<string>(aiCfg.tenant_id ?? "");
  const [aiClientId, setAiClientId] = React.useState<string>(aiCfg.client_id ?? "");
  const [aiWorkspaceId, setAiWorkspaceId] = React.useState<string>(aiCfg.workspace_id ?? "");
  const [aiSecret, setAiSecret] = React.useState<string>(appInsights?.api_key ?? "");

  React.useEffect(() => {
    setAdoEnabled(devops?.enabled ?? false);
    setAdoOrg(((devops?.config as any)?.organization ?? "bernoullidevops") as string);
    setAdoTenantId(((devops?.config as any)?.tenant_id ?? "") as string);
    setAdoClientId(((devops?.config as any)?.client_id ?? "") as string);
    setAdoSecret(devops?.api_key ?? "");
  }, [devops]);
  React.useEffect(() => {
    setAiEnabled(appInsights?.enabled ?? false);
    setAiTenantId(((appInsights?.config as any)?.tenant_id ?? "") as string);
    setAiClientId(((appInsights?.config as any)?.client_id ?? "") as string);
    setAiWorkspaceId(((appInsights?.config as any)?.workspace_id ?? "") as string);
    setAiSecret(appInsights?.api_key ?? "");
  }, [appInsights]);

  const upsertIntegrationFn = useServerFn(upsertIntegration);
  const keyStatusFn = useServerFn(getSastIngestKeyStatus);
  const rotateKeyFn = useServerFn(rotateSastIngestKey);
  const revokeKeyFn = useServerFn(revokePreviousSastIngestKey);
  const qc = useQueryClient();

  const keyStatus = useQuery({ queryKey: ["sast-ingest-keys"], queryFn: () => keyStatusFn() });
  const ingestKeys = keyStatus.data?.keys ?? [];

  const rotateKey = useMutation({
    mutationFn: () => rotateKeyFn(),
    onSuccess: (r) => {
      setNewKey(r.key);
      toast.success(
        ingestKeys.length
          ? "Nova chave gerada. A anterior continua válida até você revogar."
          : "Chave de ingestão gerada.",
      );
      qc.invalidateQueries({ queryKey: ["sast-ingest-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeKey = useMutation({
    mutationFn: () => revokeKeyFn(),
    onSuccess: (r) => {
      toast.success(r.revoked ? "Chave anterior revogada." : "Não havia chave anterior pra revogar.");
      qc.invalidateQueries({ queryKey: ["sast-ingest-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyNewKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    toast.success("Chave copiada");
  }

  const save = useMutation({
    mutationFn: async () => {
      const org = adoOrg.trim();
      if (!ADO_ORG_RE.test(org)) {
        throw new Error("Organização inválida: use só o nome (ex.: bernoullidevops), sem URL.");
      }
      const aiFields = [aiTenantId, aiClientId, aiWorkspaceId, aiSecret].map((v) => v.trim());
      if (aiEnabled && aiFields.some((v) => !v)) {
        throw new Error("App Insights: preencha Tenant ID, Client ID, Workspace ID e Client Secret antes de ativar.");
      }
      const adoOwn = [adoTenantId, adoClientId, adoSecret].map((v) => v.trim());
      if (adoEnabled && !adoOwn.every(Boolean)) {
        throw new Error(
          "Azure DevOps: preencha Tenant ID, Client ID e Client Secret da credencial de leitura antes de ativar.",
        );
      }

      // Não cria linha vazia pra aba que nunca foi usada.
      if (devops || adoEnabled || org !== "bernoullidevops" || adoOwn.some(Boolean)) {
        await upsertIntegrationFn({
          data: {
            provider: SAST_DEVOPS,
            name: "Azure DevOps (SAST)",
            enabled: adoEnabled,
            base_url: null,
            api_key: adoOwn[2] || null,
            config: {
              ...(devops?.config ?? {}),
              organization: org,
              tenant_id: adoOwn[0],
              client_id: adoOwn[1],
            },
          },
        });
      }
      if (appInsights || aiEnabled || aiFields.some(Boolean)) {
        await upsertIntegrationFn({
          data: {
            provider: SAST_APP_INSIGHTS,
            name: "Azure App Insights (SAST)",
            enabled: aiEnabled,
            base_url: null,
            api_key: aiFields[3] || null,
            config: {
              ...(appInsights?.config ?? {}),
              tenant_id: aiFields[0],
              client_id: aiFields[1],
              workspace_id: aiFields[2],
            },
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("SAST salvo");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accent = PROVIDER_ACCENT[SAST_DEVOPS];
  const cssVars = {
    "--provider-color": accent.color,
    "--provider-bg": accent.bg,
    "--provider-border": accent.border,
  } as React.CSSProperties;
  const configured = !!appInsights?.api_key || !!devops?.enabled;

  return (
    <div className="int-card" style={cssVars}>
      <div className="int-card-header">
        <div className="int-card-header-left">
          <div className="int-icon-wrap">
            <GitBranch className="size-4" style={{ color: accent.color }} />
          </div>
          <div>
            <div className="int-provider-name">SAST</div>
            <div className="int-module-link">
              <Link2 size={9} />
              SAST · Esteiras CI/CD
            </div>
          </div>
        </div>
        <span className={`int-configured-badge ${configured ? "yes" : "no"}`}>
          {configured ? (
            <>
              <CheckCircle2 size={10} /> Configurada
            </>
          ) : (
            <>
              <AlertCircle size={10} /> Pendente
            </>
          )}
        </span>
      </div>

      <div className="int-card-body">
        <Tabs defaultValue="devops">
          <TabsList>
            <TabsTrigger value="devops">Azure DevOps</TabsTrigger>
            <TabsTrigger value="appinsights">App Insights</TabsTrigger>
          </TabsList>

          {/* ── Azure DevOps: a pipeline envia direto com a chave de ingestão; o
              b-security confere a build com a credencial de leitura dele ── */}
          <TabsContent value="devops" className="int-tab-body">
            <div className="int-toggle-row">
              <div>
                <div className="int-toggle-label">Ingestão direta ativa</div>
                <div className="int-toggle-hint">
                  {adoEnabled
                    ? "Pipelines enviam o relatório direto pro b-security"
                    : "Desligada — envios das pipelines recebem 503"}
                </div>
              </div>
              <Switch checked={adoEnabled} onCheckedChange={setAdoEnabled} disabled={loading} />
            </div>

            <div className="int-field">
              <span className="int-field-label">Organização Azure DevOps</span>
              <Input value={adoOrg} onChange={(e) => setAdoOrg(e.target.value)} placeholder="bernoullidevops" />
              <span className="int-field-helper">
                Só builds desta organização (dev.azure.com/&lt;organização&gt;) são aceitas. Use só o nome, sem URL.
              </span>
            </div>

            <div className="int-sub-label">Chave de ingestão (usada pela pipeline)</div>
            <div className="int-field">
              {ingestKeys.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ingestKeys.map((k, i) => (
                    <div key={k.hint + k.createdAt} className="int-toggle-hint" style={{ marginTop: 0 }}>
                      {i === 0 ? "Atual" : "Anterior (ainda válida)"}: <b>{k.hint}…</b> — gerada em{" "}
                      {new Date(k.createdAt).toLocaleString("pt-BR")}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="int-toggle-hint" style={{ marginTop: 0 }}>
                  Nenhuma chave gerada ainda — sem ela, os envios das pipelines recebem 503.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <Button size="sm" onClick={() => rotateKey.mutate()} disabled={rotateKey.isPending}>
                  <RefreshCw className="size-3.5" />
                  {ingestKeys.length ? "Gerar nova chave" : "Gerar chave"}
                </Button>
                {ingestKeys.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => revokeKey.mutate()} disabled={revokeKey.isPending}>
                    Revogar anterior
                  </Button>
                )}
              </div>
              {newKey && (
                <>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <Input readOnly value={newKey} onFocus={(e) => e.target.select()} />
                    <Button variant="secondary" size="sm" onClick={copyNewKey}>
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                  <span className="int-field-helper">
                    Copie agora: esta chave não aparece de novo (o b-security guarda só o hash). Coloque no template de
                    pipeline e, depois que todas as builds estiverem usando a nova, revogue a anterior.
                  </span>
                </>
              )}
              <span className="int-field-helper">
                A chave só serve pra enviar relatório pro b-security, sem acesso a nada no Azure DevOps. Sozinha não
                basta pra forjar dado: todo envio é conferido contra uma build real em execução.
              </span>
            </div>

            <div className="int-sub-label">Credencial de leitura (conferência da build)</div>
            <div className="int-field">
              <span className="int-field-label">Tenant ID</span>
              <Input
                value={adoTenantId}
                onChange={(e) => setAdoTenantId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Directory (tenant) ID do Microsoft Entra ID.</span>
            </div>
            <div className="int-field">
              <span className="int-field-label">Client ID</span>
              <Input
                value={adoClientId}
                onChange={(e) => setAdoClientId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Application (client) ID do App Registration.</span>
            </div>
            <div className="int-field">
              <span className="int-field-label">Client Secret</span>
              <Input
                type="password"
                value={adoSecret}
                onChange={(e) => setAdoSecret(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">
                App Registration só de leitura: adicionado à organização do Azure DevOps (Organization settings →
                Users) e ao grupo Readers de cada projeto. Usado só pra ler a build e o commit. Pode ser o mesmo da
                aba App Insights: basta preencher os mesmos valores nas duas.
              </span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Endpoint pra pipeline</span>
              <Input readOnly value="/api/public/hooks/sast-ingest" onFocus={(e) => e.target.select()} />
            </div>
          </TabsContent>

          {/* ── App Insights: b-security lê o que a telemetria do template já grava ── */}
          <TabsContent value="appinsights" className="int-tab-body">
            <div className="int-toggle-row">
              <div>
                <div className="int-toggle-label">Sincronização App Insights ativa</div>
                <div className="int-toggle-hint">
                  {aiEnabled
                    ? "Cron sast-sync lê SecretDetected / ScanCompleted"
                    : "Desabilitada — independente da aba Azure DevOps"}
                </div>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} disabled={loading} />
            </div>

            <div className="int-field">
              <span className="int-field-label">Tenant ID</span>
              <Input
                value={aiTenantId}
                onChange={(e) => setAiTenantId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Directory (tenant) ID do Microsoft Entra ID.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Client ID</span>
              <Input
                value={aiClientId}
                onChange={(e) => setAiClientId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Application (client) ID do App Registration.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Workspace ID</span>
              <Input
                value={aiWorkspaceId}
                onChange={(e) => setAiWorkspaceId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">
                Workspace ID do Log Analytics devops-clarity-hub-insights-law (tela Overview do workspace). Não é o
                Application ID nem a Instrumentation Key do App Insights.
              </span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Client Secret</span>
              <Input
                type="password"
                value={aiSecret}
                onChange={(e) => setAiSecret(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">
                Leitura pela Log Analytics Query API com OAuth2 client_credentials. A Instrumentation Key NÃO serve
                aqui: ela só grava. O App Registration precisa do papel "Log Analytics Reader" no workspace.
              </span>
            </div>
          </TabsContent>
        </Tabs>

        <button className="int-save-btn" onClick={() => save.mutate()} disabled={save.isPending || loading}>
          <Save size={13} className={save.isPending ? "int-spin" : ""} />
          {save.isPending ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER CARD
// ══════════════════════════════════════════════════════════════════════════════
function ProviderCard({
  provider,
  integration,
  loading,
  onSaved,
}: {
  provider: (typeof PROVIDERS)[number];
  integration?: Integration;
  loading: boolean;
  onSaved: () => void;
}) {
  // ── State — INALTERADO ─────────────────────────────────────────────────────
  const [enabled, setEnabled] = React.useState(integration?.enabled ?? false);
  const [baseUrl, setBaseUrl] = React.useState(integration?.base_url ?? provider.defaultBaseUrl);
  const [apiKey, setApiKey] = React.useState(integration?.api_key ?? "");
  const [zoneId, setZoneId] = React.useState<string>((integration?.config as any)?.zone_id ?? "");
  // Page Rules (API legada) rejeita Account API Token — precisa de um User
  // API Token separado, guardado à parte pra não afetar o token principal
  // (usado por Analytics/DNS/Custom Rules/Overview, que funcionam liso com
  // Account API Token).
  const [cfPageRulesToken, setCfPageRulesToken] = React.useState<string>(
    (integration?.config as any)?.page_rules_api_key ?? "",
  );
  const [sophosClientId, setSophosClientId] = React.useState<string>((integration?.config as any)?.client_id ?? "");
  const [sophosTenantId, setSophosTenantId] = React.useState<string>((integration?.config as any)?.tenant_id ?? "");
  const [sophosRegionUrl, setSophosRegionUrl] = React.useState<string>(
    (integration?.config as any)?.data_region_url ?? "",
  );
  const [sophosAuditClientId, setSophosAuditClientId] = React.useState<string>(
    (integration?.config as any)?.audit_client_id ?? "",
  );
  const [sophosAuditClientSecret, setSophosAuditClientSecret] = React.useState<string>(
    (integration?.config as any)?.audit_client_secret ?? "",
  );
  const [sophosAuditEnabled, setSophosAuditEnabled] = React.useState<boolean>(
    (integration?.config as any)?.audit_enabled ?? false,
  );
  // Privacy Tools OAuth2 fields
  const [ptClientId, setPtClientId] = React.useState<string>((integration?.config as any)?.client_id ?? "");
  const [ptUsername, setPtUsername] = React.useState<string>((integration?.config as any)?.username ?? "");
  const [ptPassword, setPtPassword] = React.useState<string>((integration?.config as any)?.password ?? "");
  // Purview DLP OAuth2 client_credentials fields
  const [dlpTenantId, setDlpTenantId] = React.useState<string>((integration?.config as any)?.tenant_id ?? "");
  const [dlpClientId, setDlpClientId] = React.useState<string>((integration?.config as any)?.client_id ?? "");

  React.useEffect(() => {
    setEnabled(integration?.enabled ?? false);
    setBaseUrl(integration?.base_url ?? provider.defaultBaseUrl);
    setApiKey(integration?.api_key ?? "");
    setZoneId(((integration?.config as any)?.zone_id ?? "") as string);
    setCfPageRulesToken(((integration?.config as any)?.page_rules_api_key ?? "") as string);
    setSophosClientId(((integration?.config as any)?.client_id ?? "") as string);
    setSophosTenantId(((integration?.config as any)?.tenant_id ?? "") as string);
    setSophosRegionUrl(((integration?.config as any)?.data_region_url ?? "") as string);
    setSophosAuditClientId(((integration?.config as any)?.audit_client_id ?? "") as string);
    setSophosAuditClientSecret(((integration?.config as any)?.audit_client_secret ?? "") as string);
    setSophosAuditEnabled(((integration?.config as any)?.audit_enabled ?? false) as boolean);
    setPtClientId(((integration?.config as any)?.client_id ?? "") as string);
    setPtUsername(((integration?.config as any)?.username ?? "") as string);
    setPtPassword(((integration?.config as any)?.password ?? "") as string);
    setDlpTenantId(((integration?.config as any)?.tenant_id ?? "") as string);
    setDlpClientId(((integration?.config as any)?.client_id ?? "") as string);
  }, [integration, provider.defaultBaseUrl]);

  const upsertIntegrationFn = useServerFn(upsertIntegration);

  // ── Mutation ────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = { ...(integration?.config ?? {}) };
      if (provider.key === "cloudflare") {
        config.zone_id = zoneId.trim();
        config.page_rules_api_key = cfPageRulesToken.trim();
      }
      if (provider.key === "sophos") {
        config.client_id = sophosClientId.trim();
        config.tenant_id = sophosTenantId.trim();
        config.data_region_url = sophosRegionUrl.trim();
        config.audit_client_id = sophosAuditClientId.trim();
        config.audit_client_secret = sophosAuditClientSecret.trim();
        config.audit_enabled = sophosAuditEnabled;
      }
      if (provider.key === "privacy_tools") {
        config.client_id = ptClientId.trim();
        config.username = ptUsername.trim();
        config.password = ptPassword.trim();
      }
      if (provider.key === "purview_dlp") {
        config.tenant_id = dlpTenantId.trim();
        config.client_id = dlpClientId.trim();
      }
      await upsertIntegrationFn({
        data: {
          provider: provider.key,
          name: provider.name,
          enabled,
          base_url: baseUrl.trim() || null,
          api_key: apiKey.trim() || null,
          config,
        },
      });
    },
    onSuccess: () => {
      toast.success(`${provider.name} salvo`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = provider.icon;
  const isConfigured = !!integration?.api_key;
  const accent = PROVIDER_ACCENT[provider.key];

  const cssVars = {
    "--provider-color": accent.color,
    "--provider-bg": accent.bg,
    "--provider-border": accent.border,
  } as React.CSSProperties;

  return (
    <div className="int-card" style={cssVars}>
      {/* Header */}
      <div className="int-card-header">
        <div className="int-card-header-left">
          <div className="int-icon-wrap">
            <Icon className="size-4" style={{ color: accent.color }} />
          </div>
          <div>
            <div className="int-provider-name">{provider.name}</div>
            <div className="int-module-link">
              <Link2 size={9} />
              {provider.module}
            </div>
          </div>
        </div>
        <span className={`int-configured-badge ${isConfigured ? "yes" : "no"}`}>
          {isConfigured ? (
            <>
              <CheckCircle2 size={10} /> Configurada
            </>
          ) : (
            <>
              <AlertCircle size={10} /> Pendente
            </>
          )}
        </span>
      </div>

      {/* Body */}
      <div className="int-card-body">
        {/* Toggle ativo — para Sophos, fica individual dentro de cada aba (SIEM/Auditoria) */}
        {provider.key !== "sophos" && (
          <div className="int-toggle-row">
            <div>
              <div className="int-toggle-label">Integração ativa</div>
              <div className="int-toggle-hint">
                {enabled ? "Sincronização habilitada" : "Desabilitada — dados não serão coletados"}
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
          </div>
        )}

        {/* Base URL — oculto p/ Purview DLP: endpoints da Microsoft são fixos, não configuráveis */}
        {provider.key !== "purview_dlp" && (
          <div className="int-field">
            <span className="int-field-label">Base URL</span>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider.defaultBaseUrl} />
          </div>
        )}

        {provider.key === "sophos" ? (
          <Tabs defaultValue="siem">
            <TabsList>
              <TabsTrigger value="siem">SIEM</TabsTrigger>
              <TabsTrigger value="audit">Auditoria</TabsTrigger>
            </TabsList>

            {/* ── SIEM: credencial usada hoje pra alertas/eventos/endpoints/políticas ── */}
            <TabsContent value="siem" className="int-tab-body">
              <div className="int-toggle-row">
                <div>
                  <div className="int-toggle-label">Sincronização SIEM ativa</div>
                  <div className="int-toggle-hint">
                    {enabled
                      ? "Endpoints/alertas/eventos/políticas habilitados"
                      : "Desabilitada — dados não serão coletados"}
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
              </div>

              <div className="int-field">
                <span className="int-field-label">{provider.apiKeyLabel}</span>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••••••••••"
                />
                <span className="int-field-helper">{provider.helper}</span>
              </div>

              <div className="int-field">
                <span className="int-field-label">Client ID</span>
                <Input
                  value={sophosClientId}
                  onChange={(e) => setSophosClientId(e.target.value)}
                  placeholder="ex: 0a1b2c3d-4e5f-6789-…"
                />
                <span className="int-field-helper">Client ID das API Credentials no Sophos Central.</span>
              </div>

              <div className="int-field">
                <span className="int-field-label">
                  Tenant ID <span style={{ color: T.textSubtle, fontWeight: 400 }}>(opcional)</span>
                </span>
                <Input
                  value={sophosTenantId}
                  onChange={(e) => setSophosTenantId(e.target.value)}
                  placeholder="auto-detectado se vazio"
                />
                <span className="int-field-helper">
                  Se vazio, é descoberto via{" "}
                  <code
                    style={{
                      fontFamily: "'IBM Plex Mono',monospace",
                      fontSize: 10,
                      color: T.accent,
                    }}
                  >
                    /whoami/v1
                  </code>{" "}
                  usando o Client Secret.
                </span>
              </div>

              <div className="int-field">
                <span className="int-field-label">
                  Data Region URL <span style={{ color: T.textSubtle, fontWeight: 400 }}>(opcional)</span>
                </span>
                <Input
                  value={sophosRegionUrl}
                  onChange={(e) => setSophosRegionUrl(e.target.value)}
                  placeholder="ex: https://api-us01.central.sophos.com"
                />
                <span className="int-field-helper">
                  Endpoint da região do tenant. Se vazio, é descoberto automaticamente.
                </span>
              </div>
            </TabsContent>

            {/* ── Auditoria: credencial separada, role "Service Principal Audit Log" ── */}
            <TabsContent value="audit" className="int-tab-body">
              <div className="int-toggle-row">
                <div>
                  <div className="int-toggle-label">Sincronização de Auditoria ativa</div>
                  <div className="int-toggle-hint">
                    {sophosAuditEnabled ? "Audit log habilitado" : "Desabilitada — independente da aba SIEM"}
                  </div>
                </div>
                <Switch checked={sophosAuditEnabled} onCheckedChange={setSophosAuditEnabled} disabled={loading} />
              </div>

              <div className="int-field">
                <span className="int-field-label">Client ID (Audit Log)</span>
                <Input
                  value={sophosAuditClientId}
                  onChange={(e) => setSophosAuditClientId(e.target.value)}
                  placeholder="ex: 0a1b2c3d-4e5f-6789-…"
                />
                <span className="int-field-helper">
                  Client ID de uma credencial criada com a role "Service Principal Audit Log" no Sophos Central —
                  diferente da credencial usada na aba SIEM.
                </span>
              </div>

              <div className="int-field">
                <span className="int-field-label">Client Secret (Audit Log)</span>
                <Input
                  type="password"
                  value={sophosAuditClientSecret}
                  onChange={(e) => setSophosAuditClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                />
                <span className="int-field-helper">Client Secret da mesma credencial.</span>
              </div>
            </TabsContent>
          </Tabs>
        ) : provider.key === "privacy_tools" ? (
          <>
            <div className="int-sub-label">OAuth2 — Password Grant</div>

            <div className="int-field">
              <span className="int-field-label">Client ID</span>
              <Input
                value={ptClientId}
                onChange={(e) => setPtClientId(e.target.value)}
                placeholder="ex: Xvz1H2pxcMPZPIMh…"
              />
              <span className="int-field-helper">
                Identificador público da integração. Visível no painel Privacy Tools → Integrações → campo
                "Identificador".
              </span>
            </div>

            <div className="int-field">
              <span className="int-field-label">{provider.apiKeyLabel}</span>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">Segredo do cliente — mantido criptografado.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Chave Pública (username)</span>
              <Input
                value={ptUsername}
                onChange={(e) => setPtUsername(e.target.value)}
                placeholder="ex: W2yvev3WiOgK3H9s…"
              />
              <span className="int-field-helper">Campo "Chave Pública" nas variáveis da integração.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Senha (password)</span>
              <Input
                type="password"
                value={ptPassword}
                onChange={(e) => setPtPassword(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">{provider.helper}</span>
            </div>
          </>
        ) : provider.key === "purview_dlp" ? (
          <>
            <div className="int-field">
              <span className="int-field-label">Tenant ID</span>
              <Input
                value={dlpTenantId}
                onChange={(e) => setDlpTenantId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Directory (tenant) ID do Microsoft Entra ID.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">Client ID</span>
              <Input
                value={dlpClientId}
                onChange={(e) => setDlpClientId(e.target.value)}
                placeholder="ex: 00000000-0000-0000-0000-000000000000"
              />
              <span className="int-field-helper">Application (client) ID do App Registration.</span>
            </div>

            <div className="int-field">
              <span className="int-field-label">{provider.apiKeyLabel}</span>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">{provider.helper}</span>
            </div>
          </>
        ) : (
          <>
            {/* API Key */}
            <div className="int-field">
              <span className="int-field-label">{provider.apiKeyLabel}</span>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <span className="int-field-helper">{provider.helper}</span>
            </div>

            {/* Cloudflare note */}
            {provider.key === "cloudflare" && (
              <div
                style={{
                  padding: "8px 12px",
                  background: T.surfaceAlt,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  fontSize: 11,
                  color: T.textMuted,
                  fontFamily: "'DM Sans',sans-serif",
                  lineHeight: 1.5,
                }}
              >
                A escolha da zona é feita no dashboard do Cloudflare WAF (seletor "Selecionar zona").
              </div>
            )}

            {/* Token separado pra Page Rules — a API legada de Page Rules rejeita
                Account API Token, precisa de um User API Token à parte. */}
            {provider.key === "cloudflare" && (
              <div className="int-field">
                <span className="int-field-label">
                  API Token — Page Rules{" "}
                  <span style={{ color: T.textSubtle, fontWeight: 400 }}>(opcional)</span>
                </span>
                <Input
                  type="password"
                  value={cfPageRulesToken}
                  onChange={(e) => setCfPageRulesToken(e.target.value)}
                  placeholder="••••••••••••••••"
                />
                <span className="int-field-helper">
                  O endpoint legado de Page Rules não aceita o Account API Token acima — precisa de um{" "}
                  <strong>User API Token</strong> (My Profile → API Tokens, não Manage Account) com permissão Zone →
                  Page Rules → Edit na zona desejada. Sem esse campo, a sub-aba "Page Rules" em Operações → Rules
                  fica indisponível.
                </span>
              </div>
            )}
          </>
        )}

        {/* Save */}
        <button className="int-save-btn" onClick={() => save.mutate()} disabled={save.isPending || loading}>
          <Save size={13} className={save.isPending ? "int-spin" : ""} />
          {save.isPending ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
