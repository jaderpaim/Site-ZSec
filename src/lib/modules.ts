import {
  ShieldAlert,
  AppWindow,
  FileText,
  RefreshCw,
  Activity,
  Sparkles,
  Users2,
  ShieldCheck,
  Lock,
  Globe,
  Radio,
  Fish,
  Server,
  CalendarCheck,
  AlertTriangle,
  Network,
  Building2,
  Upload,
  Plug,
  ScrollText,
  GitPullRequest,
  Mail,
  Users,
  UserCheck,
  Truck,
  Smile,
  Database,
  Pill,
  Gauge,
  KeyRound,
  Bell,
  Timer,
  Radar,
  BarChart3,
  FileWarning,
  Presentation,
  GitBranch,
  GraduationCap,
} from "lucide-react";

export type ModuleGroup = "Executivo" | "Monitoramento" | "Governança" | "Operações" | "Cadastros" | "Configurações";

export type HeaderConfig = {
  hidePeriod?: boolean;
  hideDepartment?: boolean;
  hideExport?: boolean;
};

export type ModuleDef = {
  slug: string;
  title: string;
  short: string;
  group: ModuleGroup;
  icon: typeof ShieldAlert;
  headerConfig?: HeaderConfig;
  /** Fora do menu e da busca; continua existindo para permissões (ex.: segmentos, hoje aba da Maturidade). */
  hidden?: boolean;
};

