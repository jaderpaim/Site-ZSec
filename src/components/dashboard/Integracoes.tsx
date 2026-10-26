import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  listIntegrations,
  upsertIntegration,
  type IntegrationView,
} from "@/lib/integrations.functions";
import {
  generateSekRenewalToken,
  getSekSessionStatus,
  listSekZendeskAuthLog,
} from "@/lib/sek-zendesk.functions";
import {
  getSastIngestKeyStatus,
  revokeAllSastIngestKeys,
  revokePreviousSastIngestKey,
  rotateSastIngestKey,
} from "@/lib/sast-ingest-key.functions";
import { Switch } from "@/components/ui/switch";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { getCronHealth } from "./CronHealthBadge";
import { toast } from "sonner";
import {
  Globe,
  ShieldCheck,
  Lock,
  Fish,
  Radar,
  Activity,
  Mail,
  FileWarning,
  Ticket,
  RefreshCw,
  Copy,
  Download,
  GitBranch,
  Check,
  ChevronRight,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { useDepartments } from "@/lib/use-departments";
import {
  deleteSastTrustSource,
  listSastTrustSources,
  revokePreviousSastTrustSourceKey,
  rotateSastTrustSourceKey,
  upsertSastTrustSource,
  type TrustSourceView,
} from "@/lib/sast-trust-sources.functions";

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
  | "leakradar"
  | "azure_app_insights"
  | "azure_devops_sast"
  | "gitea_sast";

// Vem de listIntegrations: SEM segredos -- `secrets` só diz quais estão salvos
// (com dica mascarada). Credenciais são só de escrita nesta tela.
type Integration = IntegrationView;

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
  {
    key: "leakradar",
    name: "CTI",
    module: "Threat Intelligence",
    moduleSlug: "threat-intel",
    icon: KeyRound,
    defaultBaseUrl: "https://api.leakradar.io",
    apiKeyLabel: "API Key",
    helper:
      "Fonte de Cyber Threat Intelligence (credenciais vazadas). Gere a API key em members.leakradar.io → Settings → API key (plano pago com domain_search). Ao salvar, a conexão é testada sem consumir pontos.",
  },
];

// SAST não entra em PROVIDERS: é um card próprio (SastIntegrationCard) com duas
// abas de ativação independente, mesmo padrão do Sophos SIEM/Auditoria. Cada
// aba grava na sua própria linha de `integrations` (o backend lê cada uma
// separado -- sast.server.ts / sast-ingest.server.ts).
const SAST_APP_INSIGHTS = "azure_app_insights" as const;
const SAST_DEVOPS = "azure_devops_sast" as const;
const SAST_GITEA = "gitea_sast" as const;

// Cor de marca de cada ferramenta (só no ícone do card)
const BRAND: Record<string, string> = {
  cloudflare: "#F6821F",
  sophos: "#00B6DE",
  privacy_tools: "#A78BFA",
  gophish: "#F59E0B",
  qradar: "#3B82F6",
  zabbix: "#D40000",
  sendgrid: "#1A82E2",
  dast_scanner: "#EF4444",
  purview_dlp: "#14B8A6",
  leakradar: "#E11D48",
  sast: "#0EA5E9",
  sek: "#22D3EE",
};

// Integração → cron jobs que ela alimenta (relação não existe no banco)
const SYNC_JOBS: Record<string, Array<[jobName: string, label?: string]>> = {
  cloudflare: [["cloudflare-daily-sync"]],
  sophos: [
    ["sophos-sync", "Sync SIEM"],
    ["sophos-audit-sync", "Sync auditoria"],
  ],
  qradar: [["qradar-sync"]],
  purview_dlp: [["dlp-sync"]],
  leakradar: [["leakradar-sync"]],
  dast_scanner: [["dast-schedules-run", "Agendamentos"]],
  sast: [["sast-sync", "Sync App Insights"]],
  zabbix: [["zabbix-cache-refresh"]],
  sek: [["sek-zendesk-sync"]],
  privacy_tools: [["privacy-tools-sync"]],
  gophish: [["gophish-sync"]],
};

type GroupKey = "seg" | "ops" | "gov";
const GROUP_OF: Record<string, GroupKey> = {
  cloudflare: "seg",
  sophos: "seg",
  qradar: "seg",
  purview_dlp: "seg",
  leakradar: "seg",
  dast_scanner: "seg",
  sast: "seg",
  zabbix: "ops",
  sendgrid: "ops",
  sek: "ops",
  privacy_tools: "gov",
  gophish: "gov",
};
const GROUPS: Array<[GroupKey, string, string]> = [
  ["seg", "Segurança", "proteção, detecção e testes"],
  ["ops", "Operação", "infraestrutura, e-mail e chamados"],
  ["gov", "Governança e privacidade", "LGPD e conscientização"],
];

type CronRow = {
  job_name: string;
  label: string;
  enabled: boolean;
  expected_interval_minutes: number;
  last_attempt_at: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  last_success_at: string | null;
  last_trigger: string | null;
  last_duration_ms: number | null;
  updated_at: string;
};

type SyncInfo = {
  job: string;
  label: string;
  row?: CronRow;
  color: string;
  text: string;
  bad: boolean;
};

