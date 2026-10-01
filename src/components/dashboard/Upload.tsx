import * as React from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDepartments } from "@/lib/use-departments";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { MODULES } from "@/lib/modules";
import { Panel } from "./primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, Lock, Unlock } from "lucide-react";

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
  if (/(data|date|time|when|identif|detect|criad|criada|created|opened|aberto|raised)/.test(h)) return "identified_at";
  if (/(origem|source|scanner|tool|product|produto)/.test(h)) return "source";
  if (/(categor|tipo|type|event|evento|threat|name)/.test(h)) return "vuln_type";
  if (/(descri|description|sistema|app|aplica|system|message|mensagem)/.test(h)) return "system_app";
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
  const summary = firstNonEmptyDedupValue([record.raw?.["Resumo"], record.vuln_type, record.raw?.["Descrição"]]);
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
      const { data } = await supabase.from("app_settings").select("value").eq("key", "import_block").maybeSingle();
      const v = (data?.value ?? {}) as { blocked?: boolean };
      return { blocked: !!v.blocked };
    },
  });
  const sheetsBlocked = !!blockQuery.data?.blocked;

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

      toast.success(next ? "Importação de planilhas bloqueada" : "Importação de planilhas liberada");
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
      toast.error("Importação de planilhas está bloqueada pelo administrador. Apenas JSON é permitido.");
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

        const { data: tenantRow } = await supabase.from("sophos_sync_state").select("tenant_id").limit(1).maybeSingle();
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
        const { data: existing } = await (supabase as any).from("wsus_servers").select("id, computer_name");
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
          const { error } = await (supabase as any).from("wsus_servers").upsert(chunk, { onConflict: "id" });
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
        if (inFileDuplicates > 0) successParts.push(`${inFileDuplicates} duplicados no arquivo ignorados`);
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
        const { data: tenantRow } = await supabase.from("sophos_sync_state").select("tenant_id").limit(1).maybeSingle();
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
            status: (STATUS_NORMALIZE[statusRaw] ?? "Aberta") as "Aberta" | "Em tratamento" | "Mitigada" | "Fechada",
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

      const table = kind === "infraestrutura" ? "vulnerabilities_infra" : "vulnerabilities_aplicacao";

      // Resolve status_changed_at: prefer "Atualizado" (scanner date) → identified_at → now
      const resolveStatusChangedAt = (r: (typeof records)[number]): string => {
        const raw = r.raw ?? null;
        const updatedRaw =
          raw?.["Atualizado"] ?? raw?.["Updated"] ?? raw?.["Data de Atualização"] ?? raw?.["Data Atualização"];
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
        const recordsWithScanDate = records.map((r) => ({ ...r, status_changed_at: resolveStatusChangedAt(r) }));
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
              const key = buildVulnIdentityKey(v.fqdn, v.vuln_type, v.system_app, null, v.external_id);
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
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            {sheetsBlocked ? <Lock className="size-4 text-destructive" /> : <Unlock className="size-4 text-success" />}
            Bloqueio de importação
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Bloquear importação de planilhas (XLS, XLSX, CSV)</div>
            <div className="text-xs text-muted-foreground">
              {sheetsBlocked
                ? "Planilhas estão BLOQUEADAS. Somente arquivos JSON podem ser importados."
                : "Planilhas estão LIBERADAS. Todos os formatos podem ser importados."}{" "}
              Importações via JSON sempre permanecem ativas.
              {!isAdmin && " Apenas administradores podem alterar esta configuração."}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold ${sheetsBlocked ? "text-destructive" : "text-success"}`}>
              {sheetsBlocked ? "Bloqueado" : "Liberado"}
            </span>
            <Switch
              checked={sheetsBlocked}
              onCheckedChange={toggleBlock}
              disabled={!isAdmin || togglingBlock || blockQuery.isLoading}
            />
          </div>
        </div>
      </Panel>

      <Panel title="1. Selecione o módulo de destino">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Os dados importados serão vinculados ao módulo escolhido. O mapeamento de colunas é ajustado conforme a
            estrutura de dados de cada módulo.
          </p>
          <Select
            value={module}
            onValueChange={(v) => {
              setModule(v);
              setHeaders([]);
              setRows([]);
              setMapping({});
              setFilename("");
            }}
          >
            <SelectTrigger className="h-10 max-w-md">
              <SelectValue placeholder="Selecione um módulo..." />
            </SelectTrigger>
            <SelectContent>
              {(["Monitoramento", "Compliance", "Operações", "Cadastros"] as const).map((g) => {
                const items = importableModules.filter((m) => m.group === g);
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={g}>
                    <div className="text-mono-xs text-muted-foreground px-2 py-1.5 font-semibold">{g}</div>
                    {items.map((m) => (
                      <SelectItem key={m.slug} value={m.slug}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                );
              })}
            </SelectContent>
          </Select>
          {selectedModule && !moduleSupported && (
            <p className="text-xs text-amber-500">
              O módulo "{selectedModule.title}" ainda não possui estrutura de ingestão configurada.
            </p>
          )}
          {module === "sophos-xdr" && (
            <p className="text-xs text-muted-foreground">
              Mapeie ao menos <strong>Host (FQDN)</strong> e <strong>Severidade</strong>. Opcionalmente{" "}
              <strong>Tipo/Evento</strong>, <strong>Descrição</strong>, <strong>Data</strong> e
              <strong> ID externo</strong>. Eventos com o mesmo ID externo (ou mesma combinação host+data+tipo) são
              atualizados em vez de duplicados.
            </p>
          )}
          {module === "ranking-ia" && (
            <p className="text-xs text-muted-foreground">
              Mapeie <strong>Data/Hora</strong>, <strong>Usuário</strong> e <strong>Domínio/URL</strong>. Opcionalmente{" "}
              <strong>Dispositivo</strong> e <strong>Evento</strong>. O domínio é extraído automaticamente (ex:{" "}
              <code>https://chatgpt.com/...</code> → <code>chatgpt</code>) e o prefixo de domínio do usuário (ex:{" "}
              <code>BERNOULLI\</code>) é removido.
            </p>
          )}
          {module === "departamentos" && (
            <div className="pt-2 border-t border-border space-y-2">
              <div className="text-xs text-muted-foreground">Tipo de cadastro</div>
              <div className="flex gap-2">
                {(["departamento", "colaborador"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setDeptType(t);
                      setHeaders([]);
                      setRows([]);
                      setMapping({});
                      setFilename("");
                    }}
                    className={`px-3 py-1.5 rounded border text-xs ${
                      deptType === t
                        ? "bg-primary/15 border-primary text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "departamento" ? "Departamento" : "Colaborador"}
                  </button>
                ))}
              </div>
              {deptType === "departamento" ? (
                <p className="text-xs text-muted-foreground">
                  Mapeie a coluna com o <strong>nome do departamento</strong> (obrigatório) e, opcionalmente, a
                  <strong> descrição</strong>. Departamentos já existentes (mesmo nome) serão ignorados.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Mapeie ao menos <strong>Display Name</strong> e <strong>E-mail</strong>. Opcionalmente
                  <strong> Unidade</strong>, <strong>Departamento</strong> (pelo nome, vinculado à tabela) e{" "}
                  <strong>Cargo</strong>. Colaboradores com e-mail já cadastrado são ignorados.
                </p>
              )}
            </div>
          )}

          {module === "vulnerabilidades" && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Tipo de vulnerabilidade</div>
              <div className="flex gap-2">
                {(["aplicacao", "infraestrutura"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-3 py-1.5 rounded border text-xs ${
                      kind === k
                        ? "bg-primary/15 border-primary text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k === "aplicacao" ? "Aplicação (FQDN/URL)" : "Internas (IP/Host)"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="2. Selecione o arquivo">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Formatos aceitos: <strong>CSV, Excel (.xlsx, .xls), JSON</strong>. As colunas serão mapeadas automaticamente
            — você pode ajustar antes de importar.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {!canImport && (
            <p className="text-xs text-destructive">
              Você não tem permissão para importar dados. Solicite acesso ao administrador.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => inputRef.current?.click()}
              variant="outline"
              disabled={!canImport || !module || !moduleSupported}
            >
              <Upload className="size-4" /> Selecionar arquivo
            </Button>
            {filename && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <FileText className="size-3.5" /> {filename} — {rows.length} linhas
              </span>
            )}
          </div>
          {!module && <p className="text-xs text-muted-foreground">Escolha um módulo acima para habilitar o upload.</p>}
        </div>
      </Panel>

      {headers.length > 0 && (
        <Panel title={`3. Mapeamento de colunas → ${selectedModule?.title ?? ""}`}>
          <div className="space-y-2 mb-4">
            {headers.map((h) => (
              <div key={h} className="grid grid-cols-2 gap-3 items-center">
                <div className="text-sm">
                  <div className="font-medium text-foreground">{h}</div>
                  <div className="text-mono-xs text-muted-foreground truncate">
                    Ex: {String(rows[0]?.[h] ?? "—").slice(0, 40)}
                  </div>
                </div>
                <Select
                  value={mapping[h] || "__none"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__none" ? "" : (v as FieldKey) }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Ignorar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ignorar —</SelectItem>
                    {fieldList.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={doImport} disabled={importing || !canImport}>
            <CheckCircle2 className="size-4" />
            {importing ? "Importando..." : `Importar ${rows.length} registros`}
          </Button>
        </Panel>
      )}
    </div>
  );
}
