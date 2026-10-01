import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, RefreshCw, Search } from "lucide-react";
import { KpiCard, Panel, Badge } from "./primitives";
import { isNonHumanAuthor } from "@/lib/sast-normalize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getSastAccess,
  getSastSyncStatus,
  listSastFindingEvents,
  listSastFindings,
  listSastScanRuns,
  setSastFindingStatus,
  triggerSastSync,
} from "@/lib/sast.functions";

// Módulo SAST: achados das esteiras CI/CD (Gitleaks hoje, via App Insights --
// ver sast.server.ts). Layout aprovado em preview (2026-09-28): filtros ->
// KPIs -> evolução + distribuição -> abas Achados / Execuções e cobertura /
// Por autor. Detalhe do achado em Sheet lateral redimensionável, mesmo padrão
// do HostDetailsSheet do Shadow IT.

type Status = "aberto" | "resolvido" | "falso_positivo" | "risco_aceito";
type Env = "producao" | "homolog" | "dev" | "outro";

type SastFinding = {
  id: string;
  tool: string;
  category: string;
  project: string;
  repository: string;
  branch: string;
  environment: Env;
  rule_id: string;
  severity: string | null;
  fingerprint: string;
  file_path: string | null;
  line: number | null;
  details: Record<string, unknown> | null;
  status: Status;
  resolution_source: "auto" | "manual" | null;
  resolved_at: string | null;
  triaged_at: string | null;
  triage_note: string | null;
  triaged_by_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  last_commit_sha: string | null;
  last_build_id: string | null;
  last_build_url: string | null;
  last_file_url: string | null;
  last_author: string | null;
  last_author_email: string | null;
  introduced_by: string | null;
  introduced_by_email: string | null;
};

type SastRun = {
  id: string;
  tool: string;
  project: string;
  repository: string;
  branch: string;
  environment: Env;
  build_id: string | null;
  build_url: string | null;
  findings_count: number | null;
  scanned_at: string;
};

const DAY = 864e5;
const ALL = "__all";

const STATUS: Record<Status, { label: string; tone: "danger" | "success" | "muted" | "info" }> = {
  aberto: { label: "Aberto", tone: "danger" },
  resolvido: { label: "Resolvido", tone: "success" },
  falso_positivo: { label: "Falso positivo", tone: "muted" },
  risco_aceito: { label: "Risco aceito", tone: "info" },
};
const ENV: Record<Env, { label: string; tone: "danger" | "warning" | "info" | "muted" }> = {
  producao: { label: "Produção", tone: "danger" },
  homolog: { label: "Homolog", tone: "warning" },
  dev: { label: "Dev", tone: "info" },
  outro: { label: "Outro", tone: "muted" },
};
const SEV: Record<string, { label: string; color: string; rank: number }> = {
  critica: { label: "Crítica", color: "var(--danger)", rank: 0 },
  alta: { label: "Alta", color: "oklch(0.72 0.18 45)", rank: 1 },
  media: { label: "Média", color: "var(--warning)", rank: 2 },
  baixa: { label: "Baixa", color: "var(--primary)", rank: 3 },
  info: { label: "Info", color: "var(--muted-foreground)", rank: 4 },
};
const sevOf = (s: string | null) =>
  SEV[s ?? ""] ?? { label: "—", color: "var(--muted-foreground)", rank: 5 };
const CATEGORY_LABEL: Record<string, string> = {
  secret: "Segredo",
  code: "Código",
  dependency: "Dependência",
  iac: "IaC",
  other: "Outro",
};

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return "agora";
  if (h < 24) return `${Math.round(h)}h atrás`;
  return `${Math.round(h / 24)}d atrás`;
}
const scopeKey = (x: { tool: string; project: string; repository: string; branch: string }) =>
  `${x.tool}|${x.project}|${x.repository}|${x.branch}`;
// Build Service ou o bot do espelhamento Lovable (mesma regra do banco/normalize)
const isBuildService = (name: string | null, email?: string | null) =>
  !!name && isNonHumanAuthor(name, email);