function syncInfo(job: string, label: string | undefined, row: CronRow | undefined): SyncInfo {
  const base = { job, label: label ?? "Último sync", row };
  if (!row) return { ...base, color: "var(--v2-fg-3)", text: "sem registro", bad: false };
  if (!row.enabled)
    return { ...base, color: "var(--v2-fg-3)", text: "cron desativado", bad: false };
  const { tone, label: h } = getCronHealth(row);
  if (tone === "success") return { ...base, color: "var(--v2-ok)", text: "OK", bad: false };
  if (h.startsWith("Em execução"))
    return { ...base, color: "var(--v2-low)", text: "em execução", bad: false };
  if (tone === "danger")
    return {
      ...base,
      color: "var(--v2-crit)",
      text: row.last_attempt_at ? "atrasado" : "nunca rodou",
      bad: true,
    };
  return {
    ...base,
    color: "var(--v2-high)",
    text: h === "Cron interrompido" ? "interrompido" : "falhou",
    bad: true,
  };
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)}d`;
}

const hostOf = (url: string | null | undefined) =>
  url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";

// Lê um campo de texto do config (jsonb) sem recorrer a any
function cfgStr(
  cfg: Record<string, unknown> | null | undefined,
  key: string,
  fallback = "",
): string {
  const v = cfg?.[key];
  return typeof v === "string" ? v : fallback;
}

// Domínios do LeakRadar: gravados como array, editados um por linha
function cfgDomains(cfg: Record<string, unknown> | null | undefined): string {
  const v = cfg?.domains;
  return Array.isArray(v) ? v.filter((d) => typeof d === "string").join("\n") : "";
}

type StateKey = "on" | "off" | "pend";
const STATE: Record<StateKey, { label: string; color: string }> = {
  on: { label: "Ativa", color: "var(--v2-ok)" },
  off: { label: "Desligada", color: "var(--v2-fg-3)" },
  pend: { label: "Pendente", color: "var(--v2-med)" },
};

type CardKey = Provider | "sast" | "sek";
type CardItem = {
  key: CardKey;
  name: string;
  module: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  state: StateKey;
  configured: boolean;
  host: string;
  hostMuted?: boolean;
  subs?: Array<[string, boolean]>;
  syncs: SyncInfo[];
};

const CSS = `
  .int-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .int-root * { box-sizing:border-box; }
  .int-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .int-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .int-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .int-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .int-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; text-align:left; background:transparent; border:0; color:inherit; font:inherit; position:relative; }
  button.int-kpi { cursor:pointer; }
  button.int-kpi:hover { background:var(--v2-hover); }
  button.int-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:18px; right:18px; bottom:0; height:2px; background:var(--v2-accent); border-radius:2px; }
  .int-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .int-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .int-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .int-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .int-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .int-tbar .int-input { margin-left:auto; width:240px; max-width:100%; }
  .int-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); flex-wrap:wrap; }
  .int-seg button { height:28px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .int-seg button:hover { color:var(--v2-fg); }
  .int-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }

  .int-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; min-width:0; }
  .int-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .int-input.mono { font-family:var(--font-data); font-size:12.5px; }
  .int-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .int-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .int-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .int-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .int-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .int-btn.ghost { border-color:transparent; background:transparent; }
  .int-btn.icon { width:34px; padding:0; justify-content:center; flex:none; }

  .int-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .int-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .int-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; border:1px solid var(--v2-line); font-size:12px; color:var(--v2-fg-2); white-space:nowrap; }
  .int-tag i { width:6px; height:6px; border-radius:50%; background:var(--c); }

  .int-grp { display:grid; gap:10px; }
  .int-grp h2 { margin:0; display:flex; align-items:baseline; gap:8px; font-size:15px; font-weight:600; }
  .int-grp h2 span { font-size:12.5px; font-weight:400; color:var(--v2-fg-3); }
  .int-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; }
  .int-card { display:grid; grid-template-rows:auto auto 1fr auto; gap:12px; padding:16px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; cursor:pointer; text-align:left; font:inherit; color:inherit; transition:border-color .12s, background .12s; min-width:0; }
  .int-card:hover { border-color:var(--v2-line-strong); background:var(--v2-hover); }
  .int-card-h { display:flex; gap:12px; align-items:center; min-width:0; }
  .int-logo { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; flex:none; background:color-mix(in oklch, var(--b) 15%, var(--v2-surface)); color:var(--b); border:1px solid color-mix(in oklch, var(--b) 28%, transparent); }
  .int-card-h b { display:block; font-size:14.5px; font-weight:600; }
  .int-card-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .int-card-h .int-pill { margin-left:auto; align-self:flex-start; }
  .int-host { font:400 12px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:6px 9px; border-radius:5px; background:var(--v2-surface-2); }
  .int-host.muted { color:var(--v2-fg-3); }
  .int-sync { display:grid; gap:6px; align-content:start; min-width:0; }
  .int-sync .ln { display:flex; gap:8px; align-items:center; font-size:12.5px; color:var(--v2-fg-2); min-width:0; }
  .int-sync .ln > span:first-child { color:var(--v2-fg-3); min-width:104px; }
  .int-sync .ln b { font-weight:500; font-family:var(--font-data); font-size:12px; }
  .int-sync .ln em { font-style:normal; font-size:12px; }
  .int-sdot { width:7px; height:7px; border-radius:50%; background:var(--c); flex:none; }
  .int-sync .err { font:400 12px var(--font-data); color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .int-subs { display:flex; gap:6px; flex-wrap:wrap; }
  .int-card-f { display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
  .int-card-f .go { color:var(--v2-accent); font-weight:500; display:inline-flex; gap:4px; align-items:center; }
  .int-empty { color:var(--v2-fg-3); font-size:13px; margin:0; }

  /* ── Painel lateral ── */
  .int-form { display:grid; gap:14px; }
  .int-field { display:grid; gap:6px; font-size:12.5px; font-weight:500; color:var(--v2-fg-2); min-width:0; }
  .int-field em { font-style:normal; font-weight:400; color:var(--v2-fg-3); }
  .int-field small, .int-help { font-size:12px; font-weight:400; color:var(--v2-fg-3); line-height:1.5; }
  .int-field code { font-family:var(--font-data); font-size:12px; color:var(--v2-accent); }
  .int-pw { display:flex; gap:6px; }
  .int-pw .int-input { flex:1; font-family:var(--font-data); font-size:12.5px; }
  .int-secret { flex:1; min-width:0; display:flex; align-items:center; gap:8px; height:34px; padding:0 10px; border:1px dashed var(--v2-line-strong); border-radius:8px; color:var(--v2-fg-2); font-size:13px; }
  .int-secret svg { color:var(--v2-ok); flex:none; }
  .int-secret span { font-family:var(--font-data); font-size:12.5px; color:var(--v2-fg-3); }
  .int-togrow { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .int-togrow b { display:block; font-size:13px; font-weight:500; }
  .int-togrow small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .int-note { padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }
  .int-note.err { border-color:color-mix(in oklch, var(--v2-crit) 35%, transparent); background:color-mix(in oklch, var(--v2-crit) 8%, transparent); font-family:var(--font-data); font-size:12px; overflow-wrap:anywhere; }
  .int-sublabel { font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); margin-top:4px; }
  .int-keyrow { display:flex; justify-content:space-between; gap:8px; font:400 12.5px var(--font-data); padding:8px 10px; border:1px solid var(--v2-line); border-radius:8px; }
  .int-keyrow span:last-child { color:var(--v2-fg-3); }
  .int-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .int-link { font-size:12.5px; color:var(--v2-accent); text-decoration:none; display:inline-flex; gap:4px; align-items:center; }
  .int-link:hover { text-decoration:underline; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

type Filter = "all" | StateKey | "err";

export function IntegracoesDashboard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getSekSessionStatus);

  const listFn = useServerFn(listIntegrations);
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listFn(),
  });

  // Situação dos crons ligados a cada integração (mesma tabela do módulo Cron Jobs)
  const { data: cronRows = [] } = useQuery({
    queryKey: ["cron-job-runs"],
    queryFn: async (): Promise<CronRow[]> => {
      const { data, error } = await supabase.from("cron_job_runs").select("*").order("job_name");
      if (error) throw error;
      return (data ?? []) as CronRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: sekStatus, error: sekStatusError } = useQuery({
    queryKey: ["sek-zendesk-session-status"],
    queryFn: () => statusFn(),
  });
  React.useEffect(() => {
    if (sekStatusError) toast.error((sekStatusError as Error).message);
  }, [sekStatusError]);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  // Painel: a chave fica guardada depois de fechar para a animação de saída
  const [sheetKey, setSheetKey] = React.useState<CardKey | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const byProvider = React.useMemo(() => {
    const m = new Map<Provider, Integration>();
    data?.forEach((i) => m.set(i.provider, i));
    return m;
  }, [data]);
  const cronByJob = React.useMemo(() => new Map(cronRows.map((r) => [r.job_name, r])), [cronRows]);
  const syncsOf = (key: string) =>
    (SYNC_JOBS[key] ?? []).map(([job, label]) => syncInfo(job, label, cronByJob.get(job)));

  if (isLoading) return <ModuleLoading />;

  const onSaved = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  // O SAST conta como uma integração: configurada se qualquer aba estiver
  // pronta (App Insights com credencial, ou Azure DevOps ligado -- não tem credencial).
  const sastAi = byProvider.get(SAST_APP_INSIGHTS);
  const sastAdo = byProvider.get(SAST_DEVOPS);
  const sastGitea = byProvider.get(SAST_GITEA);
  const sastConfigured =
    !!sastAi?.secrets.api_key || !!sastAdo?.enabled || !!sastGitea?.secrets.api_key;
  const sastActive = !!sastAi?.enabled || !!sastAdo?.enabled || !!sastGitea?.enabled;
  const sekSessions = sekStatus?.sessions.length ?? 0;

  const items: CardItem[] = [
    ...PROVIDERS.map((p): CardItem => {
      const integ = byProvider.get(p.key);
      const configured = !!integ?.secrets.api_key;
      // Sophos: ativa se qualquer uma das abas (SIEM / Auditoria) estiver ligada
      const auditOn = p.key === "sophos" && integ?.config?.audit_enabled === true;
      const on = !!integ?.enabled || auditOn;
      return {
        key: p.key,
        name: p.name,
        module: p.module,
        icon: p.icon,
        configured,
        state: configured && on ? "on" : configured ? "off" : "pend",
        host:
          p.key === "purview_dlp"
            ? "endpoints fixos da Microsoft"
            : hostOf(integ?.base_url) || hostOf(p.defaultBaseUrl) || "—",
        hostMuted: p.key === "purview_dlp" || !integ?.base_url,
        subs:
          p.key === "sophos"
            ? [
                ["SIEM", !!integ?.enabled],
                ["Auditoria", auditOn],
              ]
            : undefined,
        syncs: syncsOf(p.key),
      };
    }),
    {
      key: "sast",
      name: "SAST · Esteiras",
      module: "SAST · Esteiras CI/CD",
      icon: GitBranch,
      configured: sastConfigured,
      state: sastConfigured && sastActive ? "on" : sastConfigured ? "off" : "pend",
      host: "ingestão: /api/public/hooks/sast-ingest",
      subs: [
        ["Azure DevOps", !!sastAdo?.enabled],
        ["Gitea", !!sastGitea?.enabled],
        ["App Insights", !!sastAi?.enabled],
      ],
      syncs: syncsOf("sast"),
    },
    {
      key: "sek",
      name: "SEK / Zendesk",
      module: "Automação de chamados",
      icon: Ticket,
      configured: sekSessions > 0,
      state: sekSessions > 0 ? "on" : "pend",
      host: sekSessions
        ? `${sekSessions} ${sekSessions === 1 ? "sessão vigente" : "sessões vigentes"} · renovação local`
        : "nenhuma sessão vigente",
      hostMuted: !sekSessions,
      syncs: syncsOf("sek"),
    },
  ];

  const hasErr = (i: CardItem) => i.syncs.some((s) => s.bad);
  const count = (k: StateKey) => items.filter((i) => i.state === k).length;
  const errCount = items.filter(hasErr).length;
  const q = search.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (filter === "all" || (filter === "err" ? hasErr(i) : i.state === filter)) &&
      (!q || `${i.name} ${i.module}`.toLowerCase().includes(q)),
  );
  const kpiFilter = (k: Filter) => setFilter((f) => (f === k ? "all" : k));
  const openSheet = (k: CardKey) => {
    setSheetKey(k);
    setSheetOpen(true);
  };
  const sheetItem = items.find((i) => i.key === sheetKey);
  const sheetProvider = PROVIDERS.find((p) => p.key === sheetKey);
  const sheetCommon = sheetItem && {
    open: sheetOpen,
    onOpenChange: setSheetOpen,
    item: sheetItem,
  };

  return (
    <div className="int-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="int-ph-title">Integrações de API</h1>
        <p className="int-ph-sub">
          Credenciais das ferramentas externas · cada integração alimenta um módulo do {APP_NAME}
        </p>
      </div>

      <div className="int-kpis">
        <div className="int-kpi">
          <span className="int-kpi-label">Integrações</span>
          <span className="int-kpi-value">{items.length}</span>
          <span className="int-kpi-foot">uma por ferramenta externa</span>
        </div>
        <button className="int-kpi" aria-pressed={filter === "on"} onClick={() => kpiFilter("on")}>
          <span className="int-kpi-label">
            <span className="int-sw" style={{ background: "var(--v2-ok)" }} />
            Ativas
          </span>
          <span className="int-kpi-value">{count("on")}</span>
          <span className="int-kpi-foot">coletando dados</span>
        </button>
        <button
          className="int-kpi"
          aria-pressed={filter === "off"}
          onClick={() => kpiFilter("off")}
        >
          <span className="int-kpi-label">Desligadas</span>
          <span className="int-kpi-value">{count("off")}</span>
          <span className="int-kpi-foot">credencial salva, sem coleta</span>
        </button>
        <button
          className="int-kpi"
          aria-pressed={filter === "pend"}
          onClick={() => kpiFilter("pend")}
        >
          <span className="int-kpi-label">
            {count("pend") > 0 && (
              <span className="int-sw" style={{ background: "var(--v2-med)" }} />
            )}
            Pendentes
          </span>
          <span className="int-kpi-value">{count("pend")}</span>
          <span className="int-kpi-foot">sem credencial</span>
        </button>
        <button
          className="int-kpi"
          aria-pressed={filter === "err"}
          onClick={() => kpiFilter("err")}
        >
          <span className="int-kpi-label">
            {errCount > 0 && <span className="int-sw" style={{ background: "var(--v2-crit)" }} />}
            Sync com problema
          </span>
          <span className="int-kpi-value">{errCount}</span>
          <span className="int-kpi-foot">falhou ou está atrasado</span>
        </button>
      </div>

      <div className="int-tbar">
        <div className="int-seg" role="group" aria-label="Situação">
          {(
            [
              ["all", "Todas"],
              ["on", "Ativas"],
              ["off", "Desligadas"],
              ["pend", "Pendentes"],
              ["err", "Com problema"],
            ] as Array<[Filter, string]>
          ).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <input
          className="int-input"
          placeholder="Buscar integração ou módulo"
          aria-label="Buscar integração"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className="int-empty">Nenhuma integração encontrada com esse filtro.</p>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {GROUPS.map(([g, title, sub]) => {
            const rows = visible.filter((i) => GROUP_OF[i.key] === g);
            if (!rows.length) return null;
            return (
              <section key={g} className="int-grp">
                <h2>
                  {title}
                  <span>
                    {sub} · {rows.length}
                  </span>
                </h2>
                <div className="int-grid">
                  {rows.map((i) => (
                    <IntegrationCard key={i.key} item={i} onOpen={() => openSheet(i.key)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {sheetCommon && sheetProvider && (
        <ProviderSheet
          key={sheetProvider.key}
          {...sheetCommon}
          provider={sheetProvider}
          integration={byProvider.get(sheetProvider.key)}
          onSaved={onSaved}
        />
      )}
      {sheetCommon && sheetKey === "sast" && (
        <SastSheet
          key="sast"
          {...sheetCommon}
          appInsights={sastAi}
          devops={sastAdo}
          gitea={sastGitea}
          onSaved={onSaved}
        />
      )}
      {sheetCommon && sheetKey === "sek" && <SekSheet key="sek" {...sheetCommon} />}
    </div>
  );
}

function IntegrationCard({ item, onOpen }: { item: CardItem; onOpen: () => void }) {
  const Icon = item.icon;
  const st = STATE[item.state];
  const err = item.syncs.find((s) => s.bad && s.row?.last_error)?.row?.last_error;
  return (
    <button className="int-card" onClick={onOpen}>
      <div className="int-card-h">
        <span className="int-logo" style={{ "--b": BRAND[item.key] } as React.CSSProperties}>
          <Icon style={{ width: 19, height: 19 }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <b>{item.name}</b>
          <small>→ {item.module}</small>
        </span>
        <span className="int-pill" style={{ "--c": st.color } as React.CSSProperties}>
          {st.label}
        </span>
      </div>
      <div className={`int-host${item.hostMuted ? " muted" : ""}`} title={item.host}>
        {item.host}
      </div>
      <div className="int-sync">
        {item.subs && (
          <div className="int-subs">
            {item.subs.map(([l, on]) => (
              <span
                key={l}
                className="int-tag"
                style={{ "--c": on ? "var(--v2-ok)" : "var(--v2-fg-3)" } as React.CSSProperties}
              >
                <i />
                {l}
              </span>
            ))}
          </div>
        )}
        {item.syncs.length ? (
          item.syncs.map((s) => (
            <div key={s.job} className="ln" title={s.job}>
              <span>{s.label}</span>
              <i className="int-sdot" style={{ "--c": s.color } as React.CSSProperties} />
              <b>{s.row ? fmtAgo(s.row.last_attempt_at) : "—"}</b>
              {(s.bad || !s.row || !s.row.enabled) && <em style={{ color: s.color }}>{s.text}</em>}
            </div>
          ))
        ) : (
          <div className="ln">
            <span>Último sync</span>
            <b style={{ color: "var(--v2-fg-3)" }}>sem cron</b>
          </div>
        )}
        {err && (
          <div className="err" title={err}>
            {err}
          </div>
        )}
      </div>
      <div className="int-card-f">
        <span>
          {item.key === "sek"
            ? "Sessão renovada localmente"
            : item.configured
              ? "Credencial salva"
              : "Sem credencial"}
        </span>
        <span className="go">
          Configurar <ChevronRight size={13} />
        </span>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PEÇAS DO PAINEL
// ══════════════════════════════════════════════════════════════════════════════

type SheetBase = { open: boolean; onOpenChange: (o: boolean) => void; item: CardItem };

function SheetTitle({ item }: { item: CardItem }) {
  const Icon = item.icon;
  return (
    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span
        className="int-logo"
        style={
          { "--b": BRAND[item.key], width: 32, height: 32, borderRadius: 8 } as React.CSSProperties
        }
      >
        <Icon style={{ width: 16, height: 16 }} />
      </span>
      {item.name}
    </span>
  );
}

function SheetBadges({ item }: { item: CardItem }) {
  const st = STATE[item.state];
  return (
    <>
      <span className="int-pill" style={{ "--c": st.color } as React.CSSProperties}>
        {st.label}
      </span>
      <span className="int-tag">alimenta {item.module}</span>
    </>
  );
}

function SyncSection({ item }: { item: CardItem }) {
  if (!item.syncs.length) return null;
  const errs = item.syncs.filter((s) => s.bad && s.row?.last_error);
  return (
    <DetailSection title="Sincronização">
      <div style={{ display: "grid", gap: 10 }}>
        <DetailList
          items={item.syncs.map((s): [string, React.ReactNode] => [
            s.label,
            <span
              key={s.job}
              style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <span className="int-pill" style={{ "--c": s.color } as React.CSSProperties}>
                {s.text}
              </span>
              <span
                style={{ color: "var(--v2-fg-3)", fontFamily: "var(--font-data)", fontSize: 12 }}
              >
                {s.job}
                {s.row ? ` · ${fmtAgo(s.row.last_attempt_at)}` : ""}
              </span>
            </span>,
          ])}
        />
        {errs.map((s) => (
          <div key={s.job} className="int-note err">
            {s.row?.last_error}
          </div>
        ))}
        <Link to="/app/$module" params={{ module: "cron-jobs" }} className="int-link">
          Ver em Cron Jobs <ChevronRight size={13} />
        </Link>
      </div>
    </DetailSection>
  );
}

// Incrementado a cada salvamento: os campos de segredo voltam para "Salvo ••••"
const SecretReset = React.createContext(0);

// Segredo só de escrita: depois de salvo, mostra apenas a dica mascarada e
// permite substituir -- o valor gravado nunca volta para o navegador.
function SecretInput({
  value,
  onChange,
  saved,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Dica do segredo já gravado (ex.: "••••a91f"); ausente = nada salvo */
  saved?: string;
}) {
  const [replacing, setReplacing] = React.useState(false);
  const resetSignal = React.useContext(SecretReset);
  React.useEffect(() => setReplacing(false), [resetSignal]);
  if (saved && !replacing) {
    return (
      <div className="int-pw">
        <div className="int-secret">
          <Lock style={{ width: 13, height: 13 }} />
          Salvo <span>{saved}</span>
        </div>
        <button type="button" className="int-btn" onClick={() => setReplacing(true)}>
          Substituir
        </button>
      </div>
    );
  }
  return (
    <div className="int-pw">
      <input
        className="int-input"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved ? "Novo valor" : "Cole o valor aqui"}
        autoComplete="new-password"
        autoFocus={replacing}
      />
      {replacing && (
        <button
          type="button"
          className="int-btn ghost"
          onClick={() => {
            onChange("");
            setReplacing(false);
          }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  optional,
  help,
  children,
}: {
  label: React.ReactNode;
  optional?: boolean;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="int-field">
      <span>
        {label} {optional && <em>(opcional)</em>}
      </span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="int-togrow">
      <span>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

function SegTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="int-seg" role="tablist" style={{ justifySelf: "start" }}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function SaveFooter({
  onClose,
  onSave,
  pending,
}: {
  onClose: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <>
      <button className="int-btn ghost" style={{ marginRight: "auto" }} onClick={onClose}>
        Fechar
      </button>
      <button className="int-btn primary" onClick={onSave} disabled={pending}>
        <Check size={14} />
        {pending ? "Salvando…" : "Salvar configuração"}
      </button>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER — formulário genérico (Cloudflare, Sophos, Privacy Tools, DLP…)
// ══════════════════════════════════════════════════════════════════════════════

function ProviderSheet({
  open,
  onOpenChange,
  item,
  provider,
  integration,
  onSaved,
}: SheetBase & {
  provider: (typeof PROVIDERS)[number];
  integration?: Integration;
  onSaved: () => void;
}) {
  const cfg = integration?.config;
  const [saveCount, setSaveCount] = React.useState(0);
  const [enabled, setEnabled] = React.useState(integration?.enabled ?? false);
  const [baseUrl, setBaseUrl] = React.useState(integration?.base_url ?? provider.defaultBaseUrl);
  const [apiKey, setApiKey] = React.useState("");
  // Page Rules (API legada) rejeita Account API Token — precisa de um User
  // API Token separado, guardado à parte pra não afetar o token principal
  // (usado por Analytics/DNS/Custom Rules/Overview, que funcionam liso com
  // Account API Token).
  const [cfPageRulesToken, setCfPageRulesToken] = React.useState("");
  const [sophosTab, setSophosTab] = React.useState<"siem" | "audit">("siem");
  const [sophosClientId, setSophosClientId] = React.useState(cfgStr(cfg, "client_id"));
  const [sophosTenantId, setSophosTenantId] = React.useState(cfgStr(cfg, "tenant_id"));
  const [sophosRegionUrl, setSophosRegionUrl] = React.useState(cfgStr(cfg, "data_region_url"));
  const [sophosAuditClientId, setSophosAuditClientId] = React.useState(
    cfgStr(cfg, "audit_client_id"),
  );
  const [sophosAuditClientSecret, setSophosAuditClientSecret] = React.useState("");
  const [sophosAuditEnabled, setSophosAuditEnabled] = React.useState(cfg?.audit_enabled === true);
  // Privacy Tools OAuth2 fields
  const [ptClientId, setPtClientId] = React.useState(cfgStr(cfg, "client_id"));
  const [ptUsername, setPtUsername] = React.useState(cfgStr(cfg, "username"));
  const [ptPassword, setPtPassword] = React.useState("");
  // Purview DLP OAuth2 client_credentials fields
  const [dlpTenantId, setDlpTenantId] = React.useState(cfgStr(cfg, "tenant_id"));
  const [dlpClientId, setDlpClientId] = React.useState(cfgStr(cfg, "client_id"));
  // LeakRadar: domínios monitorados (um por linha ou separados por vírgula)
  const [lrDomains, setLrDomains] = React.useState(cfgDomains(cfg));

  React.useEffect(() => {
    const c = integration?.config;
    setEnabled(integration?.enabled ?? false);
    setBaseUrl(integration?.base_url ?? provider.defaultBaseUrl);
    setApiKey("");
    setCfPageRulesToken("");
    setSophosClientId(cfgStr(c, "client_id"));
    setSophosTenantId(cfgStr(c, "tenant_id"));
    setSophosRegionUrl(cfgStr(c, "data_region_url"));
    setSophosAuditClientId(cfgStr(c, "audit_client_id"));
    setSophosAuditClientSecret("");
    setSophosAuditEnabled(c?.audit_enabled === true);
    setPtClientId(cfgStr(c, "client_id"));
    setPtUsername(cfgStr(c, "username"));
    setPtPassword("");
    setDlpTenantId(cfgStr(c, "tenant_id"));
    setDlpClientId(cfgStr(c, "client_id"));
    setLrDomains(cfgDomains(c));
  }, [integration, provider.defaultBaseUrl]);

  const upsertIntegrationFn = useServerFn(upsertIntegration);
  const save = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = { ...(integration?.config ?? {}) };
      if (provider.key === "cloudflare") {
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
      if (provider.key === "leakradar") {
        config.domains = [
          ...new Set(
            lrDomains
              .split(/[\s,;]+/)
              .map((d) => d.trim().toLowerCase())
              .filter(Boolean),
          ),
        ];
      }
      return upsertIntegrationFn({
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
    onSuccess: (r) => {
      // Cloudflare: o servidor já lista as zonas ao salvar (info ou aviso).
      if (r && "warning" in r && r.warning) toast.warning(r.warning);
      else
        toast.success(`${provider.name} salvo${r && "info" in r && r.info ? ` · ${r.info}` : ""}`);
      setSaveCount((c) => c + 1);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apiKeyField = (help: React.ReactNode = provider.helper) => (
    <Field label={provider.apiKeyLabel} help={help}>
      <SecretInput value={apiKey} onChange={setApiKey} saved={integration?.secrets.api_key} />
    </Field>
  );

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      eyebrow={`integrations · ${provider.key}`}
      title={<SheetTitle item={item} />}
      badges={<SheetBadges item={item} />}
      footer={
        <SaveFooter
          onClose={() => onOpenChange(false)}
          onSave={() => save.mutate()}
          pending={save.isPending}
        />
      }
    >
      <SecretReset.Provider value={saveCount}>
        <div className="int-root" style={{ gap: 20 }}>
          {provider.key === "sophos" ? (
            <>
              <SegTabs
                value={sophosTab}
                onChange={setSophosTab}
                options={[
                  ["siem", "SIEM"],
                  ["audit", "Auditoria"],
                ]}
              />
              {sophosTab === "siem" ? (
                <div className="int-form">
                  {/* ── SIEM: credencial usada hoje pra alertas/eventos/endpoints/políticas ── */}
                  <ToggleRow
                    title="Sincronização SIEM ativa"
                    hint={
                      enabled
                        ? "Endpoints, alertas, eventos e políticas"
                        : "Desligada — dados não serão coletados"
                    }
                    checked={enabled}
                    onChange={setEnabled}
                  />
                  <Field label="Base URL">
                    <input
                      className="int-input"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={provider.defaultBaseUrl}
                    />
                  </Field>
                  <Field label="Client ID" help="Client ID das API Credentials no Sophos Central.">
                    <input
                      className="int-input mono"
                      value={sophosClientId}
                      onChange={(e) => setSophosClientId(e.target.value)}
                      placeholder="ex: 0a1b2c3d-4e5f-6789-…"
                    />
                  </Field>
                  {apiKeyField()}
                  <Field
                    label="Tenant ID"
                    optional
                    help={
                      <>
                        Se vazio, é descoberto via <code>/whoami/v1</code> usando o Client Secret.
                      </>
                    }
                  >
                    <input
                      className="int-input mono"
                      value={sophosTenantId}
                      onChange={(e) => setSophosTenantId(e.target.value)}
                      placeholder="auto-detectado se vazio"
                    />
                  </Field>
                  <Field
                    label="Data Region URL"
                    optional
                    help="Endpoint da região do tenant. Se vazio, é descoberto automaticamente."
                  >
                    <input
                      className="int-input"
                      value={sophosRegionUrl}
                      onChange={(e) => setSophosRegionUrl(e.target.value)}
                      placeholder="ex: https://api-us01.central.sophos.com"
                    />
                  </Field>
                </div>
              ) : (
                <div className="int-form">
                  {/* ── Auditoria: credencial separada, role "Service Principal Audit Log" ── */}
                  <ToggleRow
                    title="Sincronização de auditoria ativa"
                    hint={
                      sophosAuditEnabled
                        ? "Audit log habilitado"
                        : "Desligada — independente da aba SIEM"
                    }
                    checked={sophosAuditEnabled}
                    onChange={setSophosAuditEnabled}
                  />
                  <Field
                    label="Client ID (Audit Log)"
                    help='Client ID de uma credencial criada com a role "Service Principal Audit Log" no Sophos Central — diferente da credencial usada na aba SIEM.'
                  >
                    <input
                      className="int-input mono"
                      value={sophosAuditClientId}
                      onChange={(e) => setSophosAuditClientId(e.target.value)}
                      placeholder="ex: 0a1b2c3d-4e5f-6789-…"
                    />
                  </Field>
                  <Field
                    label="Client Secret (Audit Log)"
                    help="Client Secret da mesma credencial."
                  >
                    <SecretInput
                      value={sophosAuditClientSecret}
                      onChange={setSophosAuditClientSecret}
                      saved={integration?.secrets.audit_client_secret}
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <div className="int-form">
              <ToggleRow
                title="Integração ativa"
                hint={
                  enabled ? "Sincronização habilitada" : "Desligada — dados não serão coletados"
                }
                checked={enabled}
                onChange={setEnabled}
              />
              {/* Base URL — oculto p/ Microsoft (Purview/Entra): endpoints fixos */}
              {provider.key !== "purview_dlp" && (
                <Field label="Base URL">
                  <input
                    className="int-input"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={provider.defaultBaseUrl}
                  />
                </Field>
              )}
              {provider.key === "privacy_tools" ? (
                <>
                  <div className="int-sublabel">OAuth2 — Password Grant</div>
                  <Field
                    label="Client ID"
                    help='Identificador público da integração. Visível no painel Privacy Tools → Integrações → campo "Identificador".'
                  >
                    <input
                      className="int-input mono"
                      value={ptClientId}
                      onChange={(e) => setPtClientId(e.target.value)}
                      placeholder="ex: Xvz1H2pxcMPZPIMh…"
                    />
                  </Field>
                  {apiKeyField("Segredo do cliente — mantido criptografado.")}
                  <Field
                    label="Chave Pública (username)"
                    help='Campo "Chave Pública" nas variáveis da integração.'
                  >
                    <input
                      className="int-input mono"
                      value={ptUsername}
                      onChange={(e) => setPtUsername(e.target.value)}
                      placeholder="ex: W2yvev3WiOgK3H9s…"
                    />
                  </Field>
                  <Field label="Senha (password)" help={provider.helper}>
                    <SecretInput
                      value={ptPassword}
                      onChange={setPtPassword}
                      saved={integration?.secrets.password}
                    />
                  </Field>
                </>
              ) : provider.key === "purview_dlp" ? (
                <>
                  <Field label="Tenant ID" help="Directory (tenant) ID do Microsoft Entra ID.">
                    <input
                      className="int-input mono"
                      value={dlpTenantId}
                      onChange={(e) => setDlpTenantId(e.target.value)}
                      placeholder="ex: 00000000-0000-0000-0000-000000000000"
                    />
                  </Field>
                  <Field label="Client ID" help="Application (client) ID do App Registration.">
                    <input
                      className="int-input mono"
                      value={dlpClientId}
                      onChange={(e) => setDlpClientId(e.target.value)}
                      placeholder="ex: 00000000-0000-0000-0000-000000000000"
                    />
                  </Field>
                  {apiKeyField()}
                </>
              ) : provider.key === "leakradar" ? (
                <>
                  {apiKeyField()}
                  <Field
                    label="Domínios monitorados"
                    help="Um por linha. A coleta busca colaboradores, clientes e terceiros de cada domínio."
                  >
                    <textarea
                      className="int-input mono"
                      rows={3}
                      value={lrDomains}
                      onChange={(e) => setLrDomains(e.target.value)}
                      placeholder={"empresa.com.br\nempresa.com"}
                      style={{
                        height: "auto",
                        paddingTop: 8,
                        paddingBottom: 8,
                        resize: "vertical",
                      }}
                    />
                  </Field>
                </>
              ) : (
                <>
                  {apiKeyField()}
                  {provider.key === "cloudflare" && (
                    <>
                      {/* Token separado pra Page Rules — a API legada de Page Rules rejeita
                        Account API Token, precisa de um User API Token à parte. */}
                      <Field
                        label="API Token — Page Rules"
                        optional
                        help={
                          <>
                            O endpoint legado de Page Rules não aceita o Account API Token acima —
                            precisa de um <strong>User API Token</strong> (My Profile → API Tokens,
                            não Manage Account) com permissão Zone → Page Rules → Edit na zona
                            desejada. Sem esse campo, a sub-aba "Page Rules" em Operações → Rules
                            fica indisponível.
                          </>
                        }
                      >
                        <SecretInput
                          value={cfPageRulesToken}
                          onChange={setCfPageRulesToken}
                          saved={integration?.secrets.page_rules_api_key}
                        />
                      </Field>
                      <div className="int-note">
                        A escolha da zona é feita no dashboard do Cloudflare WAF (seletor
                        "Selecionar zona").
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <SyncSection item={item} />
        </div>
      </SecretReset.Provider>
    </DetailSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAST — origens com ativação independente (padrão Sophos SIEM/Auditoria).
// Cada aba = uma linha própria em `integrations`:
//   azure_devops_sast  -> ingestão direta da pipeline (sast-ingest), confere a build no Azure DevOps
//   gitea_sast         -> ingestão direta do Gitea Actions (sast-ingest), confere a execução no Gitea
//   azure_app_insights -> sync do App Insights (sast-sync), Service Principal
// As duas convivem: caem nos mesmos achados sem duplicar (migration 20260929100000).
// ══════════════════════════════════════════════════════════════════════════════

const ADO_ORG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/; // mesma regra de sast-ingest.server.ts

// ── Fontes confiáveis (fase 6.1) ──────────────────────────────────────────────
// Cada fonte = provedor + organização/projeto + filtro de repositórios, com a
// própria chave. O servidor só aceita um envio se o repositório conferido na API
// do CI estiver dentro da fonte dona da chave. Repositório novo numa organização
// cadastrada entra sozinho — não precisa de chave por repositório.
const TRUST_PROVIDER_LABEL: Record<TrustSourceView["provider"], string> = {
  gitea: "Gitea",
  github: "GitHub",
  azure_devops: "Azure DevOps",
};

type TrustDraft = {
  id: string | null;
  provider: "gitea" | "azure_devops";
  owner: string;
  repo_pattern: string;
  department_id: string;
  label: string;
  enabled: boolean;
};

const EMPTY_TRUST_DRAFT: TrustDraft = {
  id: null,
  provider: "gitea",
  owner: "",
  repo_pattern: "*",
  department_id: "",
  label: "",
  enabled: true,
};

function SastTrustSourcesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSastTrustSources);
  const upsertFn = useServerFn(upsertSastTrustSource);
  const deleteFn = useServerFn(deleteSastTrustSource);
  const rotateFn = useServerFn(rotateSastTrustSourceKey);
  const revokeFn = useServerFn(revokePreviousSastTrustSourceKey);
  const { data: departments = [] } = useDepartments();

  const sourcesQ = useQuery({ queryKey: ["sast-trust-sources"], queryFn: () => listFn() });
  const sources = sourcesQ.data ?? [];
  const [draft, setDraft] = React.useState<TrustDraft | null>(null);
  const [newKey, setNewKey] = React.useState<{ id: string; key: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["sast-trust-sources"] });
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;

  const save = useMutation({
    mutationFn: (d: TrustDraft) =>
      upsertFn({
        data: {
          id: d.id,
          provider: d.provider,
          owner: d.owner.trim(),
          repo_pattern: d.repo_pattern.trim() || "*",
          department_id: d.department_id || null,
          label: d.label.trim() || null,
          enabled: d.enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Fonte confiável salva");
      setDraft(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (s: TrustSourceView) =>
      upsertFn({
        data: {
          id: s.id,
          provider: s.provider === "github" ? "gitea" : s.provider,
          owner: s.owner,
          repo_pattern: s.repo_pattern,
          department_id: s.department_id,
          label: s.label,
          enabled: !s.enabled,
        },
      }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fonte excluída — as chaves dela deixaram de valer.");
      setConfirmDelete(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => rotateFn({ data: { id } }).then((r) => ({ id, ...r })),
    onSuccess: (r) => {
      setNewKey({ id: r.id, key: r.key });
      toast.success("Chave gerada. A anterior (se houver) continua válida até você revogar.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.revoked ? "Chave anterior revogada." : "Não havia chave anterior.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const draftForm = draft && (
    <div className="int-form" style={{ border: "1px solid var(--v2-line)", borderRadius: 10, padding: 12 }}>
      <Field label="Plataforma">
        <select
          className="int-input"
          value={draft.provider}
          onChange={(e) =>
            setDraft({ ...draft, provider: e.target.value as TrustDraft["provider"] })
          }
        >
          <option value="gitea">Gitea</option>
          <option value="azure_devops">Azure DevOps</option>
          <option value="github" disabled>
            GitHub (em breve)
          </option>
        </select>
      </Field>
      <Field
        label={draft.provider === "azure_devops" ? "Projeto" : "Organização / usuário dono"}
        help={
          draft.provider === "azure_devops"
            ? "Nome do projeto no Azure DevOps (a organização vem da aba Azure DevOps)."
            : "O dono dos repositórios no Gitea, ex.: jaderpaim ou squad-pagamentos."
        }
      >
        <input
          className="int-input mono"
          value={draft.owner}
          onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          placeholder={draft.provider === "azure_devops" ? "ProjetoCore" : "minha-organizacao"}
        />
      </Field>
      <Field
        label="Repositórios"
        help="* = todos os repositórios (inclusive os criados depois); pagamentos-* = os que começam assim; ou o nome exato."
      >
        <input
          className="int-input mono"
          value={draft.repo_pattern}
          onChange={(e) => setDraft({ ...draft, repo_pattern: e.target.value })}
          placeholder="*"
        />
      </Field>
      <Field label="Squad responsável" optional>
        <select
          className="int-input"
          value={draft.department_id}
          onChange={(e) => setDraft({ ...draft, department_id: e.target.value })}
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nome de exibição" optional>
        <input
          className="int-input"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="ex.: Repositórios do time de Pagamentos"
        />
      </Field>
      <div className="int-actions">
        <button
          className="int-btn primary"
          onClick={() => save.mutate(draft)}
          disabled={save.isPending || !draft.owner.trim()}
        >
          Salvar fonte
        </button>
        <button className="int-btn ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="int-form">
      <div className="int-help">
        Cada fonte libera uma organização (ou projeto) com uma chave própria. O {APP_NAME} confere
        na API da plataforma de qual repositório veio cada envio e só aceita se ele estiver dentro
        da fonte dona da chave. Repositórios novos dessa organização entram sozinhos. No Gitea,
        cadastre a chave como segredo da <b>organização</b>, para todos os repositórios herdarem.
      </div>

      {sourcesQ.isLoading ? (
        <div className="int-help">Carregando…</div>
      ) : sources.length === 0 && !draft ? (
        <div className="int-help">Nenhuma fonte cadastrada ainda.</div>
      ) : null}

      {sources.map((s) =>
        draft?.id === s.id ? (
          <React.Fragment key={s.id}>{draftForm}</React.Fragment>
        ) : (
          <div
            key={s.id}
            style={{ display: "grid", gap: 8, border: "1px solid var(--v2-line)", borderRadius: 10, padding: 12 }}
          >
            <ToggleRow
              title={`${TRUST_PROVIDER_LABEL[s.provider]} · ${s.owner}/${s.repo_pattern}`}
              hint={[s.label, deptName(s.department_id) && `Squad: ${deptName(s.department_id)}`]
                .filter(Boolean)
                .join(" · ") || (s.enabled ? "Ativa" : "Desligada — chaves recusadas")}
              checked={s.enabled}
              onChange={() => toggle.mutate(s)}
            />
            {s.keys.length ? (
              s.keys.map((k, i) => (
                <div key={k.hint + k.createdAt} className="int-keyrow">
                  <span>
                    {i === 0 ? "Atual" : "Anterior (ainda válida)"} · {k.hint}…
                  </span>
                  <span>{new Date(k.createdAt).toLocaleString("pt-BR")}</span>
                </div>
              ))
            ) : (
              <div className="int-help">Sem chave — gere uma para os pipelines usarem.</div>
            )}
            {newKey?.id === s.id && (
              <div style={{ display: "grid", gap: 6 }}>
                <div className="int-pw">
                  <input
                    className="int-input"
                    readOnly
                    value={newKey.key}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="int-btn icon"
                    onClick={() => {
                      navigator.clipboard.writeText(newKey.key);
                      toast.success("Chave copiada");
                    }}
                    aria-label="Copiar chave"
                    title="Copiar"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="int-help">
                  Copie agora: esta chave não aparece de novo. Cadastre como segredo
                  SAST_INGEST_KEY da organização e, quando todos os pipelines usarem a nova,
                  revogue a anterior.
                </div>
              </div>
            )}
            <div className="int-actions">
              <button
                className="int-btn"
                onClick={() => rotate.mutate(s.id)}
                disabled={rotate.isPending}
              >
                <RefreshCw size={14} />
                {s.keys.length ? "Gerar nova chave" : "Gerar chave"}
              </button>
              {s.keys.length > 1 && (
                <button
                  className="int-btn"
                  onClick={() => revoke.mutate(s.id)}
                  disabled={revoke.isPending}
                >
                  Revogar anterior
                </button>
              )}
              <button
                className="int-btn ghost"
                onClick={() =>
                  setDraft({
                    id: s.id,
                    provider: s.provider === "azure_devops" ? "azure_devops" : "gitea",
                    owner: s.owner,
                    repo_pattern: s.repo_pattern,
                    department_id: s.department_id ?? "",
                    label: s.label ?? "",
                    enabled: s.enabled,
                  })
                }
              >
                Editar
              </button>
              {confirmDelete === s.id ? (
                <>
                  <button
                    className="int-btn"
                    onClick={() => remove.mutate(s.id)}
                    disabled={remove.isPending}
                  >
                    Confirmar exclusão
                  </button>
                  <button className="int-btn ghost" onClick={() => setConfirmDelete(null)}>
                    Voltar
                  </button>
                </>
              ) : (
                <button
                  className="int-btn ghost"
                  onClick={() => setConfirmDelete(s.id)}
                  aria-label="Excluir fonte"
                  title="Excluir fonte"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ),
      )}

      {draft && !draft.id && draftForm}
      {!draft && (
        <div className="int-actions">
          <button className="int-btn" onClick={() => setDraft({ ...EMPTY_TRUST_DRAFT })}>
            <Plus size={14} /> Adicionar fonte
          </button>
        </div>
      )}
    </div>
  );
}

function SastSheet({
  open,
  onOpenChange,
  item,
  appInsights,
  devops,
  gitea,
  onSaved,
}: SheetBase & {
  appInsights?: Integration;
  devops?: Integration;
  gitea?: Integration;
  onSaved: () => void;
}) {
  const [tab, setTab] = React.useState<"devops" | "gitea" | "appinsights" | "fontes">("devops");
  const [saveCount, setSaveCount] = React.useState(0);
  const [adoEnabled, setAdoEnabled] = React.useState(devops?.enabled ?? false);
  const [adoOrg, setAdoOrg] = React.useState(cfgStr(devops?.config, "organization"));
  // Credencial de leitura que o Z-Sec usa pra conferir a build no Azure
  // DevOps -- sempre própria desta aba (pra um App Registration só, colar o
  // mesmo aqui e na aba App Insights).
  const [adoTenantId, setAdoTenantId] = React.useState(cfgStr(devops?.config, "tenant_id"));
  const [adoClientId, setAdoClientId] = React.useState(cfgStr(devops?.config, "client_id"));
  const [adoSecret, setAdoSecret] = React.useState("");
  const [newKey, setNewKey] = React.useState<string | null>(null);

  // Gitea: endereço + token SÓ DE LEITURA com que o app confere a execução da esteira.
  const [giteaEnabled, setGiteaEnabled] = React.useState(gitea?.enabled ?? false);
  const [giteaUrl, setGiteaUrl] = React.useState(gitea?.base_url ?? "");
  const [giteaToken, setGiteaToken] = React.useState("");

  const [aiEnabled, setAiEnabled] = React.useState(appInsights?.enabled ?? false);
  const [aiTenantId, setAiTenantId] = React.useState(cfgStr(appInsights?.config, "tenant_id"));
  const [aiClientId, setAiClientId] = React.useState(cfgStr(appInsights?.config, "client_id"));
  const [aiWorkspaceId, setAiWorkspaceId] = React.useState(
    cfgStr(appInsights?.config, "workspace_id"),
  );
  const [aiSecret, setAiSecret] = React.useState("");

  React.useEffect(() => {
    setAdoEnabled(devops?.enabled ?? false);
    setAdoOrg(cfgStr(devops?.config, "organization"));
    setAdoTenantId(cfgStr(devops?.config, "tenant_id"));
    setAdoClientId(cfgStr(devops?.config, "client_id"));
    setAdoSecret("");
  }, [devops]);

  React.useEffect(() => {
    setGiteaEnabled(gitea?.enabled ?? false);
    setGiteaUrl(gitea?.base_url ?? "");
    setGiteaToken("");
  }, [gitea]);

  React.useEffect(() => {
    setAiEnabled(appInsights?.enabled ?? false);
    setAiTenantId(cfgStr(appInsights?.config, "tenant_id"));
    setAiClientId(cfgStr(appInsights?.config, "client_id"));
    setAiWorkspaceId(cfgStr(appInsights?.config, "workspace_id"));
    setAiSecret("");
  }, [appInsights]);

  const upsertIntegrationFn = useServerFn(upsertIntegration);
  const keyStatusFn = useServerFn(getSastIngestKeyStatus);
  const rotateKeyFn = useServerFn(rotateSastIngestKey);
  const revokeKeyFn = useServerFn(revokePreviousSastIngestKey);
  const revokeAllKeysFn = useServerFn(revokeAllSastIngestKeys);
  const qc = useQueryClient();
  const [confirmLegacyOff, setConfirmLegacyOff] = React.useState(false);

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
      toast.success(
        r.revoked ? "Chave anterior revogada." : "Não havia chave anterior pra revogar.",
      );
      qc.invalidateQueries({ queryKey: ["sast-ingest-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAllKeys = useMutation({
    mutationFn: () => revokeAllKeysFn(),
    onSuccess: () => {
      toast.success("Chave legada desativada. Só as chaves das fontes confiáveis valem agora.");
      setConfirmLegacyOff(false);
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
      if (org && !ADO_ORG_RE.test(org)) {
        throw new Error("Organização inválida: use só o nome (ex.: minha-organizacao), sem URL.");
      }
      const aiFields = [aiTenantId, aiClientId, aiWorkspaceId, aiSecret].map((v) => v.trim());
      // Secret vazio vale se já houver um gravado (só de escrita: vazio = manter)
      const aiHasSecret = !!aiFields[3] || !!appInsights?.secrets.api_key;
      if (aiEnabled && (aiFields.slice(0, 3).some((v) => !v) || !aiHasSecret)) {
        throw new Error(
          "App Insights: preencha Tenant ID, Client ID, Workspace ID e Client Secret antes de ativar.",
        );
      }
      const adoOwn = [adoTenantId, adoClientId, adoSecret].map((v) => v.trim());
      const adoHasSecret = !!adoOwn[2] || !!devops?.secrets.api_key;
      if (adoEnabled && (!org || !adoOwn[0] || !adoOwn[1] || !adoHasSecret)) {
        throw new Error(
          "Azure DevOps: preencha Organização, Tenant ID, Client ID e Client Secret da credencial de leitura antes de ativar.",
        );
      }
      // Não cria linha vazia pra aba que nunca foi usada.
      if (devops || adoEnabled || org || adoOwn.some(Boolean)) {
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
      const gUrl = giteaUrl.trim().replace(/\/+$/, "");
      if (gUrl && !/^https?:\/\/[^/?#@\s]+(\/[^?#@\s]*)?$/i.test(gUrl)) {
        throw new Error("Gitea: endereço inválido. Use só a raiz, ex.: https://git.empresa.com.br");
      }
      const giteaHasToken = !!giteaToken.trim() || !!gitea?.secrets.api_key;
      if (giteaEnabled && (!gUrl || !giteaHasToken)) {
        throw new Error("Gitea: preencha o endereço e o token de leitura antes de ativar.");
      }
      if (gitea || giteaEnabled || gUrl || giteaToken.trim()) {
        await upsertIntegrationFn({
          data: {
            provider: SAST_GITEA,
            name: "Gitea (SAST)",
            enabled: giteaEnabled,
            base_url: gUrl || null,
            api_key: giteaToken.trim() || null,
            config: { ...(gitea?.config ?? {}) },
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
      setSaveCount((c) => c + 1);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Chave única de ingestão: usada pelas pipelines do Azure DevOps e do Gitea.
  const ingestKeyBlock = (
    <>
      <div className="int-sublabel">Chave legada (vale para qualquer repositório)</div>
      <div className="int-help">
        Prefira as chaves por organização, na aba <b>Fontes confiáveis</b>. Quando todos os
        pipelines tiverem migrado, revogue esta chave.
      </div>
      {ingestKeys.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {ingestKeys.map((k, i) => (
            <div key={k.hint + k.createdAt} className="int-keyrow">
              <span>
                {i === 0 ? "Atual" : "Anterior (ainda válida)"} · {k.hint}…
              </span>
              <span>{new Date(k.createdAt).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="int-help">
          Nenhuma chave gerada ainda — sem ela, os envios das pipelines recebem 503.
        </div>
      )}
      <div className="int-actions">
        <button
          className="int-btn"
          onClick={() => rotateKey.mutate()}
          disabled={rotateKey.isPending}
        >
          <RefreshCw size={14} />
          {ingestKeys.length ? "Gerar nova chave" : "Gerar chave"}
        </button>
        {ingestKeys.length > 1 && (
          <button
            className="int-btn"
            onClick={() => revokeKey.mutate()}
            disabled={revokeKey.isPending}
          >
            Revogar anterior
          </button>
        )}
        {ingestKeys.length > 0 &&
          (confirmLegacyOff ? (
            <>
              <button
                className="int-btn"
                onClick={() => revokeAllKeys.mutate()}
                disabled={revokeAllKeys.isPending}
              >
                Confirmar: desativar chave legada
              </button>
              <button className="int-btn ghost" onClick={() => setConfirmLegacyOff(false)}>
                Voltar
              </button>
            </>
          ) : (
            <button className="int-btn ghost" onClick={() => setConfirmLegacyOff(true)}>
              Desativar chave legada
            </button>
          ))}
      </div>
      {newKey && (
        <div style={{ display: "grid", gap: 6 }}>
          <div className="int-pw">
            <input
              className="int-input"
              readOnly
              value={newKey}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="int-btn icon"
              onClick={copyNewKey}
              aria-label="Copiar chave"
              title="Copiar"
            >
              <Copy size={14} />
            </button>
          </div>
          <div className="int-help">
            Copie agora: esta chave não aparece de novo (o {APP_NAME} guarda só o hash). Coloque no
            template de pipeline e, depois que todas as builds estiverem usando a nova, revogue a
            anterior.
          </div>
        </div>
      )}
      <div className="int-help">
        A chave é a mesma para Azure DevOps e Gitea e só serve para enviar relatório ao {APP_NAME},
        sem acesso a nada nas plataformas. Sozinha não basta para forjar dado: todo envio é
        conferido contra uma build/execução real em andamento.
      </div>
    </>
  );

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      eyebrow="integrations · azure_devops_sast + gitea_sast + azure_app_insights"
      title={<SheetTitle item={item} />}
      badges={<SheetBadges item={item} />}
      footer={
        <SaveFooter
          onClose={() => onOpenChange(false)}
          onSave={() => save.mutate()}
          pending={save.isPending}
        />
      }
    >
      <SecretReset.Provider value={saveCount}>
        <div className="int-root" style={{ gap: 20 }}>
          <SegTabs
            value={tab}
            onChange={setTab}
            options={[
              ["devops", "Azure DevOps"],
              ["gitea", "Gitea"],
              ["appinsights", "App Insights"],
              ["fontes", "Fontes confiáveis"],
            ]}
          />
          {tab === "fontes" ? (
            <SastTrustSourcesPanel />
          ) : tab === "devops" ? (
            <div className="int-form">
              {/* ── Azure DevOps: a pipeline envia direto com a chave de ingestão; o
                Z-Sec confere a build com a credencial de leitura dele ── */}
              <ToggleRow
                title="Ingestão direta ativa"
                hint={
                  adoEnabled
                    ? `Pipelines enviam o relatório direto para o ${APP_NAME}`
                    : "Desligada — envios das pipelines recebem 503"
                }
                checked={adoEnabled}
                onChange={setAdoEnabled}
              />
              <Field
                label="Organização Azure DevOps"
                help="Só builds desta organização (dev.azure.com/<organização>) são aceitas. Use só o nome, sem URL."
              >
                <input
                  className="int-input"
                  value={adoOrg}
                  onChange={(e) => setAdoOrg(e.target.value)}
                  placeholder="minha-organizacao"
                />
              </Field>
              <Field label="Endpoint para a pipeline">
                <input
                  className="int-input mono"
                  readOnly
                  value="/api/public/hooks/sast-ingest"
                  onFocus={(e) => e.target.select()}
                />
              </Field>

              {ingestKeyBlock}

              <div className="int-sublabel">Credencial de leitura (conferência da build)</div>
              <Field label="Tenant ID" help="Directory (tenant) ID do Microsoft Entra ID.">
                <input
                  className="int-input mono"
                  value={adoTenantId}
                  onChange={(e) => setAdoTenantId(e.target.value)}
                  placeholder="ex: 00000000-0000-0000-0000-000000000000"
                />
              </Field>
              <Field label="Client ID" help="Application (client) ID do App Registration.">
                <input
                  className="int-input mono"
                  value={adoClientId}
                  onChange={(e) => setAdoClientId(e.target.value)}
                  placeholder="ex: 00000000-0000-0000-0000-000000000000"
                />
              </Field>
              <Field
                label="Client Secret"
                help="App Registration só de leitura: adicionado à organização do Azure DevOps (Organization settings → Users) e ao grupo Readers de cada projeto. Usado só para ler a build e o commit. Pode ser o mesmo da aba App Insights: basta preencher os mesmos valores nas duas."
              >
                <SecretInput
                  value={adoSecret}
                  onChange={setAdoSecret}
                  saved={devops?.secrets.api_key}
                />
              </Field>
            </div>
          ) : tab === "gitea" ? (
            <div className="int-form">
              {/* ── Gitea: a esteira (Gitea Actions) envia direto com a chave de ingestão;
                o app confere a execução com um token só de leitura ── */}
              <ToggleRow
                title="Ingestão do Gitea ativa"
                hint={
                  giteaEnabled
                    ? `Esteiras do Gitea enviam o relatório direto para o ${APP_NAME}`
                    : "Desligada — envios do Gitea recebem 503"
                }
                checked={giteaEnabled}
                onChange={setGiteaEnabled}
              />
              <Field
                label="Endereço do Gitea"
                help="Raiz do servidor, sem /api (ex.: https://git.empresa.com.br). Só execuções deste servidor são aceitas."
              >
                <input
                  className="int-input"
                  value={giteaUrl}
                  onChange={(e) => setGiteaUrl(e.target.value)}
                  placeholder="https://git.empresa.com.br"
                />
              </Field>
              <Field label="Endpoint para a esteira">
                <input
                  className="int-input mono"
                  readOnly
                  value="/api/public/hooks/sast-ingest"
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              {ingestKeyBlock}
              <div className="int-sublabel">Token de leitura (conferência da execução)</div>
              <Field
                label="Token de acesso"
                help="Gitea → Configurações → Aplicações → Gerar token, só com permissão repository: Leitura. Usado só para ler a execução da esteira e o commit."
              >
                <SecretInput
                  value={giteaToken}
                  onChange={setGiteaToken}
                  saved={gitea?.secrets.api_key}
                />
              </Field>
            </div>
          ) : (
            <div className="int-form">
              {/* ── App Insights: o Z-Sec lê o que a telemetria do template já grava ── */}
              <ToggleRow
                title="Sincronização App Insights ativa"
                hint={
                  aiEnabled
                    ? "Cron sast-sync lê SecretDetected / ScanCompleted"
                    : "Desligada — independente da aba Azure DevOps"
                }
                checked={aiEnabled}
                onChange={setAiEnabled}
              />
              <Field label="Tenant ID" help="Directory (tenant) ID do Microsoft Entra ID.">
                <input
                  className="int-input mono"
                  value={aiTenantId}
                  onChange={(e) => setAiTenantId(e.target.value)}
                  placeholder="ex: 00000000-0000-0000-0000-000000000000"
                />
              </Field>
              <Field label="Client ID" help="Application (client) ID do App Registration.">
                <input
                  className="int-input mono"
                  value={aiClientId}
                  onChange={(e) => setAiClientId(e.target.value)}
                  placeholder="ex: 00000000-0000-0000-0000-000000000000"
                />
              </Field>
              <Field
                label="Workspace ID"
                help="Workspace ID do Log Analytics devops-clarity-hub-insights-law (tela Overview do workspace). Não é o Application ID nem a Instrumentation Key do App Insights."
              >
                <input
                  className="int-input mono"
                  value={aiWorkspaceId}
                  onChange={(e) => setAiWorkspaceId(e.target.value)}
                  placeholder="ex: 00000000-0000-0000-0000-000000000000"
                />
              </Field>
              <Field
                label="Client Secret"
                help='Leitura pela Log Analytics Query API com OAuth2 client_credentials. A Instrumentation Key NÃO serve aqui: ela só grava. O App Registration precisa do papel "Log Analytics Reader" no workspace.'
              >
                <SecretInput
                  value={aiSecret}
                  onChange={setAiSecret}
                  saved={appInsights?.secrets.api_key}
                />
              </Field>
            </div>
          )}
          <SyncSection item={item} />
        </div>
      </SecretReset.Provider>
    </DetailSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEK / ZENDESK — não é um provider genérico (sem base_url/api_key): a sessão
// é renovada localmente via sek-session-capture (Playwright), não por
// credencial de API armazenada aqui. Ver handoff em memória do projeto.
// ══════════════════════════════════════════════════════════════════════════════

// Instalador Windows do sek-session-capture, hospedado no Storage do próprio
// Supabase/Lovable (bucket público "installers"). macOS fica pra uma próxima
// leva -- combinado com o usuário.
const SEK_INSTALLER_URL =
  "https://tcacmepuiyoqkypatkqa.supabase.co/storage/v1/object/public/installers/sek-session-capture-setup.exe";

function SekSheet({ open, onOpenChange, item }: SheetBase) {
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

  const { data: sessionStatus } = useQuery({
    queryKey: ["sek-zendesk-session-status"],
    queryFn: () => statusFn(),
  });

  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: () => generateTokenFn(),
    onSuccess: (result) => {
      setToken(result.token);
      toast.success(
        `Token gerado — válido por ${Math.round(result.expiresInSeconds / 60)} min, uso único`,
      );
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

  const entries = (
    Array.isArray(log)
      ? (log as Array<{
          id: string;
          reported_at?: string;
          created_at?: string;
          triggered_by_name?: string;
        }>)
      : []
  ).slice(0, 6);

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      eyebrow="sek-session-capture · renovação local"
      title={<SheetTitle item={item} />}
      badges={<SheetBadges item={item} />}
      footer={
        <button className="int-btn ghost" onClick={() => onOpenChange(false)}>
          Fechar
        </button>
      }
    >
      <div className="int-root" style={{ gap: 20 }}>
        <DetailSection title="Sessões vigentes">
          {sessionStatus?.sessions.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {sessionStatus.sessions.map((s) => (
                <div key={s.userId} className="int-keyrow">
                  <span>{s.name}</span>
                  <span>{new Date(s.lastModified).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="int-help">Nenhuma sessão vigente ainda.</div>
          )}
          {sessionStatus?.legacy && (
            <div className="int-help" style={{ marginTop: 8 }}>
              Existe uma sessão no formato antigo (de antes de sessões por usuário) ainda sendo
              usada só como apoio pro sync — quem a criou precisa renovar de novo pra aparecer aqui
              e poder responder chamados.
            </div>
          )}
        </DetailSection>

        <DetailSection title="Renovar sessão">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="int-note">
              A sessão do Zendesk é renovada localmente pelo <strong>SEK Session Capture</strong>:
              gere um token (10 min, uso único) e cole no app quando ele pedir.
            </div>
            <div className="int-actions">
              <button
                className="int-btn primary"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                <RefreshCw size={14} />
                Gerar token de renovação
              </button>
              <a className="int-btn" href={SEK_INSTALLER_URL} download>
                <Download size={14} />
                Baixar instalador (Windows)
              </a>
            </div>
            {token && (
              <div className="int-pw">
                <input
                  className="int-input"
                  readOnly
                  value={token}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="int-btn icon"
                  onClick={copyToken}
                  aria-label="Copiar token"
                  title="Copiar"
                >
                  <Copy size={14} />
                </button>
              </div>
            )}
          </div>
        </DetailSection>

        {entries.length > 0 && (
          <DetailSection title="Histórico recente">
            <DetailList
              items={entries.map((e): [string, React.ReactNode] => [
                new Date(e.reported_at ?? e.created_at ?? "").toLocaleString("pt-BR"),
                e.triggered_by_name ?? "desconhecido",
              ])}
            />
          </DetailSection>
        )}

        <SyncSection item={item} />
      </div>
    </DetailSheet>
  );
}
