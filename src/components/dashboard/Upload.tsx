import * as React from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDepartments } from "@/lib/use-departments";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { MODULES } from "@/lib/modules";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Lock,
  Unlock,
  Upload,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";

const TARGET_FIELDS = [
  { key: "fqdn", label: "FQDN / Host *", required: true },
  { key: "severity", label: "Severidade *", required: true },
  { key: "status", label: "Status", required: false },
  { key: "responsible", label: "Responsável / Usuário", required: false },
  { key: "identified_at", label: "Data", required: false },
  { key: "source", label: "Origem", required: false },
  { key: "vuln_type", label: "Tipo / Evento", required: false },
  { key: "system_app", label: "Sistema / Descrição", required: false },
  { key: "department", label: "Departamento (nome)", required: false },
  { key: "external_id", label: "ID externo", required: false },
] as const;

const COLAB_FIELDS = [
  { key: "display_name", label: "Display Name *", required: true },
  { key: "email", label: "E-mail *", required: true },
  { key: "unidade", label: "Unidade", required: false },
  { key: "department", label: "Departamento (nome)", required: false },
  { key: "cargo", label: "Cargo", required: false },
] as const;

const IA_FIELDS = [
  { key: "event_at", label: "Data/Hora *", required: true },
  { key: "user_name", label: "Usuário *", required: true },
  { key: "endpoint_name", label: "Dispositivo / Host", required: false },
  { key: "domain", label: "Domínio / URL *", required: true },
  { key: "raw_event", label: "Evento (descrição)", required: false },
] as const;

const WSUS_FIELDS = [
  { key: "computer_name", label: "Computer Name *", required: true },
  { key: "needed", label: "Needed", required: false },
  { key: "installed_or_na", label: "Installed/Not Applicable", required: false },
  { key: "failed", label: "Failed", required: false },
  { key: "no_status", label: "No Status", required: false },
  { key: "report_date", label: "Data", required: false },
] as const;

const CMDB_FIELDS = [
  { key: "cmdb_nome", label: "Nome *", required: true },
  { key: "cmdb_tipo", label: "Tipo *", required: true },
  { key: "cmdb_ip", label: "IP / Hostname", required: false },
  { key: "cmdb_criticidade", label: "Criticidade", required: false },
  { key: "cmdb_observacoes", label: "Observações", required: false },
] as const;

const DEPT_FIELDS = [
  { key: "fqdn", label: "Departamento (nome) *", required: true },
  { key: "system_app", label: "Descrição", required: false },
] as const;

type FieldKey =
  | (typeof TARGET_FIELDS)[number]["key"]
  | (typeof COLAB_FIELDS)[number]["key"]
  | (typeof IA_FIELDS)[number]["key"]
  | (typeof WSUS_FIELDS)[number]["key"]
  | (typeof CMDB_FIELDS)[number]["key"];

const SEV_NORMALIZE: Record<string, string> = {
  critica: "Crítica",
  crítica: "Crítica",
  critical: "Crítica",
  crit: "Crítica",
  alta: "Alta",
  high: "Alta",
  media: "Média",
  média: "Média",
  medium: "Média",
  med: "Média",
  baixa: "Baixa",
  low: "Baixa",
};
const STATUS_NORMALIZE: Record<string, string> = {
  // Aberta
  aberta: "Aberta",
  aberto: "Aberta",
  open: "Aberta",
  nova: "Aberta",
  novo: "Aberta",
  new: "Aberta",
  maintained: "Aberta",
  pendente: "Aberta",
  pending: "Aberta",
  "a fazer": "Aberta",
  todo: "Aberta",
  identificada: "Aberta",
  identificado: "Aberta",
  detectada: "Aberta",
  detectado: "Aberta",
  // Em tratamento
  "em tratamento": "Em tratamento",
  tratando: "Em tratamento",
  tratamento: "Em tratamento",
  "em andamento": "Em tratamento",
  andamento: "Em tratamento",
  "em progresso": "Em tratamento",
  "in progress": "Em tratamento",
  "in-progress": "Em tratamento",
  doing: "Em tratamento",
  "em analise": "Em tratamento",
  "em análise": "Em tratamento",
  analise: "Em tratamento",
  análise: "Em tratamento",
  investigando: "Em tratamento",
  wip: "Em tratamento",
  "em remediacao": "Em tratamento",
  "em remediação": "Em tratamento",
  remediando: "Em tratamento",
  // Mitigada
  mitigada: "Mitigada",
  mitigado: "Mitigada",
  mitigated: "Mitigada",
  aceita: "Mitigada",
  aceito: "Mitigada",
  accepted: "Mitigada",
  "risco aceito": "Mitigada",
  "risk accepted": "Mitigada",
  // Fechada / Concluída
  fechada: "Fechada",
  fechado: "Fechada",
  closed: "Fechada",
  resolved: "Fechada",
  resolvida: "Fechada",
  resolvido: "Fechada",
  concluida: "Fechada",
  concluído: "Fechada",
  "concluida.": "Fechada",
  concluída: "Fechada",
  concluido: "Fechada",
  completa: "Fechada",
  completo: "Fechada",
  completed: "Fechada",
  done: "Fechada",
  finalizada: "Fechada",
  finalizado: "Fechada",
  encerrada: "Fechada",
  encerrado: "Fechada",
  corrigida: "Fechada",
  corrigido: "Fechada",
  fixed: "Fechada",
  fix: "Fechada",
};

function autoMatch(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(^id$|event.?id|alert.?id|detection.?id|chave|key)/.test(h)) return "external_id";
  if (/(fqdn|host|hostname|asset|ativo|endpoint|device|machine|url)/.test(h)) return "fqdn";
  if (/(severid|severity|criticidad|risk|risco)/.test(h)) return "severity";
  if (/(status|situa|state)/.test(h)) return "status";
  if (/(user|usuario|usuário|respons|owner|assign|account)/.test(h)) return "responsible";
  if (/(data|date|time|when|identif|detect|criad|criada|created|opened|aberto|raised)/.test(h))
    return "identified_at";
  if (/(origem|source|scanner|tool|product|produto)/.test(h)) return "source";
  if (/(categor|tipo|type|event|evento|threat|name)/.test(h)) return "vuln_type";
  if (/(descri|description|sistema|app|aplica|system|message|mensagem)/.test(h))
    return "system_app";
  if (/(depart|setor|area|área|tenant)/.test(h)) return "department";
  return "";
}

function autoMatchColab(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(e[-\s]?mail|email)/.test(h)) return "email";
  if (/(display.?name|nome|name|full.?name)/.test(h)) return "display_name";
  if (/(unidade|filial|site|location|local)/.test(h)) return "unidade";
  if (/(depart|setor|área|area)/.test(h)) return "department";
  if (/(cargo|role|posi|titulo|título|job)/.test(h)) return "cargo";
  return "";
}

function autoMatchIa(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(data|date|when|quando|hora|time|timestamp)/.test(h)) return "event_at";
  if (/(user|usuario|usuário|account|login)/.test(h)) return "user_name";
  if (/(device|dispositivo|endpoint|host|machine|computador|pc)/.test(h)) return "endpoint_name";
  if (/(url|site|domain|domínio|dominio|host|address|endere)/.test(h)) return "domain";
  if (/(event|evento|descri|description|action|categor|tipo|name)/.test(h)) return "raw_event";
  return "";
}

function autoMatchWsus(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(computer.?name|host|server|servidor|machine|nome)/.test(h)) return "computer_name";
  if (/(installed|aplicad|not applicable|n\/a|na)/.test(h)) return "installed_or_na";
  if (/(needed|necess|pendent)/.test(h)) return "needed";
  if (/(failed|falh|error|erro)/.test(h)) return "failed";
  if (/(no status|sem status|unknown|desconhe)/.test(h)) return "no_status";
  if (/(data|date|last|ultim|último|report)/.test(h)) return "report_date";
  return "";
}

function autoMatchCmdb(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(ip|hostname|host|endere)/.test(h)) return "cmdb_ip";
  if (/(criticidad|criticality|severid|priorid)/.test(h)) return "cmdb_criticidade";
  if (/(obs|observa|coment|note|nota|descri)/.test(h)) return "cmdb_observacoes";
  if (/(tipo|type|categor|class)/.test(h)) return "cmdb_tipo";
  if (/(nome|name|ativo|asset)/.test(h)) return "cmdb_nome";
  return "";
}