export const MODULES: ModuleDef[] = [
  // ── Executivo ──────────────────────────────────────────────────────────────
  {
    slug: "painel-executivo",
    title: "Painel Executivo",
    short: "Executivo",
    group: "Executivo",
    icon: Gauge,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "painel-c-level",
    title: "Painel C-Level",
    short: "C-Level",
    group: "Executivo",
    icon: Presentation,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  // ── Monitoramento ──────────────────────────────────────────────────────────
  {
    slug: "cloudflare-waf",
    title: "Cloudflare WAF",
    short: "Cloudflare WAF",
    group: "Monitoramento",
    icon: Globe,
    headerConfig: { hidePeriod: false, hideDepartment: true, hideExport: true },
  },
  {
    slug: "dominios-ssl",
    title: "Domínios / SSL",
    short: "Domínios/SSL",
    group: "Monitoramento",
    icon: Lock,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "fornecedores",
    title: "Fornecedores",
    short: "Fornecedores",
    group: "Monitoramento",
    icon: Truck,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  { slug: "privacy-tools", title: "Privacy Tools (LGPD)", short: "Privacy Tools", group: "Monitoramento", icon: Lock },
  {
    slug: "dlp",
    title: "DLP (Purview)",
    short: "DLP",
    group: "Monitoramento",
    icon: FileWarning,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "ranking-ia",
    title: "Ranking de Uso de IA",
    short: "Ranking IA",
    group: "Monitoramento",
    icon: Sparkles,
    headerConfig: { hidePeriod: false, hideDepartment: true, hideExport: true },
  },
  {
    slug: "soc",
    title: "SOC Monitoramento",
    short: "SOC",
    group: "Monitoramento",
    icon: Radio,
    headerConfig: { hidePeriod: false, hideDepartment: true, hideExport: true },
  },
  {
    slug: "sophos-xdr",
    title: "Sophos XDR (Antivírus)",
    short: "Sophos XDR",
    group: "Monitoramento",
    icon: ShieldCheck,
    headerConfig: { hidePeriod: false, hideDepartment: true, hideExport: true },
  },
  {
    slug: "vulnerabilidades",
    title: "Gestão de Vulnerabilidades",
    short: "Vulnerabilidades",
    group: "Monitoramento",
    icon: ShieldAlert,
    headerConfig: { hidePeriod: false, hideDepartment: false, hideExport: true },
  },
  {
    slug: "dast-scanner",
    title: "DAST Security Scanner",
    short: "DAST Scanner",
    group: "Operações",
    icon: Radar,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "sast",
    title: "SAST · Esteiras CI/CD",
    short: "SAST",
    group: "Operações",
    icon: GitBranch,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "shadow-it",
    title: "Shadow IT",
    short: "Shadow IT",
    group: "Operações",
    icon: Network,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },

  // ── Governança ─────────────────────────────────────────────────────────────
  {
    slug: "benchmark",
    title: "Comparações – Benchmark",
    short: "Benchmark",
    group: "Governança",
    icon: BarChart3,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  { slug: "comites", title: "Comitês", short: "Comitês", group: "Governança", icon: CalendarCheck },
  {
    slug: "nps",
    title: "NPS",
    short: "NPS",
    group: "Governança",
    icon: Smile,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  { slug: "gmud", title: "Gestão de Mudança (GMUD)", short: "GMUD", group: "Governança", icon: GitPullRequest },
  { slug: "maturidade", title: "Maturidade do Ambiente", short: "Maturidade", group: "Governança", icon: Activity },
  {
    slug: "nao-conformidade",
    title: "Não Conformidade",
    short: "Não Conformidade",
    group: "Governança",
    icon: AlertTriangle,
  },
  { slug: "organizacao", title: "Organização SI", short: "Organização", group: "Governança", icon: Users2 },
  { slug: "politicas", title: "Políticas e Processos", short: "Políticas", group: "Governança", icon: FileText },
  {
    slug: "pilulas-si",
    title: "Pílulas de SI",
    short: "Pílulas SI",
    group: "Governança",
    icon: Pill,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "treinamentos",
    title: "Treinamentos",
    short: "Treinamentos",
    group: "Governança",
    icon: GraduationCap,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "disponibilidade",
    title: "Disponibilidade de Ativos",
    short: "Disponibilidade",
    group: "Governança",
    icon: Network,
  },

  // ── Operações ──────────────────────────────────────────────────────────────

  { slug: "phishing", title: "Simulação de Phishing", short: "Phishing", group: "Operações", icon: Fish },
  { slug: "wsus", title: "WSUS", short: "WSUS", group: "Operações", icon: Server },
  {
    slug: "cmdb",
    title: "CMDB",
    short: "CMDB",
    group: "Operações",
    icon: Database,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },

  // ── Cadastros ──────────────────────────────────────────────────────────────
  {
    slug: "aprovadores",
    title: "Aprovadores",
    short: "Aprovadores",
    group: "Cadastros",
    icon: UserCheck,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "aplicacoes",
    title: "Aplicações",
    short: "Aplicações",
    group: "Cadastros",
    icon: AppWindow,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "departamentos",
    title: "Departamentos",
    short: "Departamentos",
    group: "Cadastros",
    icon: Building2,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },
  {
    slug: "segmentos",
    title: "Notas de maturidade (Segmentos)",
    short: "Segmentos",
    group: "Governança",
    icon: Activity,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
    // Virou a aba "Notas e segmentos" da Maturidade; o slug fica só pelas permissões.
    hidden: true,
  },
  {
    slug: "upload",
    title: "Importação de Dados",
    short: "Importar Dados",
    group: "Cadastros",
    icon: Upload,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },

  // ── Configurações ──────────────────────────────────────────────────────────
  {
    slug: "excecao-sophos",
    title: "Exceção Sophos",
    short: "Exceção Sophos",
    group: "Configurações",
    icon: ShieldCheck,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "logs",
    title: "Logs",
    short: "Logs",
    group: "Configurações",
    icon: ScrollText,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },
  {
    slug: "smtp",
    title: "Configuração SMTP",
    short: "SMTP",
    group: "Configurações",
    icon: Mail,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },
  {
    slug: "sso-ldap",
    title: "SSO / LDAP",
    short: "SSO / LDAP",
    group: "Configurações",
    icon: KeyRound,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "usuarios",
    title: "Usuários e Permissões",
    short: "Usuários",
    group: "Configurações",
    icon: Users,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },
  {
    slug: "integracoes",
    title: "Integração API",
    short: "Integração API",
    group: "Configurações",
    icon: Plug,
    headerConfig: { hidePeriod: true, hideDepartment: true },
  },
  {
    slug: "alertas",
    title: "Alertas",
    short: "Alertas",
    group: "Configurações",
    icon: Bell,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
  {
    slug: "cron-jobs",
    title: "Cron Jobs",
    short: "Cron Jobs",
    group: "Configurações",
    icon: Timer,
    headerConfig: { hidePeriod: true, hideDepartment: true, hideExport: true },
  },
];

export const MODULE_BY_SLUG = Object.fromEntries(MODULES.map((m) => [m.slug, m]));