type Filters = {
  days: number;
  project: string;
  repo: string;
  env: string;
  tool: string;
  status: string; // "ativos" = só abertos
  rule: string;
  q: string;
};
const DEFAULT_FILTERS: Filters = {
  days: 30,
  project: ALL,
  repo: ALL,
  env: ALL,
  tool: ALL,
  status: "ativos",
  rule: ALL,
  q: "",
};

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-mono-xs text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SastDashboard() {
  const qc = useQueryClient();
  const accessFn = useServerFn(getSastAccess);
  const findingsFn = useServerFn(listSastFindings);
  const runsFn = useServerFn(listSastScanRuns);
  const statusFn = useServerFn(getSastSyncStatus);
  const syncFn = useServerFn(triggerSastSync);

  const access = useQuery({ queryKey: ["sast-access"], queryFn: () => accessFn() });
  const findingsQ = useQuery({
    queryKey: ["sast-findings"],
    queryFn: () => findingsFn(),
    refetchInterval: 60_000,
  });
  const runsQ = useQuery({
    queryKey: ["sast-runs"],
    queryFn: () => runsFn(),
    refetchInterval: 60_000,
  });
  const syncStatusQ = useQuery({
    queryKey: ["sast-sync-status"],
    queryFn: () => statusFn(),
    refetchInterval: 60_000,
  });

  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = React.useState<"achados" | "execucoes" | "autores">("achados");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(
        `Sincronizado: ${r.eventsRead} eventos lidos, ${r.detectionsInserted} detecções novas, ${r.findingsAutoResolved} fechados automaticamente`,
      );
      qc.invalidateQueries({ queryKey: ["sast-findings"] });
      qc.invalidateQueries({ queryKey: ["sast-runs"] });
      qc.invalidateQueries({ queryKey: ["sast-sync-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allFindings = React.useMemo(
    () => (findingsQ.data?.findings ?? []) as SastFinding[],
    [findingsQ.data],
  );
  const allRuns = React.useMemo(() => (runsQ.data?.runs ?? []) as SastRun[], [runsQ.data]);

  // Em homolog o evento chega com o Build Service como autor (commit
  // sintético do espelhamento GitHub -> ADO). Autor real = o primeiro humano
  // visto no mesmo fingerprint em qualquer branch do repo (normalmente a main).
  const introducedByFingerprint = React.useMemo(() => {
    const m = new Map<string, { name: string; email: string | null }>();
    for (const f of allFindings) {
      if (f.introduced_by)
        m.set(`${f.repository}|${f.fingerprint}`, {
          name: f.introduced_by,
          email: f.introduced_by_email,
        });
    }
    return m;
  }, [allFindings]);
  const authorOf = React.useCallback(
    (f: SastFinding) => {
      if (f.introduced_by)
        return { name: f.introduced_by, email: f.introduced_by_email, inferred: false };
      const other = introducedByFingerprint.get(`${f.repository}|${f.fingerprint}`);
      if (other) return { ...other, inferred: true };
      return { name: f.last_author ?? "—", email: f.last_author_email, inferred: false };
    },
    [introducedByFingerprint],
  );

  const scopeMatch = React.useCallback(
    (x: { project: string; repository: string; environment: Env; tool: string }) =>
      (filters.project === ALL || x.project === filters.project) &&
      (filters.repo === ALL || x.repository === filters.repo) &&
      (filters.env === ALL || x.environment === filters.env) &&
      (filters.tool === ALL || x.tool === filters.tool),
    [filters.project, filters.repo, filters.env, filters.tool],
  );

  // Tudo que casa com os filtros MENOS o de status -- base dos KPIs/gráficos.
  const inScope = React.useMemo(() => {
    const since = Date.now() - filters.days * DAY;
    const q = filters.q.trim().toLowerCase();
    return allFindings.filter((f) => {
      if (!scopeMatch(f)) return false;
      if (filters.rule !== ALL && f.rule_id !== filters.rule) return false;
      if (new Date(f.last_seen_at).getTime() < since) return false;
      if (q) {
        const a = authorOf(f);
        const hay = [
          f.file_path,
          f.rule_id,
          f.repository,
          f.last_commit_sha,
          a.name,
          a.email,
          f.last_author,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allFindings, filters.days, filters.rule, filters.q, scopeMatch, authorOf]);

  const visible = React.useMemo(() => {
    const rows = inScope.filter((f) =>
      filters.status === "ativos"
        ? f.status === "aberto"
        : filters.status === ALL
          ? true
          : f.status === filters.status,
    );
    return rows.sort(
      (a, b) =>
        sevOf(a.severity).rank - sevOf(b.severity).rank ||
        new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    );
  }, [inScope, filters.status]);

  // ── Cobertura: última execução por escopo + escopos que só têm achado ──
  const coverage = React.useMemo(() => {
    const m = new Map<
      string,
      {
        tool: string;
        project: string;
        repository: string;
        branch: string;
        environment: Env;
        last: string;
        buildId: string | null;
        buildUrl: string | null;
        count: number | null;
        runs30: number;
        hasCompleted: boolean;
      }
    >();
    const since30 = Date.now() - 30 * DAY;
    for (const r of allRuns) {
      const k = scopeKey(r);
      const cur = m.get(k);
      if (!cur) {
        m.set(k, {
          tool: r.tool,
          project: r.project,
          repository: r.repository,
          branch: r.branch,
          environment: r.environment,
          last: r.scanned_at,
          buildId: r.build_id,
          buildUrl: r.build_url,
          count: r.findings_count,
          runs30: 0,
          hasCompleted: true,
        });
      }
      if (new Date(r.scanned_at).getTime() >= since30) m.get(k)!.runs30++;
    }
    // Escopo que só tem achado (template ainda sem ScanCompleted): "último
    // scan" = último vazamento visto, count = abertos do escopo.
    const withRuns = new Set(m.keys());
    for (const f of allFindings) {
      const k = scopeKey(f);
      if (withRuns.has(k)) continue;
      const cur = m.get(k);
      if (!cur) {
        m.set(k, {
          tool: f.tool,
          project: f.project,
          repository: f.repository,
          branch: f.branch,
          environment: f.environment,
          last: f.last_seen_at,
          buildId: f.last_build_id,
          buildUrl: f.last_build_url,
          count: f.status === "aberto" ? 1 : 0,
          runs30: 0,
          hasCompleted: false,
        });
        continue;
      }
      if (f.status === "aberto") cur.count = (cur.count ?? 0) + 1;
      if (f.last_seen_at > cur.last) {
        cur.last = f.last_seen_at;
        cur.buildId = f.last_build_id;
        cur.buildUrl = f.last_build_url;
      }
    }
    return [...m.values()]
      .filter((c) => scopeMatch(c))
      .sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  }, [allRuns, allFindings, scopeMatch]);

  const authors = React.useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        email: string | null;
        open: number;
        crit: number;
        total: number;
        repos: Set<string>;
        last: string;
      }
    >();
    for (const f of inScope) {
      const a = authorOf(f);
      if (isBuildService(a.name, a.email)) continue;
      const k = a.email || a.name;
      if (!m.has(k))
        m.set(k, {
          name: a.name,
          email: a.email,
          open: 0,
          crit: 0,
          total: 0,
          repos: new Set(),
          last: f.last_seen_at,
        });
      const row = m.get(k)!;
      row.total++;
      if (f.status === "aberto") {
        row.open++;
        if (f.severity === "critica") row.crit++;
      }
      row.repos.add(f.repository);
      if (f.last_seen_at > row.last) row.last = f.last_seen_at;
    }
    return [...m.values()].sort((a, b) => b.open - a.open || b.total - a.total);
  }, [inScope, authorOf]);

  // ── KPIs ──
  const kpis = React.useMemo(() => {
    const open = inScope.filter((f) => f.status === "aberto");
    const resolved = inScope.filter((f) => f.status === "resolvido" && f.resolved_at);
    const mttrDays = resolved.length
      ? resolved.reduce(
          (s, f) => s + (new Date(f.resolved_at!).getTime() - new Date(f.first_seen_at).getTime()),
          0,
        ) /
        resolved.length /
        DAY
      : null;
    return {
      open: open.length,
      newLast7: open.filter((f) => Date.now() - new Date(f.first_seen_at).getTime() <= 7 * DAY)
        .length,
      critProd: open.filter((f) => f.environment === "producao" && f.severity === "critica").length,
      repos: new Set(open.map((f) => `${f.project}/${f.repository}`)).size,
      projects: new Set(inScope.map((f) => f.project)).size,
      resolved: resolved.length,
      mttr: mttrDays === null ? "–" : mttrDays.toFixed(1),
      stale: coverage.filter((c) => Date.now() - new Date(c.last).getTime() > 7 * DAY).length,
    };
  }, [inScope, coverage]);

  // ── Série diária (até 90 pontos) ──
  const series = React.useMemo(() => {
    const n = Math.min(filters.days, 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime() - (n - 1) * DAY;
    const buckets = Array.from({ length: n }, (_, i) => ({
      date: new Date(t0 + i * DAY).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      novos: 0,
      resolvidos: 0,
      abertos: 0,
    }));
    const idx = (iso: string) => Math.floor((new Date(iso).getTime() - t0) / DAY);
    let openAtStart = 0;
    for (const f of inScope) {
      if (f.status === "falso_positivo") continue;
      const i = idx(f.first_seen_at);
      if (i >= 0 && i < n) buckets[i].novos++;
      else if (i < 0 && (!f.resolved_at || idx(f.resolved_at) >= 0)) openAtStart++;
      if (f.resolved_at) {
        const j = idx(f.resolved_at);
        if (j >= 0 && j < n) buckets[j].resolvidos++;
      }
    }
    let acc = openAtStart;
    for (const b of buckets) {
      acc += b.novos - b.resolvidos;
      b.abertos = Math.max(acc, 0);
    }
    return buckets;
  }, [inScope, filters.days]);

  const distribution = React.useMemo(() => {
    const open = inScope.filter((f) => f.status === "aberto");
    const group = (key: (f: SastFinding) => string) => {
      const m = new Map<string, number>();
      for (const f of open) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    };
    return {
      category: group((f) => CATEGORY_LABEL[f.category] ?? f.category),
      severity: group((f) => sevOf(f.severity).label),
      repo: group((f) => f.repository),
    };
  }, [inScope]);

  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  const opt = (xs: string[], allLabel: string) => [
    { value: ALL, label: allLabel },
    ...xs.map((x) => ({ value: x, label: x })),
  ];

  const selected = React.useMemo(
    () => allFindings.find((f) => f.id === selectedId) ?? null,
    [allFindings, selectedId],
  );

  function exportRows() {
    return visible.map((f) => {
      const a = authorOf(f);
      return {
        Severidade: sevOf(f.severity).label,
        Status: STATUS[f.status].label,
        "Fechado automaticamente": f.resolution_source === "auto" ? "sim" : "",
        Ferramenta: f.tool,
        Categoria: CATEGORY_LABEL[f.category] ?? f.category,
        Projeto: f.project,
        Repositório: f.repository,
        Branch: f.branch,
        Ambiente: ENV[f.environment].label,
        Regra: f.rule_id,
        Arquivo: f.file_path ?? "",
        Linha: f.line ?? "",
        "Introduzido por": a.name,
        "E-mail": a.email ?? "",
        "Autor inferido": a.inferred ? "sim" : "",
        "1ª detecção": fmtDateTime(f.first_seen_at),
        "Última detecção": fmtDateTime(f.last_seen_at),
        Ocorrências: f.occurrences,
        "Último commit": f.last_commit_sha ?? "",
        "Link do código": f.last_file_url ?? "",
        "Link da build": f.last_build_url ?? "",
        Justificativa: f.triage_note ?? "",
        "Triado por": f.triaged_by_name ?? "",
      };
    });
  }
  const fname = `sast-achados-${new Date().toISOString().slice(0, 10)}`;
  function exportCsv() {
    const rows = exportRows();
    if (!rows.length) return toast.error("Nada pra exportar com esses filtros.");
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(";")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fname}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  }
  function exportXlsx() {
    const rows = exportRows();
    if (!rows.length) return toast.error("Nada pra exportar com esses filtros.");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Achados");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        coverage.map((c) => ({
          Ferramenta: c.tool,
          Projeto: c.project,
          Repositório: c.repository,
          Branch: c.branch,
          "Último scan": fmtDateTime(c.last),
          "Achados no último": c.count ?? "",
          "Scans (30d)": c.runs30,
          Build: c.buildUrl ?? c.buildId ?? "",
          "Fechamento automático": c.hasCompleted ? "Ativo" : "Sem ScanCompleted",
        })),
      ),
      "Cobertura",
    );
    XLSX.writeFile(wb, `${fname}.xlsx`);
    toast.success("Exportação concluída");
  }

  const st = syncStatusQ.data;
  const loading = findingsQ.isLoading || runsQ.isLoading;

  return (
    <div className="p-6 flex flex-col gap-4">
      {/* ── Status da integração / ações ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Achados de segredos, código e dependências vindos das pipelines do Azure DevOps.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Duas origens convivem: envio direto da pipeline + sync do App Insights */}
          <div
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
            title="Origem: envio direto das pipelines do Azure DevOps (/api/public/hooks/sast-ingest)"
          >
            <span
              className={`size-2 rounded-full ${st?.ingest.enabled ? "bg-success" : "bg-muted-foreground"}`}
            />
            {!st
              ? "Carregando status…"
              : !st.ingest.enabled
                ? "Pipeline direta · desligada"
                : st.ingest.lastReceivedAt
                  ? `Pipeline direta · último envio ${relTime(st.ingest.lastReceivedAt)}`
                  : "Pipeline direta · aguardando o primeiro envio"}
          </div>
          <div
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
            title="Origem: App Insights devops-clarity-hub-insights"
          >
            <span
              className={`size-2 rounded-full ${
                !st?.configured || !st.enabled
                  ? "bg-muted-foreground"
                  : st.cron?.lastOk === false
                    ? "bg-danger"
                    : "bg-success"
              }`}
            />
            {!st
              ? "Carregando status…"
              : !st.configured
                ? "App Insights · não configurado"
                : !st.enabled
                  ? "App Insights · desativado"
                  : st.lastSyncAt
                    ? `App Insights · sincronizado ${relTime(st.lastSyncAt)}`
                    : "App Insights · nunca sincronizado"}
          </div>
          {access.data?.canManage && st?.configured && st.enabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || !st?.configured || !st?.enabled}
            >
              <RefreshCw className={`size-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" />
            CSV
          </Button>
          <Button size="sm" onClick={exportXlsx}>
            <FileSpreadsheet className="size-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {st && !st.ingest.enabled && !(st.configured && st.enabled) && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
          <div>
            Nenhuma origem de dados está ativa. Em{" "}
            <Link
              to="/app/$module"
              params={{ module: "integracoes" }}
              className="text-primary underline"
            >
              Integração API
            </Link>

            , card <b>SAST</b>: ligue a aba <b>Azure DevOps</b> pra receber os relatórios direto das
            pipelines (recomendado, sem credencial) e/ou configure a aba <b>App Insights</b> com o
            cron job <span className="font-mono text-xs">sast-sync</span> pra ler o que já está no App
            Insights.
          </div>
        </div>
      )}
      {st?.cron?.lastOk === false && st.cron.lastError && (
        <div className="flex items-start gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-danger mt-0.5 shrink-0" />
          <div>
            Última sincronização falhou ({fmtDateTime(st.cron.lastAttemptAt)}):{" "}
            <span className="font-mono text-xs">{st.cron.lastError}</span>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="grid gap-2.5 rounded-lg border border-border bg-surface p-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <FilterSelect
          id="sast-f-days"
          label="Período"
          value={String(filters.days)}
          onChange={(v) => setF("days", Number(v))}
          options={[
            { value: "7", label: "Últimos 7 dias" },
            { value: "30", label: "Últimos 30 dias" },
            { value: "90", label: "Últimos 90 dias" },
            { value: "3650", label: "Tudo" },
          ]}
        />
        <FilterSelect
          id="sast-f-project"
          label="Projeto"
          value={filters.project}
          onChange={(v) => setF("project", v)}
          options={opt(uniq(allFindings.map((f) => f.project)), "Todos")}
        />
        <FilterSelect
          id="sast-f-repo"
          label="Repositório"
          value={filters.repo}
          onChange={(v) => setF("repo", v)}
          options={opt(
            uniq(
              allFindings
                .filter((f) => filters.project === ALL || f.project === filters.project)
                .map((f) => f.repository),
            ),
            "Todos",
          )}
        />
        <FilterSelect
          id="sast-f-env"
          label="Ambiente"
          value={filters.env}
          onChange={(v) => setF("env", v)}
          options={[
            { value: ALL, label: "Todos" },
            ...(Object.keys(ENV) as Env[]).map((e) => ({ value: e, label: ENV[e].label })),
          ]}
        />
        <FilterSelect
          id="sast-f-tool"
          label="Ferramenta"
          value={filters.tool}
          onChange={(v) => setF("tool", v)}
          options={opt(uniq(allFindings.map((f) => f.tool)), "Todas")}
        />
        <FilterSelect
          id="sast-f-status"
          label="Status"
          value={filters.status}
          onChange={(v) => setF("status", v)}
          options={[
            { value: "ativos", label: "Abertos" },
            { value: ALL, label: "Todos" },
            ...(Object.keys(STATUS) as Status[]).map((s) => ({ value: s, label: STATUS[s].label })),
          ]}
        />
        <FilterSelect
          id="sast-f-rule"
          label="Tipo / regra"
          value={filters.rule}
          onChange={(v) => setF("rule", v)}
          options={opt(uniq(allFindings.map((f) => f.rule_id)), "Todas")}
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <label htmlFor="sast-f-q" className="text-mono-xs text-muted-foreground">
            Buscar
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="sast-f-q"
              value={filters.q}
              onChange={(e) => setF("q", e.target.value)}
              placeholder="Arquivo, autor, commit…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Achados abertos"
          value={kpis.open}
          accent="danger"
          hint={`+${kpis.newLast7} novos em 7 dias`}
          onClick={() => {
            setFilters((f) => ({ ...f, status: "ativos" }));
            setTab("achados");
          }}
        />
        <KpiCard
          label="Críticos em produção"
          value={kpis.critProd}
          accent="danger"
          hint="segredos e críticos na main"
          onClick={() => {
            setFilters((f) => ({ ...f, status: "ativos", env: "producao" }));
            setTab("achados");
          }}
        />
        <KpiCard
          label="Repositórios afetados"
          value={kpis.repos}
          accent="warning"
          hint={`${kpis.projects} projetos no filtro`}
        />
        <KpiCard
          label="Resolvidos no período"
          value={kpis.resolved}
          accent="success"
          hint={`tempo médio de correção ${kpis.mttr} d`}
          onClick={() => {
            setFilters((f) => ({ ...f, status: "resolvido" }));
            setTab("achados");
          }}
        />
        <KpiCard
          label="Repos sem scan > 7 dias"
          value={kpis.stale}
          accent="primary"
          hint="ver Execuções e cobertura"
          onClick={() => setTab("execucoes")}
        />
      </div>

      {/* ── Gráficos ── */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-3">
        <Panel title="Evolução dos achados" className="xl:col-span-2">
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  cursor={{ fill: "oklch(0.32 0.045 245 / 0.35)" }}
                />
                <Area
                  type="monotone"
                  dataKey="abertos"
                  name="Abertos"
                  stroke="none"
                  fill="var(--primary)"
                  fillOpacity={0.08}
                />
                <Bar
                  dataKey="novos"
                  name="Novos"
                  fill="var(--danger)"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={14}
                />
                <Bar
                  dataKey="resolvidos"
                  name="Resolvidos"
                  fill="var(--success)"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={14}
                />
                <Line
                  type="monotone"
                  dataKey="abertos"
                  name="Abertos (acumulado)"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-danger" /> Novos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-success" /> Resolvidos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-primary" /> Abertos (acumulado)
            </span>
          </div>
        </Panel>
        <Panel title="Distribuição dos abertos">
          <div className="flex flex-col gap-4">
            {(
              [
                ["Categoria", distribution.category, false],
                ["Severidade", distribution.severity, true],
                ["Repositório", distribution.repo, false],
              ] as const
            ).map(([label, rows, bySev]) => {
              const max = Math.max(1, ...rows.map((r) => r[1]));
              return (
                <div key={label}>
                  <div className="text-mono-xs text-muted-foreground mb-1.5">{label}</div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Nada aberto no filtro atual.
                    </div>
                  ) : (
                    rows.map(([k, v]) => (
                      <div
                        key={k}
                        className="grid grid-cols-[minmax(90px,130px)_1fr_32px] items-center gap-2.5 py-1 text-xs"
                      >
                        <span className="truncate" title={k}>
                          {k}
                        </span>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${(v / max) * 100}%`,
                              background: bySev
                                ? (Object.values(SEV).find((s) => s.label === k)?.color ??
                                  "var(--primary)")
                                : "var(--primary)",
                            }}
                          />
                        </div>
                        <span className="font-mono text-right tabular-nums">{v}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ── Abas ── */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex gap-0.5 overflow-x-auto border-b border-border px-2" role="tablist">
          {(
            [
              ["achados", "Achados", visible.length],
              ["execucoes", "Execuções e cobertura", coverage.length],
              ["autores", "Por autor", authors.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                tab === key
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px font-mono text-[10.5px]">
                {count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : tab === "achados" ? (
          <FindingsTable
            rows={visible}
            authorOf={authorOf}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : tab === "execucoes" ? (
          <CoverageTable rows={coverage} />
        ) : (
          <AuthorsTable rows={authors} />
        )}
      </div>

      <FindingSheet
        finding={selected}
        author={selected ? authorOf(selected) : null}
        canEdit={!!access.data?.canEdit}
        onOpenChange={(v) => !v && setSelectedId(null)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tabelas
// ══════════════════════════════════════════════════════════════════════════════
const TH =
  "px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap";
const TD = "px-3 py-2 whitespace-nowrap align-middle";

function FindingsTable({
  rows,
  authorOf,
  selectedId,
  onSelect,
}: {
  rows: SastFinding[];
  authorOf: (f: SastFinding) => { name: string; email: string | null; inferred: boolean };
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const PAGE = 200;
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => setLimit(PAGE), [rows]);
  if (!rows.length)
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Nenhum achado com esses filtros.
      </div>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              {[
                "Severidade",
                "Status",
                "Ferramenta",
                "Repositório",
                "Ambiente",
                "Tipo / regra",
                "Arquivo",
                "Introduzido por",
                "1ª detecção",
                "Última",
                "Ocorr.",
              ].map((h) => (
                <th key={h} className={`${TH} ${h === "Ocorr." ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((f) => {
              const a = authorOf(f);
              const sev = sevOf(f.severity);
              return (
                <tr
                  key={f.id}
                  tabIndex={0}
                  onClick={() => onSelect(f.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(f.id)}
                  className={`cursor-pointer border-b border-border/60 hover:bg-accent/40 ${selectedId === f.id ? "bg-primary/10" : ""}`}
                >
                  <td className={TD}>
                    <span
                      className="mr-1.5 inline-block size-2 rounded-sm"
                      style={{ background: sev.color }}
                    />
                    {sev.label}
                  </td>
                  <td className={TD}>
                    <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
                    {f.resolution_source === "auto" && (
                      <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground">
                        auto
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-[11px] text-muted-foreground`}>{f.tool}</td>
                  <td className={TD}>
                    <span className="font-medium text-foreground">{f.repository}</span>{" "}
                    <span className="font-mono text-[11px] text-muted-foreground">{f.branch}</span>
                  </td>
                  <td className={TD}>
                    <Badge tone={ENV[f.environment].tone}>{ENV[f.environment].label}</Badge>
                  </td>
                  <td className={`${TD} font-mono text-[11.5px]`}>{f.rule_id}</td>
                  <td
                    className={`${TD} max-w-[280px] truncate font-mono text-[11.5px] text-muted-foreground`}
                    title={f.file_path ?? ""}
                  >
                    {f.file_path ?? "—"}
                    {f.line ? `:${f.line}` : ""}
                  </td>
                  <td className={TD}>
                    {a.name}
                    {a.inferred && (
                      <span
                        className="ml-1.5 text-[11px] text-warning"
                        title="Evento veio do Build Service; autor inferido pelo mesmo fingerprint em outra branch"
                      >
                        inferido
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-[11.5px] tabular-nums`}>
                    {fmtDateTime(f.first_seen_at)}
                  </td>
                  <td className={`${TD} font-mono text-[11.5px] tabular-nums`}>
                    {relTime(f.last_seen_at)}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums`}>{f.occurrences}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {Math.min(limit, rows.length)} de {rows.length} achado(s) · clique numa linha pra ver
          detalhe e triar
        </span>
        {rows.length > limit && (
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais
          </Button>
        )}
      </div>
    </>
  );
}

function CoverageTable({
  rows,
}: {
  rows: Array<{
    tool: string;
    project: string;
    repository: string;
    branch: string;
    last: string;
    buildId: string | null;
    buildUrl: string | null;
    count: number | null;
    runs30: number;
    hasCompleted: boolean;
  }>;
}) {
  if (!rows.length)
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Nenhuma execução registrada ainda.
      </div>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              {[
                "Cobertura",
                "Ferramenta",
                "Projeto",
                "Repositório",
                "Branch",
                "Último scan",
                "Achados no último",
                "Scans (30d)",
                "Build",
                "Fechamento automático",
              ].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const days = (Date.now() - new Date(r.last).getTime()) / DAY;
              return (
                <tr key={scopeKey(r)} className="border-b border-border/60">
                  <td className={TD}>
                    {days > 30 ? (
                      <Badge tone="danger">Parado &gt; 30d</Badge>
                    ) : days > 7 ? (
                      <Badge tone="warning">Sem scan &gt; 7d</Badge>
                    ) : (
                      <Badge tone="success">Em dia</Badge>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-[11px] text-muted-foreground`}>{r.tool}</td>
                  <td className={TD}>{r.project}</td>
                  <td className={`${TD} font-medium`}>{r.repository}</td>
                  <td className={`${TD} font-mono text-[11.5px]`}>{r.branch}</td>
                  <td className={`${TD} font-mono text-[11.5px] tabular-nums`}>
                    {fmtDateTime(r.last)}{" "}
                    <span className="text-muted-foreground">({relTime(r.last)})</span>
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums`}>{r.count ?? "—"}</td>
                  <td className={`${TD} text-right font-mono tabular-nums`}>{r.runs30}</td>
                  <td className={`${TD} font-mono text-[11.5px]`}>
                    {r.buildUrl ? (
                      <a
                        href={r.buildUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        #{r.buildId ?? "build"}
                      </a>
                    ) : (
                      (r.buildId ?? "—")
                    )}
                  </td>
                  <td className={TD}>
                    {r.hasCompleted ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="warning">Sem ScanCompleted</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 text-xs text-muted-foreground">
        <b>Sem ScanCompleted</b>: a esteira só manda evento quando encontra algo, então os achados
        desse repositório não fecham sozinhos e a data do último scan é só a do último vazamento
        visto.
      </div>
    </>
  );
}

function AuthorsTable({
  rows,
}: {
  rows: Array<{
    name: string;
    email: string | null;
    open: number;
    crit: number;
    total: number;
    repos: Set<string>;
    last: string;
  }>;
}) {
  if (!rows.length)
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Nenhum autor no filtro atual.
      </div>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              {[
                "Autor",
                "E-mail",
                "Abertos",
                "Críticos abertos",
                "Total no período",
                "Repositórios",
                "Última detecção",
              ].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.email || a.name} className="border-b border-border/60">
                <td className={`${TD} font-medium`}>{a.name}</td>
                <td className={`${TD} font-mono text-[11.5px] text-muted-foreground`}>
                  {a.email || "—"}
                </td>
                <td className={`${TD} text-right font-mono tabular-nums`}>{a.open}</td>
                <td
                  className={`${TD} text-right font-mono tabular-nums ${a.crit ? "text-danger" : ""}`}
                >
                  {a.crit}
                </td>
                <td className={`${TD} text-right font-mono tabular-nums`}>{a.total}</td>
                <td className={TD}>{[...a.repos].join(", ")}</td>
                <td className={`${TD} font-mono text-[11.5px] tabular-nums`}>{relTime(a.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 text-xs text-muted-foreground">
        Agrupado por quem introduziu o achado (primeiro autor humano visto), sem o Build Service.
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sheet de detalhe + triagem
// ══════════════════════════════════════════════════════════════════════════════
const SHEET_MIN_WIDTH = 420;
const SHEET_MAX_WIDTH = 1000;

function FindingSheet({
  finding,
  author,
  canEdit,
  onOpenChange,
}: {
  finding: SastFinding | null;
  author: { name: string; email: string | null; inferred: boolean } | null;
  canEdit: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const eventsFn = useServerFn(listSastFindingEvents);
  const triageFn = useServerFn(setSastFindingStatus);

  // Mantém o último achado enquanto o Sheet anima a saída.
  const [last, setLast] = React.useState<{ f: SastFinding; a: typeof author } | null>(null);
  React.useEffect(() => {
    if (finding) setLast({ f: finding, a: author });
  }, [finding, author]);
  const [note, setNote] = React.useState("");
  React.useEffect(() => setNote(""), [finding?.id]);

  const [width, setWidth] = React.useState<number | null>(null);
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      const next = window.innerWidth - ev.clientX;
      setWidth(Math.min(SHEET_MAX_WIDTH, window.innerWidth - 80, Math.max(SHEET_MIN_WIDTH, next)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const events = useQuery({
    queryKey: ["sast-finding-events", finding?.id],
    queryFn: () => eventsFn({ data: { findingId: finding!.id } }),
    enabled: !!finding,
  });

  const triage = useMutation({
    mutationFn: (status: Status) =>
      triageFn({ data: { findingId: finding!.id, status, note: note.trim() || null } }),
    onSuccess: (_r, status) => {
      toast.success(
        status === "aberto"
          ? "Achado reaberto."
          : `Status alterado para ${STATUS[status].label}. Registrado no log de auditoria.`,
      );
      setNote("");
      qc.invalidateQueries({ queryKey: ["sast-findings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = finding ?? last?.f;
  const a = finding ? author : last?.a;
  if (!f) return null;
  const sev = sevOf(f.severity);
  const needsNote = note.trim().length < 5;

  return (
    <Sheet open={!!finding} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto"
        style={width ? { width, maxWidth: "none" } : undefined}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40 sm:block"
        />
        <SheetHeader className="space-y-1 pr-8">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
            <Badge tone={ENV[f.environment].tone}>{ENV[f.environment].label}</Badge>
            <Badge tone="muted">{f.tool}</Badge>
          </div>
          <SheetTitle className="font-mono text-base break-all">{f.rule_id}</SheetTitle>
          <div className="text-xs text-muted-foreground">
            {f.project} · {f.repository} · {f.branch}
          </div>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-5 text-sm">
          {f.category === "secret" && f.status === "aberto" && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed">
              <b>Remover o arquivo do repositório não basta.</b> O segredo continua no histórico do
              Git: rotacione a credencial na origem e depois marque como resolvido.
            </div>
          )}
          {a?.inferred && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed">
              O último evento veio do <span className="font-mono">Build Service</span> (commit
              sintético do espelhamento). O autor abaixo foi inferido pelo mesmo fingerprint visto
              em outra branch do repositório.
            </div>
          )}

          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Severidade</dt>
            <dd>
              <span
                className="mr-1.5 inline-block size-2 rounded-sm"
                style={{ background: sev.color }}
              />
              {sev.label}
              {f.category === "secret" && (
                <span className="ml-1 text-muted-foreground">(segredo = crítico por padrão)</span>
              )}
            </dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Categoria</dt>
            <dd>{CATEGORY_LABEL[f.category] ?? f.category}</dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Arquivo</dt>
            <dd className="font-mono text-[11.5px] break-all">
              {f.last_file_url ? (
                <a
                  href={f.last_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {f.file_path ?? "—"}
                  {f.line ? `:${f.line}` : ""}
                </a>
              ) : (
                <>
                  {f.file_path ?? "—"}
                  {f.line ? `:${f.line}` : ""}
                </>
              )}
            </dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Fingerprint</dt>
            <dd className="font-mono text-[11px] text-muted-foreground break-all">
              {f.fingerprint}
            </dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Introduzido por</dt>
            <dd>
              {a?.name ?? "—"}
              {a?.email && (
                <div className="font-mono text-[11px] text-muted-foreground">{a.email}</div>
              )}
            </dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Último commit</dt>
            <dd className="font-mono text-[11px] break-all">{f.last_commit_sha ?? "—"}</dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">1ª detecção</dt>
            <dd className="font-mono tabular-nums">{fmtDateTime(f.first_seen_at)}</dd>
            <dt className="text-mono-xs text-muted-foreground pt-0.5">Última detecção</dt>
            <dd className="font-mono tabular-nums">
              {fmtDateTime(f.last_seen_at)} · {f.occurrences} ocorrência(s)
            </dd>
          </dl>

          {/* Triagem */}
          <div className="flex flex-col gap-2.5 rounded-md border border-border bg-background p-3">
            <div className="text-mono-xs text-muted-foreground">Triagem</div>
            {f.status !== "aberto" && (
              <div className="text-xs">
                <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>{" "}
                {f.resolution_source === "auto" ? (
                  <span className="text-muted-foreground">
                    fechado automaticamente: não apareceu no scan de {fmtDateTime(f.resolved_at)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    por {f.triaged_by_name ?? "—"} em {fmtDateTime(f.triaged_at)}
                  </span>
                )}
                {f.triage_note && <div className="mt-1.5 leading-relaxed">“{f.triage_note}”</div>}
              </div>
            )}
            {canEdit ? (
              f.status === "aberto" ? (
                <>
                  <label htmlFor="sast-triage-note" className="text-xs text-muted-foreground">
                    Justificativa (obrigatória, vai pro log de auditoria e dispara alerta)
                  </label>
                  <Textarea
                    id="sast-triage-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex.: chave rotacionada no Key Vault em 28/09, commit de remoção pendente"
                    className="min-h-16 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("resolvido")}
                    >
                      Marcar resolvido
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("falso_positivo")}
                    >
                      Falso positivo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-danger border-danger/40"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("risco_aceito")}
                    >
                      Aceitar risco
                    </Button>
                  </div>
                  <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                    Resolver não esconde o achado: se ele aparecer de novo num scan posterior, volta
                    pra Aberto. Falso positivo e risco aceito ficam até alguém reabrir.
                  </div>
                </>
              ) : (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triage.isPending}
                    onClick={() => triage.mutate("aberto")}
                  >
                    Reabrir
                  </Button>
                </div>
              )
            ) : (
              f.status === "aberto" && (
                <div className="text-xs text-muted-foreground">
                  Sem permissão de triagem neste módulo.
                </div>
              )
            )}
          </div>

          {/* Histórico */}
          <div>
            <div className="text-mono-xs text-muted-foreground mb-2.5">Histórico de detecções</div>
            {events.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Carregando…
              </div>
            ) : (
              <div className="ml-1 flex flex-col border-l border-border">
                {f.resolution_source === "auto" && f.resolved_at && (
                  <div className="relative pb-3 pl-4 text-xs">
                    <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-success" />
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {fmtDateTime(f.resolved_at)}
                    </div>
                    Não apareceu no ScanCompleted da build · fechado automaticamente
                  </div>
                )}
                {((events.data?.events ?? []) as any[]).map((ev) => (
                  <div key={ev.id} className="relative pb-3 pl-4 text-xs">
                    <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-primary" />
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {fmtDateTime(ev.detected_at)}
                    </div>
                    Detectado na build{" "}
                    {ev.build_url ? (
                      <a
                        href={ev.build_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        #{ev.build_id ?? "build"}
                      </a>
                    ) : (
                      <span className="font-mono">#{ev.build_id ?? "—"}</span>
                    )}{" "}
                    · {ev.author ?? "—"}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-[11.5px] text-muted-foreground">
            O valor do segredo nunca é armazenado no b-security. Só metadados: regra, arquivo,
            linha, commit e autor.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