function autoMatchDept(header: string): FieldKey | "" {
  const h = header.toLowerCase().trim();
  if (/(depart|setor|area|área|nome|name)/.test(h)) return "fqdn";
  if (/(descri|description|obs|note|nota)/.test(h)) return "system_app";
  return "";
}

// Mapa de meses PT/EN (com e sem ponto) → número 01-12
const MONTH_MAP: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  january: 1,
  fev: 2,
  fevereiro: 2,
  feb: 2,
  february: 2,
  mar: 3,
  marco: 3,
  março: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  mai: 5,
  maio: 5,
  may: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  set: 9,
  setembro: 9,
  sep: 9,
  sept: 9,
  september: 9,
  out: 10,
  outubro: 10,
  oct: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dezembro: 12,
  dec: 12,
  december: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoFromYMD(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y < 100 ? y + 2000 : y, m - 1, d));
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return null;
  return `${dt.getUTCFullYear()}-${pad2(m)}-${pad2(d)}`;
}

// Retorna ISO YYYY-MM-DD ou null — NUNCA usa "hoje" como fallback.
function parseDate(v: any): string | null {
  if (v == null || v === "") return null;

  // Date object (xlsx cellDates:true pode trazer Date direto)
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
  }

  // Serial Excel
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return isoFromYMD(d.y, d.m, d.d);
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  // ISO completo (YYYY-MM-DD, com ou sem horário)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoFromYMD(+iso[1], +iso[2], +iso[3]);

  // dd-mes-yyyy / dd/mes/yyyy / dd mes yyyy / dd.mes.yyyy  (mês por nome PT/EN)
  const named = s.match(/^(\d{1,2})[\/\-.\s]+([A-Za-zÀ-ÿ]+)\.?[\/\-.\s]+(\d{2,4})/);
  if (named) {
    const day = +named[1];
    const monKey = named[2]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.+$/, "");
    const mon = MONTH_MAP[monKey];
    const year = +named[3];
    if (mon) return isoFromYMD(year, mon, day);
  }

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) return isoFromYMD(+dmy[3], +dmy[2], +dmy[1]);

  return null;
}

function normalizeDedupText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function firstNonEmptyDedupValue(values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeDedupText(value);
    if (normalized) return normalized;
  }
  return "";
}

function buildVulnIdentityKey(
  fqdn: string,
  vuln_type: string | null,
  system_app: string | null,
  raw: Record<string, any> | null,
  external_id?: string | null,
): string {
  // Prefer a stable external ID (DB column OR JIRA key from raw) — immune to title edits
  const extId = firstNonEmptyDedupValue([
    external_id,
    raw?.["Chave do item (JIRA)"],
    raw?.["Chave"],
    raw?.["Key"],
    raw?.["Issue Key"],
    raw?.["external_id"],
  ]);
  if (extId) return [normalizeDedupText(fqdn), extId].join("|");

  // Fallback for non-JIRA sources: resumo + descrição
  const resumo = firstNonEmptyDedupValue([
    raw?.["Resumo"],
    raw?.["Título"],
    raw?.["Titulo"],
    raw?.["Title"],
    raw?.["Nome"],
    raw?.["Name"],
    raw?.["Summary"],
    raw?.["Vulnerability"],
    vuln_type,
  ]);
  const descricao = firstNonEmptyDedupValue([
    raw?.["Descrição"],
    raw?.["Descriação"],
    raw?.["Descricao"],
    raw?.["Description"],
    system_app,
  ]);
  return [normalizeDedupText(fqdn), resumo, descricao].join("|");
}

function buildVulnerabilityImportKey(record: {
  fqdn: string;
  vuln_type: string | null;
  severity: string;
  system_app: string | null;
  source: string | null;
  identified_at: string | null;
  kind: string;
  raw?: Record<string, any> | null;
}) {
  const summary = firstNonEmptyDedupValue([
    record.raw?.["Resumo"],
    record.vuln_type,
    record.raw?.["Descrição"],
  ]);
  const port = firstNonEmptyDedupValue([
    record.raw?.["Campo personalizado (Port)"],
    record.raw?.["Porta"],
    record.raw?.["Port"],
  ]);
  const references = firstNonEmptyDedupValue([
    record.raw?.["Campo personalizado (References)"],
    record.raw?.["CVE"],
    record.raw?.["Plugin ID"],
  ]);
  const asset = firstNonEmptyDedupValue([
    record.system_app,
    record.raw?.["Campo personalizado (Asset)"],
    record.raw?.["Asset"],
  ]);
  const url = firstNonEmptyDedupValue([
    record.raw?.["Campo personalizado (URL)"],
    record.raw?.["URL"],
    record.raw?.["Url"],
    record.raw?.["Path"],
  ]);
  const param = firstNonEmptyDedupValue([
    record.raw?.["Campo personalizado (Parameter)"],
    record.raw?.["Parameter"],
    record.raw?.["Parametro"],
    record.raw?.["Parâmetro"],
  ]);
  const evidence = firstNonEmptyDedupValue([
    record.raw?.["Campo personalizado (Evidence)"],
    record.raw?.["Evidence"],
    record.raw?.["Evidencia"],
    record.raw?.["Evidência"],
  ]);
  const externalId = firstNonEmptyDedupValue([
    record.raw?.["Chave do item (JIRA)"],
    record.raw?.["Chave"],
    record.raw?.["Key"],
    record.raw?.["Issue Key"],
    record.raw?.["ID"],
  ]);
  const description = normalizeDedupText(
    record.raw?.["Descrição"] ?? record.raw?.["Descriação"] ?? record.raw?.["Description"],
  );

  return [
    normalizeDedupText(record.fqdn),
    summary,
    port,
    references,
    record.severity,
    asset,
    normalizeDedupText(record.source),
    record.identified_at ?? "",
    normalizeDedupText(record.kind),
    url,
    param,
    evidence,
    externalId,
    description,
  ].join("|");
}

export function UploadDashboard() {
  const qc = useQueryClient();
  const { data: depts } = useDepartments();
  const { user } = useAuth();
  const { isAdmin, can, isModuleAdmin } = usePermissions();
  const canImport = isAdmin || isModuleAdmin("upload") || can("upload", "create");
  const [module, setModule] = React.useState<string>("");
  const [kind, setKind] = React.useState<"aplicacao" | "infraestrutura">("aplicacao");
  const [deptType, setDeptType] = React.useState<"departamento" | "colaborador">("departamento");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, FieldKey | "">>({});
  const [filename, setFilename] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [togglingBlock, setTogglingBlock] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const blockQuery = useQuery({
    queryKey: ["app-setting", "import_block"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "import_block")
        .maybeSingle();
      const v = (data?.value ?? {}) as { blocked?: boolean };
      return { blocked: !!v.blocked };
    },
  });
  const sheetsBlocked = !!blockQuery.data?.blocked;

  // Últimas importações (RLS: só admin/analista leem import_logs; os demais veem vazio)
  const historyQuery = useQuery({
    queryKey: ["import-logs", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_logs")
        .select(
          "id, module, filename, status, imported_count, ignored_count, total_count, message, created_by, created_at",
        )
        .neq("module", "upload-config")
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as Array<{
        id: string;
        module: string;
        filename: string | null;
        status: string;
        imported_count: number;
        ignored_count: number;
        total_count: number;
        message: string | null;
        created_by: string | null;
        created_at: string;
      }>;
    },
  });
  const historyUserIds = React.useMemo(
    () => [
      ...new Set((historyQuery.data ?? []).map((h) => h.created_by).filter(Boolean) as string[]),
    ],
    [historyQuery.data],
  );
  const { data: historyProfiles } = useQuery({
    queryKey: ["import-logs", "profiles", historyUserIds],
    enabled: historyUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", historyUserIds);
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });
  const historyNames = React.useMemo(
    () => new Map((historyProfiles ?? []).map((p) => [p.id, p.full_name || p.email || ""])),
    [historyProfiles],
  );

  const isColab = module === "departamentos" && deptType === "colaborador";
  const isDept = module === "departamentos" && deptType === "departamento";
  const isIa = module === "ranking-ia";
  const isWsus = module === "wsus";
  const isCmdb = module === "cmdb";
  const fieldList = isCmdb
    ? CMDB_FIELDS
    : isWsus
      ? WSUS_FIELDS
      : isIa
        ? IA_FIELDS
        : isColab
          ? COLAB_FIELDS
          : isDept
            ? DEPT_FIELDS
            : TARGET_FIELDS;
  const matcher = isCmdb
    ? autoMatchCmdb
    : isWsus
      ? autoMatchWsus
      : isIa
        ? autoMatchIa
        : isColab
          ? autoMatchColab
          : isDept
            ? autoMatchDept
            : autoMatch;

  const importableModules = React.useMemo(
    () =>
      MODULES.filter(
        (m) =>
          ["Monitoramento", "Compliance", "Operações"].includes(m.group) ||
          m.slug === "departamentos" ||
          m.slug === "cmdb",
      ),
    [],
  );
  const selectedModule = importableModules.find((m) => m.slug === module);
  const moduleSupported =
    module === "vulnerabilidades" ||
    module === "departamentos" ||
    module === "sophos-xdr" ||
    module === "ranking-ia" ||
    module === "wsus" ||
    module === "cmdb";

  async function toggleBlock(next: boolean) {
    if (!isAdmin) {
      toast.error("Apenas administradores podem alterar esta configuração.");
      return;
    }
    setTogglingBlock(true);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        {
          key: "import_block",
          value: {
            blocked: next,
            updated_by_email: user?.email ?? null,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;

      await supabase.from("import_logs").insert({
        module: "upload-config",
        filename: null,
        status: "success",
        imported_count: 0,
        ignored_count: 0,
        total_count: 0,
        message: `Bloqueio de importação de planilhas ${next ? "ATIVADO" : "DESATIVADO"} por ${user?.email ?? "admin"}`,
        created_by: user?.id ?? null,
      });

      toast.success(
        next ? "Importação de planilhas bloqueada" : "Importação de planilhas liberada",
      );
      qc.invalidateQueries({ queryKey: ["app-setting", "import_block"] });
      qc.invalidateQueries({ queryKey: ["import-logs"] });
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setTogglingBlock(false);
    }
  }

  const handleFile = async (file: File) => {
    setFilename(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (sheetsBlocked && ext !== "json") {
      toast.error(
        "Importação de planilhas está bloqueada pelo administrador. Apenas JSON é permitido.",
      );
      if (inputRef.current) inputRef.current.value = "";
      setFilename("");
      return;
    }
    let parsed: { headers: string[]; rows: Record<string, any>[] };
    try {
      if (ext === "json") {
        const text = await file.text();
        const data = JSON.parse(text);
        const arr: any[] = Array.isArray(data) ? data : (data.data ?? []);
        if (arr.length === 0) throw new Error("JSON vazio");
        // union of keys across all rows
        const keySet = new Set<string>();
        arr.forEach((r) => Object.keys(r ?? {}).forEach((k) => keySet.add(k)));
        parsed = { headers: Array.from(keySet), rows: arr };
      } else {
        // csv, xlsx, xls — read the FULL sheet, with all rows and all columns
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // header:1 returns rows as arrays — guarantees we capture every column
        // from the actual header row (row 0), even when later rows have blanks.
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, {
          header: 1,
          defval: null,
          blankrows: false,
          raw: true,
        });
        if (matrix.length < 2) throw new Error("Planilha vazia");
        const rawHeaders = (matrix[0] ?? []).map((h, i) =>
          h == null || String(h).trim() === "" ? `Coluna ${i + 1}` : String(h).trim(),
        );
        const dataRows = matrix.slice(1).map((row) => {
          const obj: Record<string, any> = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = row?.[i] ?? null;
          });
          return obj;
        });
        parsed = { headers: rawHeaders, rows: dataRows };
      }
    } catch (e: any) {
      toast.error(`Falha ao ler arquivo: ${e.message}`);
      return;
    }

    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const auto: Record<string, FieldKey | ""> = {};
    parsed.headers.forEach((h) => {
      auto[h] = matcher(h);
    });
    setMapping(auto);
    toast.success(`${parsed.rows.length} linhas carregadas`);
  };

  const logImport = async (payload: {
    status: "success" | "error" | "partial";
    imported: number;
    ignored: number;
    total: number;
    message?: string;
  }) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("import_logs").insert({
        module,
        filename: filename || null,
        status: payload.status,
        imported_count: payload.imported,
        ignored_count: payload.ignored,
        total_count: payload.total,
        message: payload.message ?? null,
        created_by: u.user?.id ?? null,
      });
    } catch {
      /* ignore log errors */
    }
  };

  const doImport = async () => {
    if (!module) {
      toast.error("Selecione o módulo de destino");
      return;
    }
    if (!moduleSupported) {
      toast.error(`Importação para "${selectedModule?.title}" ainda não está disponível`);
      return;
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    if (sheetsBlocked && ext && ext !== "json") {
      toast.error("Importação de planilhas está bloqueada. Apenas JSON é permitido.");
      return;
    }

    setImporting(true);
    try {
      if (module === "ranking-ia") {
        const whenCol = headers.find((h) => mapping[h] === "event_at");
        const userCol = headers.find((h) => mapping[h] === "user_name");
        const domainCol = headers.find((h) => mapping[h] === "domain");
        if (!whenCol || !userCol || !domainCol) {
          toast.error("Mapeie Data/Hora, Usuário e Domínio/URL.");
          setImporting(false);
          return;
        }
        const deviceCol = headers.find((h) => mapping[h] === "endpoint_name");
        const eventCol = headers.find((h) => mapping[h] === "raw_event");

        const { data: tenantRow } = await supabase
          .from("sophos_sync_state")
          .select("tenant_id")
          .limit(1)
          .maybeSingle();
        const tenantId = tenantRow?.tenant_id ?? "manual-upload";

        const hashStr = (s: string) => {
          let h = 5381;
          for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
          return "ia-" + (h >>> 0).toString(16);
        };
        const cleanUser = (raw: string) => raw.replace(/^[^\\]+\\/, "").trim();
        const extractDomain = (input: string): string | null => {
          const text = input.trim();
          if (!text) return null;
          let host: string | null = null;
          const m = text.match(/https?:\/\/([^\s/?#'"]+)/i);
          if (m) host = m[1];
          else if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) host = text;
          else {
            const m2 = text.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
            if (m2) host = m2[1];
          }
          if (!host) return null;
          host = host.toLowerCase().replace(/^www\./, "");
          const parts = host.split(".");
          if (parts.length <= 1) return parts[0] || null;
          const twoPart = /^(com|co|org|gov|edu)\.[a-z]{2}$/i;
          if (parts.length >= 3 && twoPart.test(parts.slice(-2).join("."))) {
            return parts[parts.length - 3];
          }
          return parts[parts.length - 2];
        };

        const records: Array<{
          id: string;
          tenant_id: string;
          event_at: string;
          user_name: string | null;
          endpoint_name: string | null;
          domain: string;
          raw_event: string | null;
          source_event_id: string | null;
        }> = [];
        let ignored = 0;
        const seen = new Set<string>();
        rows.forEach((r) => {
          const eventAt = parseDate(r[whenCol]);
          const userRaw = String(r[userCol] ?? "").trim();
          const domainRaw = String(r[domainCol] ?? "").trim();
          if (!eventAt || !userRaw || !domainRaw) {
            ignored++;
            return;
          }
          const domain = extractDomain(domainRaw);
          if (!domain) {
            ignored++;
            return;
          }
          const user = cleanUser(userRaw) || null;
          const device = deviceCol && r[deviceCol] ? String(r[deviceCol]).trim() : null;
          const rawEvent = eventCol && r[eventCol] ? String(r[eventCol]) : domainRaw;
          const id = hashStr([eventAt, user ?? "", device ?? "", domain, rawEvent].join("|"));
          if (seen.has(id)) {
            ignored++;
            return;
          }
          seen.add(id);
          records.push({
            id,
            tenant_id: tenantId,
            event_at: eventAt,
            user_name: user,
            endpoint_name: device,
            domain,
            raw_event: rawEvent,
            source_event_id: null,
          });
        });

        let inserted = 0;
        for (let i = 0; i < records.length; i += 500) {
          const chunk = records.slice(i, i + 500);
          const { error } = await supabase
            .from("ia_web_events")
            .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
          if (error) throw error;
          inserted += chunk.length;
        }

        toast.success(`${inserted} eventos de IA importados — ${ignored} ignorados`);
        await logImport({
          status: "success",
          imported: inserted,
          ignored,
          total: rows.length,
          message: `Ranking IA: ${inserted} novos, ${ignored} ignorados/duplicados`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["ia-ranking"] });
        return;
      }

      if (module === "wsus") {
        const nameCol = headers.find((h) => mapping[h] === "computer_name");
        if (!nameCol) {
          toast.error("Mapeie a coluna 'Computer Name'.");
          setImporting(false);
          return;
        }
        const neededCol = headers.find((h) => mapping[h] === "needed");
        const installedCol = headers.find((h) => mapping[h] === "installed_or_na");
        const failedCol = headers.find((h) => mapping[h] === "failed");
        const noStatusCol = headers.find((h) => mapping[h] === "no_status");
        const dateCol = headers.find((h) => mapping[h] === "report_date");

        const toInt = (v: any): number => {
          if (v == null || v === "") return 0;
          const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
          return Number.isFinite(n) ? n : 0;
        };

        const records: Array<{
          computer_name: string;
          needed: number;
          installed_or_na: number;
          failed: number;
          no_status: number;
          last_report_at: string | null;
          raw: Record<string, any>;
        }> = [];
        let ignored = 0;
        const seen = new Set<string>();
        rows.forEach((r) => {
          const name = String(r[nameCol] ?? "").trim();
          if (!name) {
            ignored++;
            return;
          }
          const key = name.toLowerCase();
          if (seen.has(key)) {
            ignored++;
            return;
          }
          seen.add(key);
          records.push({
            computer_name: name,
            needed: neededCol ? toInt(r[neededCol]) : 0,
            installed_or_na: installedCol ? toInt(r[installedCol]) : 0,
            failed: failedCol ? toInt(r[failedCol]) : 0,
            no_status: noStatusCol ? toInt(r[noStatusCol]) : 0,
            last_report_at: dateCol ? parseDate(r[dateCol]) : null,
            raw: r,
          });
        });

        // Resolve existing IDs by lowercase computer_name to upsert in place.
        // Note: computer_name has a case-insensitive unique index (lower(computer_name)),
        // but Postgres `IN` is case-sensitive — fetch all rows and match in JS instead,
        // otherwise a casing mismatch causes a duplicate-key error on insert.
        const { data: existing } = await (supabase as any)
          .from("wsus_servers")
          .select("id, computer_name");
        const idByName = new Map<string, string>();
        (existing ?? []).forEach((e: { id: string; computer_name: string }) => {
          idByName.set(e.computer_name.toLowerCase(), e.id);
        });

        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;

        const payload = records.map((r) => {
          const id = idByName.get(r.computer_name.toLowerCase()) ?? crypto.randomUUID();
          return { id, ...r, created_by: uid };
        });

        let inserted = 0;
        for (let i = 0; i < payload.length; i += 500) {
          const chunk = payload.slice(i, i + 500);
          const { error } = await (supabase as any)
            .from("wsus_servers")
            .upsert(chunk, { onConflict: "id" });
          if (error) throw error;
          inserted += chunk.length;
        }

        toast.success(`${inserted} servidores WSUS importados — ${ignored} ignorados`);
        await logImport({
          status: "success",
          imported: inserted,
          ignored,
          total: rows.length,
          message: `WSUS: ${inserted} servidores atualizados, ${ignored} ignorados/duplicados`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["wsus-overview"] });
        return;
      }

      if (module === "cmdb") {
        const nomeCol = headers.find((h) => mapping[h] === "cmdb_nome");
        const tipoCol = headers.find((h) => mapping[h] === "cmdb_tipo");
        if (!nomeCol || !tipoCol) {
          toast.error("Mapeie ao menos Nome e Tipo.");
          setImporting(false);
          return;
        }
        const ipCol = headers.find((h) => mapping[h] === "cmdb_ip");
        const critCol = headers.find((h) => mapping[h] === "cmdb_criticidade");
        const obsCol = headers.find((h) => mapping[h] === "cmdb_observacoes");

        const CRIT_MAP: Record<string, string> = {
          baixo: "Baixo",
          baixa: "Baixo",
          low: "Baixo",
          medio: "Médio",
          médio: "Médio",
          media: "Médio",
          média: "Médio",
          medium: "Médio",
          med: "Médio",
          alto: "Alto",
          alta: "Alto",
          high: "Alto",
          critico: "Crítico",
          crítico: "Crítico",
          critica: "Crítico",
          crítica: "Crítico",
          critical: "Crítico",
          crit: "Crítico",
        };
        const normCrit = (v: any): string => {
          const s = String(v ?? "")
            .trim()
            .toLowerCase();
          return CRIT_MAP[s] ?? "Médio";
        };

        const { data: existing } = await supabase.from("cmdb_ativos").select("id, nome");
        const idByName = new Map<string, string>();
        (existing ?? []).forEach((e: { id: string; nome: string }) => {
          idByName.set(e.nome.trim().toLowerCase(), e.id);
        });

        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;

        const toInsert: any[] = [];
        const toUpdate: any[] = [];
        let ignored = 0;
        const seen = new Set<string>();
        rows.forEach((r) => {
          const nome = String(r[nomeCol] ?? "").trim();
          const tipo = String(r[tipoCol] ?? "").trim();
          if (!nome || !tipo) {
            ignored++;
            return;
          }
          const k = nome.toLowerCase();
          if (seen.has(k)) {
            ignored++;
            return;
          }
          seen.add(k);
          const base = {
            nome,
            tipo,
            ip_hostname: ipCol && r[ipCol] ? String(r[ipCol]).trim() : null,
            criticidade: critCol && r[critCol] ? normCrit(r[critCol]) : "Médio",
            observacoes: obsCol && r[obsCol] ? String(r[obsCol]).trim() : null,
          };
          const existingId = idByName.get(k);
          if (existingId) {
            toUpdate.push({ id: existingId, ...base });
          } else {
            toInsert.push({ ...base, created_by: uid });
          }
        });

        let inserted = 0;
        if (toInsert.length > 0) {
          const { error } = await supabase.from("cmdb_ativos").insert(toInsert);
          if (error) throw error;
          inserted = toInsert.length;
        }
        let updated = 0;
        for (const u of toUpdate) {
          const { id, ...patch } = u;
          const { error } = await supabase.from("cmdb_ativos").update(patch).eq("id", id);
          if (error) throw error;
          updated++;
        }

        toast.success(`${inserted} ativos criados, ${updated} atualizados — ${ignored} ignorados`);
        await logImport({
          status: "success",
          imported: inserted + updated,
          ignored,
          total: rows.length,
          message: `CMDB: ${inserted} novos, ${updated} atualizados, ${ignored} ignorados`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["cmdb", "ativos"] });
        return;
      }

      if (module === "departamentos" && deptType === "colaborador") {
        const nameCol = headers.find((h) => mapping[h] === "display_name");
        const emailCol = headers.find((h) => mapping[h] === "email");
        if (!nameCol || !emailCol) {
          toast.error("Mapeie ao menos Display Name e E-mail.");
          setImporting(false);
          return;
        }
        const unidadeCol = headers.find((h) => mapping[h] === "unidade");
        const deptCol = headers.find((h) => mapping[h] === "department");
        const cargoCol = headers.find((h) => mapping[h] === "cargo");

        const deptByName = new Map((depts ?? []).map((d) => [d.name.toLowerCase(), d.id]));
        const { data: existing } = await supabase.from("colaboradores").select("email");
        const existingEmails = new Set((existing ?? []).map((c) => (c.email ?? "").toLowerCase()));

        const toInsert: Array<{
          display_name: string;
          email: string;
          unidade: string | null;
          department_id: string | null;
          cargo: string | null;
        }> = [];
        let ignored = 0;
        const seen = new Set<string>();
        rows.forEach((r) => {
          const nm = String(r[nameCol] ?? "").trim();
          const em = String(r[emailCol] ?? "")
            .trim()
            .toLowerCase();
          if (!nm || !em) {
            ignored++;
            return;
          }
          if (existingEmails.has(em) || seen.has(em)) {
            ignored++;
            return;
          }
          seen.add(em);
          const deptName = deptCol
            ? String(r[deptCol] ?? "")
                .trim()
                .toLowerCase()
            : "";
          toInsert.push({
            display_name: nm,
            email: em,
            unidade: unidadeCol && r[unidadeCol] ? String(r[unidadeCol]).trim() : null,
            department_id: deptName ? (deptByName.get(deptName) ?? null) : null,
            cargo: cargoCol && r[cargoCol] ? String(r[cargoCol]).trim() : null,
          });
        });

        let inserted = 0;
        if (toInsert.length > 0) {
          const { error } = await supabase.from("colaboradores").insert(toInsert);
          if (error) throw error;
          inserted = toInsert.length;
        }
        toast.success(`${inserted} colaboradores importados — ${ignored} ignorados`);
        await logImport({
          status: "success",
          imported: inserted,
          ignored,
          total: rows.length,
          message: `Colaboradores: ${inserted} novos, ${ignored} já existentes/inválidos`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["colaboradores"] });
        return;
      }

      if (module === "departamentos") {
        const nameCol = headers.find((h) => mapping[h] === "fqdn");
        if (!nameCol) {
          toast.error("Mapeie a coluna com o nome do departamento.");
          setImporting(false);
          return;
        }
        const descCol = headers.find((h) => mapping[h] === "system_app");

        const { data: existing } = await supabase.from("departments").select("name");
        const existingNames = new Set((existing ?? []).map((d) => d.name.toLowerCase()));

        const toInsert: Array<{ name: string; description: string | null }> = [];
        let emptySkipped = 0;
        let inFileDuplicates = 0;
        let dbDuplicates = 0;
        const seen = new Set<string>();
        rows.forEach((r) => {
          const nm = String(r[nameCol] ?? "").trim();
          if (!nm) {
            emptySkipped++;
            return;
          }
          const k = nm.toLowerCase();
          if (seen.has(k)) {
            inFileDuplicates++;
            return;
          }
          seen.add(k);
          if (existingNames.has(k)) {
            dbDuplicates++;
            return;
          }
          const desc = descCol ? (r[descCol] ? String(r[descCol]) : null) : null;
          toInsert.push({ name: nm, description: desc });
        });

        const ignored = emptySkipped + inFileDuplicates + dbDuplicates;

        if (toInsert.length === 0) {
          const reasons: string[] = [];
          if (dbDuplicates > 0) reasons.push(`${dbDuplicates} já existem no cadastro`);
          if (inFileDuplicates > 0) reasons.push(`${inFileDuplicates} duplicados no arquivo`);
          if (emptySkipped > 0) reasons.push(`${emptySkipped} sem nome`);
          toast.warning(`Nenhum departamento novo — ${reasons.join(", ")}.`);
          await logImport({
            status: "partial",
            imported: 0,
            ignored,
            total: rows.length,
            message: `Departamentos: 0 novos — ${reasons.join(", ")}`,
          });
          setImporting(false);
          return;
        }

        let inserted = 0;
        const { error } = await supabase.from("departments").insert(toInsert);
        if (error) throw error;
        inserted = toInsert.length;

        const successParts = [
          `${inserted} departamento${inserted !== 1 ? "s" : ""} importado${inserted !== 1 ? "s" : ""}`,
        ];
        if (dbDuplicates > 0) successParts.push(`${dbDuplicates} já existiam`);
        if (inFileDuplicates > 0)
          successParts.push(`${inFileDuplicates} duplicados no arquivo ignorados`);
        if (emptySkipped > 0) successParts.push(`${emptySkipped} sem nome ignorados`);
        toast.success(successParts.join(" — "));

        await logImport({
          status: "success",
          imported: inserted,
          ignored,
          total: rows.length,
          message: `Departamentos: ${inserted} novos, ${dbDuplicates} já existentes, ${inFileDuplicates} duplicados no arquivo, ${emptySkipped} inválidos`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["departments"] });
        qc.invalidateQueries({ queryKey: ["departments-admin"] });
        return;
      }

      if (module === "sophos-xdr") {
        const get = (r: Record<string, any>, key: FieldKey) => {
          const col = headers.find((h) => mapping[h] === key);
          return col ? r[col] : null;
        };
        const hostCol = headers.find((h) => mapping[h] === "fqdn");
        const sevCol = headers.find((h) => mapping[h] === "severity");
        if (!hostCol || !sevCol) {
          toast.error("Mapeie ao menos Host e Severidade");
          setImporting(false);
          return;
        }

        // Discover tenant_id from existing config or fallback to 'manual-upload'
        const { data: tenantRow } = await supabase
          .from("sophos_sync_state")
          .select("tenant_id")
          .limit(1)
          .maybeSingle();
        const tenantId = tenantRow?.tenant_id ?? "manual-upload";

        const hashStr = (s: string) => {
          let h = 5381;
          for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
          return "h" + (h >>> 0).toString(16);
        };

        const records = rows
          .map((r, rowIndex) => {
            const host = String(get(r, "fqdn") ?? "").trim();
            const sevRaw = String(get(r, "severity") ?? "")
              .toLowerCase()
              .trim();
            const sev = SEV_NORMALIZE[sevRaw] ?? sevRaw ?? null;
            const typ = get(r, "vuln_type") ? String(get(r, "vuln_type")) : null;
            const name = get(r, "system_app") ? String(get(r, "system_app")) : typ;
            const user = get(r, "responsible") ? String(get(r, "responsible")) : null;
            const src = get(r, "source") ? String(get(r, "source")) : "manual-upload";
            const eventAt = parseDate(get(r, "identified_at"));
            const extId = get(r, "external_id") ? String(get(r, "external_id")).trim() : "";
            // ID determinístico baseado no conteúdo completo da linha — assim apenas linhas
            // realmente idênticas são descartadas como duplicadas. Várias ocorrências que
            // compartilham o mesmo external_id (mas têm host/data/severidade diferentes)
            // são todas mantidas.
            const fingerprint = [
              extId,
              eventAt ?? "",
              host,
              typ ?? "",
              name ?? "",
              sev ?? "",
              user ?? "",
              src,
              JSON.stringify(r),
            ].join("|");
            const id = hashStr(fingerprint);
            return {
              id,
              tenant_id: tenantId,
              event_at: eventAt,
              severity: sev,
              type: typ,
              name,
              endpoint_id: null,
              endpoint_name: host || null,
              user_name: user,
              source: src,
              raw: extId ? { ...r, __external_id: extId } : r,
            };
          })
          .filter((r) => r.endpoint_name);

        // Dedup by id within file
        const seen = new Set<string>();
        const uniq = records.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        for (let i = 0; i < uniq.length; i += 500) {
          const chunk = uniq.slice(i, i + 500);
          const { error } = await supabase
            .from("sophos_events")
            .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
          if (error) throw error;
        }

        const inserted = uniq.length;
        const ignored = Math.max(0, rows.length - inserted);

        toast.success(`${inserted} eventos importados — ${ignored} duplicados/atualizados`);
        await logImport({
          status: "success",
          imported: inserted,
          ignored,
          total: rows.length,
          message: `Sophos XDR: ${inserted} novos, ${ignored} duplicados/atualizados`,
        });
        setRows([]);
        setHeaders([]);
        setMapping({});
        setFilename("");
        qc.invalidateQueries({ queryKey: ["sophos-overview"] });
        return;
      }

      // Vulnerabilidades (default)
      const fqdnCol = headers.find((h) => mapping[h] === "fqdn");
      const sevCol = headers.find((h) => mapping[h] === "severity");
      if (!fqdnCol || !sevCol) {
        toast.error("Mapeie ao menos FQDN e Severidade");
        setImporting(false);
        return;
      }

      const deptByName = new Map<string, string>();
      depts?.forEach((d) => deptByName.set(d.name.toLowerCase(), d.id));

      const records = rows
        .map((r) => {
          const get = (key: FieldKey) => {
            const col = headers.find((h) => mapping[h] === key);
            return col ? r[col] : null;
          };
          const sevRaw = String(get("severity") ?? "")
            .toLowerCase()
            .trim();
          const statusRaw = String(get("status") ?? "")
            .toLowerCase()
            .trim();
          const deptRaw = String(get("department") ?? "")
            .toLowerCase()
            .trim();
          const extIdRaw = firstNonEmptyDedupValue([
            get("external_id"),
            r?.["Chave do item (JIRA)"],
            r?.["Chave"],
            r?.["Key"],
            r?.["Issue Key"],
          ]);
          return {
            fqdn: String(get("fqdn") ?? "").trim(),
            severity: (SEV_NORMALIZE[sevRaw] ?? "Média") as "Crítica" | "Alta" | "Média" | "Baixa",
            status: (STATUS_NORMALIZE[statusRaw] ?? "Aberta") as
              | "Aberta"
              | "Em tratamento"
              | "Mitigada"
              | "Fechada",
            responsible: get("responsible") ? String(get("responsible")) : null,
            identified_at: parseDate(get("identified_at")),
            source: get("source") ? String(get("source")) : null,
            vuln_type: get("vuln_type") ? String(get("vuln_type")) : null,
            system_app: get("system_app") ? String(get("system_app")) : null,
            external_id: extIdRaw || null,
            department_id: deptRaw ? (deptByName.get(deptRaw) ?? null) : null,
            kind,
            raw: r,
          };
        })
        .filter((r) => r.fqdn);

      const table =
        kind === "infraestrutura" ? "vulnerabilities_infra" : "vulnerabilities_aplicacao";

      // Resolve status_changed_at: prefer "Atualizado" (scanner date) → identified_at → now
      const resolveStatusChangedAt = (r: (typeof records)[number]): string => {
        const raw = r.raw ?? null;
        const updatedRaw =
          raw?.["Atualizado"] ??
          raw?.["Updated"] ??
          raw?.["Data de Atualização"] ??
          raw?.["Data Atualização"];
        const parsed = updatedRaw ? parseDate(updatedRaw) : null;
        if (parsed) return new Date(parsed).toISOString();
        if (r.identified_at) return new Date(r.identified_at).toISOString();
        return new Date().toISOString();
      };

      if (kind === "infraestrutura") {
        // Upsert por identidade (fqdn + vuln_type + Porta, ver migrations 20260812140000+):
        // achado que persiste mês a mês (Situação = Maintained) atualiza a mesma linha em vez
        // de inserir uma nova — o banco não cresce sem limite pra achados que só continuam
        // abertos. A distinção New/Maintained/Fix continua vindo de raw["Situação"].
        let processed = 0;
        const recordsWithScanDate = records.map((r) => ({
          ...r,
          status_changed_at: resolveStatusChangedAt(r),
        }));
        for (let i = 0; i < recordsWithScanDate.length; i += 500) {
          const chunk = recordsWithScanDate.slice(i, i + 500);
          const { error } = await (supabase as any).rpc("upsert_vuln_infra", { p_rows: chunk });
          if (error) throw error;
          processed += chunk.length;
        }
        // Fecha achados que estavam abertos nos hosts deste import mas não vieram nesta
        // rodada — versão simples combinada com o usuário pra bater com o total mensal do
        // gráfico de referência (Sek); reabre automaticamente (reopened_at) se reaparecer
        // depois. Passa o lote inteiro (não por página) pra RPC enxergar todos os hosts e
        // chaves vistos neste import de uma vez.
        if (recordsWithScanDate.length > 0) {
          const { error: closeError } = await (supabase as any).rpc("close_missing_infra_vulns", {
            p_rows: recordsWithScanDate,
            p_reference_at: recordsWithScanDate[0].status_changed_at,
          });
          if (closeError) throw closeError;
        }
        toast.success(`${processed} vulnerabilidades de infra processadas (novas + atualizadas)`);
        await logImport({
          status: "success",
          imported: processed,
          ignored: 0,
          total: rows.length,
          message: `Vulnerabilidades (infraestrutura): ${processed} processadas`,
        });
      } else {
        // Aplicacao: two-phase import — load existing by identity key, then update or insert
        const allFqdns = [...new Set(records.map((r) => r.fqdn))];
        const existingByIdentity = new Map<string, string>(); // identityKey → id
        {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data } = await (supabase as any)
              .from(table)
              .select("id, fqdn, external_id, vuln_type, system_app")
              .in("fqdn", allFqdns)
              .range(from, from + PAGE - 1);
            for (const v of data ?? []) {
              const key = buildVulnIdentityKey(
                v.fqdn,
                v.vuln_type,
                v.system_app,
                null,
                v.external_id,
              );
              if (!existingByIdentity.has(key)) existingByIdentity.set(key, v.id);
            }
            if ((data ?? []).length < PAGE) break;
            from += PAGE;
          }
        }

        const toUpdate: Array<{ id: string; status: string; status_changed_at: string }> = [];
        const toInsert: typeof records = [];
        for (const record of records) {
          const identityKey = buildVulnIdentityKey(
            record.fqdn,
            record.vuln_type,
            record.system_app,
            record.raw ?? null,
            record.external_id,
          );
          const existingId = existingByIdentity.get(identityKey);
          if (existingId) {
            toUpdate.push({
              id: existingId,
              status: record.status,
              status_changed_at: resolveStatusChangedAt(record),
            });
          } else {
            toInsert.push(record);
          }
        }

        let updated = 0;
        if (toUpdate.length > 0) {
          const { error } = await (supabase as any).rpc("bulk_update_vuln_status", {
            p_table: table,
            p_updates: toUpdate,
          });
          if (error) throw error;
          updated = toUpdate.length;
        }

        // Insert new vulnerabilities — plain insert; content_hash unique constraint was
        // dropped in migration 20260610150000.
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += 500) {
          const chunk = toInsert.slice(i, i + 500).map((r) => ({
            ...r,
            status_changed_at: resolveStatusChangedAt(r),
          }));
          const { error } = await (supabase as any).from(table).insert(chunk);
          if (error) throw error;
          inserted += chunk.length;
        }

        const ignored = Math.max(0, rows.length - updated - inserted);
        toast.success(`${inserted} novas · ${updated} atualizadas · ${ignored} ignoradas`);
        await logImport({
          status: "success",
          imported: inserted + updated,
          ignored,
          total: rows.length,
          message: `Vulnerabilidades (aplicacao): ${inserted} novas, ${updated} atualizadas, ${ignored} duplicadas`,
        });
      }

      setRows([]);
      setHeaders([]);
      setMapping({});
      setFilename("");
      qc.invalidateQueries({ queryKey: ["vulns"] });
    } catch (e: any) {
      toast.error(`Erro na importação: ${e.message}`);
      await logImport({
        status: "error",
        imported: 0,
        ignored: 0,
        total: rows.length,
        message: e.message,
      });
    } finally {
      setImporting(false);
      qc.invalidateQueries({ queryKey: ["import-logs"] });
    }
  };

  // ── Visual ───────────────────────────────────────────────────────────────
  const supportedModules = importableModules.filter((m) =>
    ["vulnerabilidades", "departamentos", "sophos-xdr", "ranking-ia", "wsus", "cmdb"].includes(
      m.slug,
    ),
  );
  const MODULE_HINT: Record<string, string> = {
    "sophos-xdr":
      "Mapeie ao menos Host (FQDN) e Severidade. Eventos com o mesmo ID externo (ou mesma combinação host + data + tipo) são atualizados em vez de duplicados.",
    "ranking-ia":
      "Mapeie Data/Hora, Usuário e Domínio/URL. O domínio é extraído da URL (ex.: https://chatgpt.com/... → chatgpt) e o prefixo de domínio do usuário (ex.: EMPRESA\\) é removido.",
    wsus: "Mapeie ao menos Computer Name. Servidores que já existem (mesmo nome) são atualizados com os números novos; os demais são criados.",
    cmdb: "Mapeie ao menos Nome e Tipo. Ativos com o mesmo nome são atualizados; linhas sem nome ou tipo são ignoradas.",
    vulnerabilidades:
      "Mapeie ao menos FQDN/Host e Severidade. Vulnerabilidades que já existem têm o status atualizado em vez de duplicar.",
  };
  const hint =
    module === "departamentos"
      ? deptType === "departamento"
        ? "Mapeie a coluna com o nome do departamento (obrigatório) e, opcionalmente, a descrição. Departamentos já existentes (mesmo nome) são ignorados."
        : "Mapeie ao menos Display Name e E-mail. Opcionalmente Unidade, Departamento (pelo nome) e Cargo. Colaboradores com e-mail já cadastrado são ignorados."
      : (MODULE_HINT[module] ?? "");
  const resetFile = () => {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFilename("");
    if (inputRef.current) inputRef.current.value = "";
  };
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  const requiredFields = (
    fieldList as ReadonlyArray<{ key: string; label: string; required: boolean }>
  ).filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => !mappedKeys.has(f.key as FieldKey));
  const autoCount = headers.filter((h) => mapping[h] && mapping[h] === matcher(h)).length;
  const previewCols = (fieldList as ReadonlyArray<{ key: string; label: string }>)
    .map((f) => ({ f, header: headers.find((h) => mapping[h] === f.key) }))
    .filter((x): x is { f: { key: string; label: string }; header: string } => !!x.header);
  const step1Done = !!module && moduleSupported;
  const step2Done = headers.length > 0;
  const cleanLabel = (l: string) => l.replace(/\s*\*$/, "");

  return (
    <div className="up-root">
      <style dangerouslySetInnerHTML={{ __html: UP_CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="up-ph">
        <div>
          <h1 className="up-ph-title">Importar dados</h1>
          <p className="up-ph-sub">
            Carregue planilhas ou JSON nos módulos do {APP_NAME}, com mapeamento de colunas
          </p>
        </div>
        <div
          className="up-block"
          style={
            { "--c": sheetsBlocked ? "var(--v2-crit)" : "var(--v2-ok)" } as React.CSSProperties
          }
        >
          <span className="ic">{sheetsBlocked ? <Lock size={18} /> : <Unlock size={18} />}</span>
          <div>
            <b>{sheetsBlocked ? "Planilhas bloqueadas" : "Planilhas liberadas"}</b>
            <small>
              {sheetsBlocked ? "só JSON pode ser importado" : "CSV, Excel e JSON aceitos"}
            </small>
          </div>
          <Switch
            checked={sheetsBlocked}
            onCheckedChange={toggleBlock}
            disabled={!isAdmin || togglingBlock || blockQuery.isLoading}
            aria-label="Bloquear importação de planilhas"
            title={
              isAdmin ? "JSON continua sempre liberado" : "Apenas administradores podem alterar"
            }
          />
        </div>
      </div>

      <div className="up-grid">
        <div className="up-steps">
          {/* 1. Destino */}
          <section className={`up-step ${step1Done ? "done" : "cur"}`}>
            <div className="up-step-h">
              <span className="n">{step1Done ? <Check size={14} /> : 1}</span>
              <div>
                <b>Destino</b>
                <small>Em qual módulo os dados vão entrar</small>
              </div>
              {selectedModule && <span className="sum">{selectedModule.title}</span>}
            </div>
            <div className="up-step-b">
              {(["Monitoramento", "Compliance", "Operações", "Cadastros"] as const).map((g) => {
                const items = supportedModules.filter((m) => m.group === g);
                if (!items.length) return null;
                return (
                  <React.Fragment key={g}>
                    <div className="up-grp-t">{g}</div>
                    <div className="up-mods">
                      {items.map((m) => {
                        const Icon = m.icon;
                        return (
                          <button
                            key={m.slug}
                            type="button"
                            className="up-mod"
                            aria-pressed={module === m.slug}
                            onClick={() => {
                              setModule(m.slug);
                              resetFile();
                            }}
                          >
                            <span className="ic">
                              <Icon size={16} />
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <b>{m.title}</b>
                              <small>{MODULE_DESC[m.slug] ?? ""}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}
              {module === "vulnerabilidades" && (
                <div className="up-seg" role="group" aria-label="Tipo de vulnerabilidade">
                  {(["aplicacao", "infraestrutura"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                    >
                      {k === "aplicacao" ? "Aplicação (FQDN/URL)" : "Internas (IP/Host)"}
                    </button>
                  ))}
                </div>
              )}
              {module === "departamentos" && (
                <div className="up-seg" role="group" aria-label="Tipo de cadastro">
                  {(["departamento", "colaborador"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={deptType === t}
                      onClick={() => {
                        setDeptType(t);
                        resetFile();
                      }}
                    >
                      {t === "departamento" ? "Departamentos" : "Colaboradores"}
                    </button>
                  ))}
                </div>
              )}
              {hint && <div className="up-hint">{hint}</div>}
            </div>
          </section>

          {/* 2. Arquivo */}
          <section className={`up-step ${!step1Done ? "off" : step2Done ? "done" : "cur"}`}>
            <div className="up-step-h">
              <span className="n">{step2Done ? <Check size={14} /> : 2}</span>
              <div>
                <b>Arquivo</b>
                <small>
                  {sheetsBlocked
                    ? "Apenas JSON (planilhas bloqueadas pelo administrador)"
                    : "CSV, Excel (.xlsx, .xls) ou JSON"}
                </small>
              </div>
              {filename && step2Done && <span className="sum">{filename}</span>}
            </div>
            {step1Done && (
              <div className="up-step-b">
                <input
                  ref={inputRef}
                  type="file"
                  accept={sheetsBlocked ? ".json" : ".csv,.xlsx,.xls,.json"}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {!canImport ? (
                  <div className="up-hint" style={{ color: "var(--v2-crit)" }}>
                    Você não tem permissão para importar dados. Solicite acesso ao administrador.
                  </div>
                ) : step2Done ? (
                  <div className="up-file">
                    <span className="th">
                      <FileText size={17} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{filename}</b>
                      <small>
                        {rows.length} linhas · {headers.length} colunas
                      </small>
                    </span>
                    <button
                      type="button"
                      className="up-btn sm"
                      onClick={() => inputRef.current?.click()}
                    >
                      Trocar arquivo
                    </button>
                  </div>
                ) : (
                  <div
                    className="up-drop"
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                  >
                    <Upload size={24} />
                    <b>Arraste o arquivo ou clique para escolher</b>
                    <small>
                      As colunas são reconhecidas automaticamente e você ajusta antes de importar
                    </small>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. Mapeamento */}
          <section className={`up-step ${step2Done ? "cur" : "off"}`}>
            <div className="up-step-h">
              <span className="n">3</span>
              <div>
                <b>Mapeamento de colunas</b>
                <small>Coluna do arquivo → campo do {selectedModule?.title ?? "módulo"}</small>
              </div>
              {step2Done && (
                <span className="sum">
                  {mappedKeys.size} de {headers.length} colunas usadas
                </span>
              )}
            </div>
            {step2Done && (
              <div className="up-step-b">
                <div className="up-reqs">
                  {requiredFields.map((f) => {
                    const ok = mappedKeys.has(f.key as FieldKey);
                    return (
                      <span
                        key={f.key}
                        className="up-req"
                        style={
                          { "--c": ok ? "var(--v2-ok)" : "var(--v2-crit)" } as React.CSSProperties
                        }
                      >
                        {ok ? <Check size={12} /> : <AlertTriangle size={12} />}{" "}
                        {cleanLabel(f.label)} (obrigatório)
                      </span>
                    );
                  })}
                  {autoCount > 0 && (
                    <span
                      className="up-req"
                      style={{ "--c": "var(--v2-accent)" } as React.CSSProperties}
                    >
                      {autoCount} reconhecida{autoCount > 1 ? "s" : ""} automaticamente
                    </span>
                  )}
                </div>
                <div className="up-map">
                  {headers.map((h) => (
                    <div key={h} className="up-map-r">
                      <div style={{ minWidth: 0 }}>
                        <b title={h}>{h}</b>
                        <small>ex.: {String(rows[0]?.[h] ?? "—").slice(0, 40)}</small>
                      </div>
                      <ChevronRight size={14} className="arr" />
                      <select
                        className={`up-select${mapping[h] && mapping[h] === matcher(h) ? " auto" : ""}`}
                        aria-label={`Campo para a coluna ${h}`}
                        value={mapping[h] || ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey | "" }))
                        }
                      >
                        <option value="">— Ignorar —</option>
                        {fieldList.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {previewCols.length > 0 && (
                  <div>
                    <div className="up-grp-t" style={{ marginBottom: 8 }}>
                      Prévia das primeiras linhas, já com os campos do {APP_NAME}
                    </div>
                    <div className="up-prev">
                      <table>
                        <thead>
                          <tr>
                            {previewCols.map((c) => (
                              <th key={c.f.key}>{cleanLabel(c.f.label)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 5).map((r, i) => (
                            <tr key={i}>
                              {previewCols.map((c) => (
                                <td key={c.f.key}>{String(r[c.header] ?? "—").slice(0, 60)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="up-foot-act">
                  <button
                    className="up-btn primary"
                    onClick={doImport}
                    disabled={importing || !canImport || missingRequired.length > 0}
                  >
                    {importing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {importing ? "Importando…" : `Importar ${rows.length} registros`}
                  </button>
                  {missingRequired.length > 0 ? (
                    <span style={{ fontSize: 12.5, color: "var(--v2-crit)" }}>
                      Mapeie {missingRequired.map((f) => cleanLabel(f.label)).join(", ")} para
                      continuar
                    </span>
                  ) : (
                    <span style={{ fontSize: 12.5, color: "var(--v2-fg-3)" }}>
                      O resultado aparece em Últimas importações e em Logs
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Histórico ── */}
        <div className="up-panel">
          <div className="up-panel-hdr">
            <h2 className="up-panel-title">Últimas importações</h2>
            <p className="up-panel-sub">Visível para administradores e analistas</p>
          </div>
          <div className="up-panel-body">
            {(historyQuery.data ?? []).length === 0 ? (
              <div className="up-empty">
                {historyQuery.isLoading ? "Carregando…" : "Nenhuma importação registrada."}
              </div>
            ) : (
              <div className="up-hist">
                {(historyQuery.data ?? []).map((h) => {
                  const st =
                    h.status === "success"
                      ? ["Concluída", "var(--v2-ok)"]
                      : h.status === "partial"
                        ? ["Parcial", "var(--v2-med)"]
                        : ["Falhou", "var(--v2-crit)"];
                  return (
                    <div key={h.id}>
                      <b>
                        {MODULES.find((m) => m.slug === h.module)?.title ?? h.module}
                        {h.filename && <span className="up-mono"> · {h.filename}</span>}
                      </b>
                      <span className="up-st" style={{ "--c": st[1] } as React.CSSProperties}>
                        {st[0]}
                      </span>
                      <small>
                        {h.status === "error"
                          ? (h.message ?? "Erro")
                          : `${h.imported_count} importados · ${h.ignored_count} ignorados de ${h.total_count}`}
                      </small>
                      <small>
                        {new Date(h.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {h.created_by && historyNames.get(h.created_by)
                          ? ` · ${historyNames.get(h.created_by)}`
                          : ""}
                      </small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MODULE_DESC: Record<string, string> = {
  vulnerabilidades: "aplicação ou infraestrutura",
  "sophos-xdr": "eventos e detecções",
  "ranking-ia": "acessos a ferramentas de IA",
  wsus: "atualizações por servidor",
  cmdb: "ativos de infraestrutura",
  departamentos: "departamentos ou colaboradores",
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const UP_CSS = `
  .up-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .up-root * { box-sizing:border-box; }
  .up-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .up-mono { font-family:var(--font-data); font-size:12.5px; font-weight:400; }
  .up-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .up-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .up-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .up-block { display:inline-flex; align-items:center; gap:10px; padding:8px 12px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface); font-size:13px; }
  .up-block .ic { display:grid; color:var(--c); }
  .up-block b { font-weight:500; display:block; }
  .up-block small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .up-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .up-steps { grid-column:span 2; display:grid; gap:14px; min-width:0; }
  @media (max-width: 1100px) { .up-grid { grid-template-columns:minmax(0, 1fr); } .up-steps { grid-column:auto; } }
  .up-step { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .up-step.off { opacity:.55; }
  .up-step-h { display:flex; align-items:center; gap:12px; padding:14px 18px; }
  .up-step-h .n { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font:600 12.5px var(--font-data); background:var(--v2-surface-2); color:var(--v2-fg-2); border:1px solid var(--v2-line); flex:none; }
  .up-step.done .up-step-h .n { background:var(--v2-ok); color:#fff; border-color:var(--v2-ok); }
  .up-step.cur .up-step-h .n { background:var(--v2-accent); color:var(--v2-accent-ink); border-color:var(--v2-accent); }
  .up-step-h b { font-size:14px; font-weight:600; display:block; }
  .up-step-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .up-step-h .sum { margin-left:auto; font-size:12.5px; color:var(--v2-fg-2); text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%; }
  .up-step-b { padding:0 18px 18px 56px; display:grid; gap:12px; }
  @media (max-width: 640px) { .up-step-b { padding-left:18px; } }
  .up-grp-t { font-size:12px; font-weight:500; color:var(--v2-fg-3); }
  .up-mods { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:8px; }
  .up-mod { display:grid; grid-template-columns:32px minmax(0, 1fr); gap:10px; align-items:center; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .up-mod:hover { border-color:var(--v2-line-strong); background:var(--v2-hover); }
  .up-mod[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .up-mod .ic { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; background:var(--v2-surface-2); color:var(--v2-fg-2); }
  .up-mod[aria-pressed="true"] .ic { background:var(--v2-accent); color:var(--v2-accent-ink); }
  .up-mod b { font-weight:500; display:block; }
  .up-mod small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .up-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; justify-self:start; }
  .up-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .up-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .up-hint { font-size:12.5px; line-height:1.55; color:var(--v2-fg-2); padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); }
  .up-drop { display:grid; place-items:center; gap:6px; padding:26px 16px; border:1.5px dashed var(--v2-line-strong); border-radius:12px; background:var(--v2-surface-2); color:var(--v2-fg-2); font-size:13px; text-align:center; cursor:pointer; }
  .up-drop:hover { border-color:var(--v2-accent); }
  .up-drop b { color:var(--v2-fg); }
  .up-drop small { font-size:12px; color:var(--v2-fg-3); }
  .up-file { display:grid; grid-template-columns:36px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; }
  .up-file .th { width:36px; height:36px; border-radius:8px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .up-file b { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .up-file small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .up-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .up-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .up-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .up-btn.sm { height:30px; padding:0 10px; }
  .up-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .up-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .up-reqs { display:flex; flex-wrap:wrap; gap:6px; }
  .up-req { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border-radius:99px; font-size:12px; font-weight:500; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 75%, var(--v2-fg)); }
  .up-req svg { color:var(--c); }
  .up-map { display:grid; }
  .up-map-r { display:grid; grid-template-columns:minmax(0, 1fr) 20px minmax(0, 1fr); gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid var(--v2-line); }
  .up-map-r:last-child { border-bottom:0; }
  .up-map-r b { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .up-map-r small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .up-map-r .arr { color:var(--v2-fg-3); }
  .up-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:13px var(--font-ui); padding:0 10px; width:100%; }
  .up-select.auto { border-color:color-mix(in oklch, var(--v2-ok) 50%, transparent); }
  .up-prev { overflow:auto; border:1px solid var(--v2-line); border-radius:8px; max-height:240px; }
  .up-prev table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .up-prev th { position:sticky; top:0; padding:8px 12px; font-size:11.5px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .up-prev td { padding:7px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .up-prev tr:last-child td { border-bottom:0; }
  .up-foot-act { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .up-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .up-panel-hdr { padding:14px 18px 4px; }
  .up-panel-title { font-size:14px; font-weight:600; margin:0; }
  .up-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .up-panel-body { padding:8px 18px 14px; max-height:640px; overflow-y:auto; }
  .up-empty { padding:24px 0; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .up-hist > div { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 10px; padding:10px 0; border-bottom:1px solid var(--v2-line); }
  .up-hist > div:last-child { border-bottom:0; }
  .up-hist b { font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .up-hist small { grid-column:1 / -1; font-size:12px; color:var(--v2-fg-3); }
  .up-st { display:inline-flex; align-items:center; gap:6px; height:20px; padding:0 7px; border-radius:5px; font-size:11.5px; font-weight:500; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .up-st::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
`;
