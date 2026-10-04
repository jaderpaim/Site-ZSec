import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDateTime, getCronHealth } from "@/components/dashboard/CronHealthBadge";
import { getModuleSyncStatus, runCronJobNow, type ModuleSyncJob } from "@/lib/cron-run.functions";

const TONE_COLOR = {
  success: "var(--v2-ok)",
  warning: "var(--v2-med)",
  danger: "var(--v2-crit)",
  running: "var(--v2-low)",
  off: "var(--v2-fg-3)",
} as const;

const RUNNING_TIMEOUT_MS = 30 * 60 * 1000;

function isRunning(j: ModuleSyncJob) {
  return (
    j.last_ok === null &&
    !!j.last_attempt_at &&
    Date.now() - new Date(j.last_attempt_at).getTime() <= RUNNING_TIMEOUT_MS
  );
}

function rel(iso: string | null): string {
  if (!iso) return "nunca";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)}d`;
}

function nextRun(j: ModuleSyncJob): number | null {
  if (!j.enabled || !j.last_attempt_at) return null;
  return new Date(j.last_attempt_at).getTime() + j.expected_interval_minutes * 60000;
}

function fmtNext(t: number): string {
  if (t <= Date.now()) return "a qualquer momento";
  const sameDay = new Date(t).toDateString() === new Date().toDateString();
  return new Date(t).toLocaleString(
    "pt-BR",
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  );
}

const CSS = `
.sx-chip { display:inline-flex; align-items:stretch; height:30px; border-radius:8px; overflow:hidden; font:12.5px var(--font-ui);
  border:1px solid color-mix(in oklch, var(--c) 35%, var(--v2-line)); background:color-mix(in oklch, var(--c) 8%, var(--v2-surface)); }
.sx-chip > button { border:0; background:transparent; color:var(--v2-fg-2); display:inline-flex; align-items:center; gap:7px; padding:0 10px; cursor:pointer; white-space:nowrap; }
.sx-chip > button:hover:not(:disabled) { background:color-mix(in oklch, var(--c) 14%, transparent); color:var(--v2-fg); }
.sx-chip > button:disabled { cursor:default; }
.sx-chip > button + button { border-left:1px solid color-mix(in oklch, var(--c) 30%, var(--v2-line)); padding:0 9px; }
.sx-chip .d { width:7px; height:7px; border-radius:50%; background:var(--c); box-shadow:0 0 0 3px color-mix(in oklch, var(--c) 22%, transparent); flex:none; }
.sx-chip b { font-weight:500; color:var(--v2-fg); }
.sx-chip .sub { color:var(--v2-fg-3); }
@media (max-width:640px) { .sx-chip .sub { display:none; } }
.sx-pop { font:12.5px var(--font-ui); color:var(--v2-fg); }
.sx-pop-h { padding:12px 14px; border-bottom:1px solid var(--v2-line); font-weight:600; font-size:13px; }
.sx-job { padding:12px 14px; border-bottom:1px solid var(--v2-line); display:grid; gap:6px; }
.sx-job-t { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.sx-job-t b { font-weight:500; }
.sx-pill { display:inline-flex; align-items:center; gap:6px; height:20px; padding:0 7px; border-radius:5px; font-size:11.5px; font-weight:500; white-space:nowrap;
  background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
.sx-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
.sx-r { display:flex; justify-content:space-between; gap:8px; color:var(--v2-fg-3); }
.sx-r span:last-child { color:var(--v2-fg-2); font:12px var(--font-data); }
.sx-err { font:11.5px/1.5 var(--font-data); color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 8%, transparent); border-radius:6px; padding:6px 8px; overflow-wrap:anywhere; }
.sx-f { padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
.sx-link { display:inline-flex; align-items:center; gap:5px; color:var(--v2-accent); font-weight:500; text-decoration:none; }
.sx-link:hover { text-decoration:underline; text-underline-offset:3px; }
.sx-btn { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-radius:7px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); font:500 12.5px var(--font-ui); cursor:pointer; }
.sx-btn:hover:not(:disabled) { background:var(--v2-hover); }
.sx-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
.sx-btn:disabled { opacity:.55; cursor:not-allowed; }
.sx-muted { color:var(--v2-fg-3); font-size:12px; }
.sx-spin { animation:sx-spin 1s linear infinite; }
@keyframes sx-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sx-spin { animation:none; } }
`;

/**
 * Etiqueta de sincronização do módulo: quando sincronizou, quando é a
 * próxima e o ↻ que dispara os mesmos jobs do cron (runCronJobNow). O
 * detalhe abre num popover com o link para o Cron Jobs. Quem não pode
 * disparar vê só a parte informativa.
 */
export function CronStatus({
  moduleSlug,
  onSynced,
}: {
  moduleSlug: string;
  onSynced?: () => void;
}) {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getModuleSyncStatus);
  const runFn = useServerFn(runCronJobNow);
  const [starting, setStarting] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["module-sync-status", moduleSlug],
    queryFn: () => fetchStatus({ data: { moduleSlug } }),
    refetchInterval: (q) => (q.state.data?.jobs.some(isRunning) ? 5000 : 60000),
  });
  const jobs = React.useMemo(() => data?.jobs ?? [], [data]);

  // Quando um job termina, recarrega os dados do módulo
  const wasRunning = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const now = new Set(jobs.filter(isRunning).map((j) => j.job_name));
    const finished = [...wasRunning.current].filter((j) => !now.has(j));
    wasRunning.current = now;
    if (!finished.length) return;
    const failed = jobs.filter((j) => finished.includes(j.job_name) && j.last_ok === false);
    if (failed.length)
      toast.error(`Sincronização falhou: ${failed.map((j) => j.label || j.job_name).join(", ")}`);
    else toast.success("Sincronização concluída.");
    if (onSynced) onSynced();
    else qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "module-sync-status" });
  }, [jobs, onSynced, qc]);

  if (!jobs.length) return null;

  const runnable = jobs.filter((j) => j.canRun);
  const running = jobs.some(isRunning) || starting.length > 0;
  const enabled = jobs.filter((j) => j.enabled);
  const health = jobs.map((j) => ({ j, h: getCronHealth(j) }));
  const failing = health.find(({ j, h }) => j.enabled && !isRunning(j) && h.tone !== "success");
  const isSync = jobs.some((j) => /sync|refresh|snapshot/.test(j.job_name));
  const lastSuccess =
    enabled
      .map((j) => j.last_success_at)
      .filter((s): s is string => !!s)
      .sort()[0] ?? null;
  const next = enabled
    .map(nextRun)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b)[0];

  let tone: keyof typeof TONE_COLOR = "success";
  let main: React.ReactNode;
  if (running) {
    tone = "running";
    main = <b>{isSync ? "Sincronizando…" : "Executando…"}</b>;
  } else if (!enabled.length) {
    tone = "off";
    main = <b>Atualização automática desativada</b>;
  } else if (failing) {
    tone = failing.h.tone === "danger" ? "danger" : "warning";
    main = (
      <>
        <b>
          {failing.j.last_ok === false ? "Última sincronização falhou" : "Sincronização atrasada"}
        </b>
        <span className="sub">· último sucesso {rel(lastSuccess)}</span>
      </>
    );
  } else {
    main = (
      <>
        <b>
          {isSync ? "Sincronizado" : "Verificado"} {rel(lastSuccess)}
        </b>
        {next !== undefined && <span className="sub">· próxima {fmtNext(next)}</span>}
      </>
    );
  }

  async function run(list: ModuleSyncJob[]) {
    const names = list.filter((j) => j.canRun && !isRunning(j)).map((j) => j.job_name);
    if (!names.length) return;
    setStarting(names);
    try {
      const results = await Promise.all(names.map((jobName) => runFn({ data: { jobName } })));
      const errs = results.filter((r) => !r.ok);
      if (errs.length) toast.error(errs.map((r) => r.error).join(" · "));
      else if (results.every((r) => r.finished)) toast.success("Sincronização concluída.");
      else toast.info("Sincronização iniciada. A tela atualiza quando terminar.");
      if (results.some((r) => r.ok && r.finished)) {
        if (onSynced) onSynced();
        else qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "module-sync-status" });
      }
    } finally {
      setStarting([]);
      refetch();
    }
  }

  const color = TONE_COLOR[tone];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Popover open={open} onOpenChange={setOpen}>
        <div className="sx-chip" style={{ "--c": color } as React.CSSProperties}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Detalhes da sincronização">
              <span className="d" />
              <span>{main}</span>
              <ChevronDown size={13} />
            </button>
          </PopoverTrigger>
          {runnable.length > 0 && (
            <button
              type="button"
              onClick={() => run(runnable)}
              disabled={running}
              aria-label={isSync ? "Sincronizar agora" : "Executar agora"}
              title={isSync ? "Sincronizar agora" : "Executar agora"}
            >
              <RefreshCw size={14} className={running ? "sx-spin" : ""} />
            </button>
          )}
        </div>
        <PopoverContent align="end" className="w-[min(380px,calc(100vw-32px))] p-0">
          <div className="sx-pop">
            <div className="sx-pop-h">Atualização automática</div>
            {jobs.map((j) => {
              const h = getCronHealth(j);
              const busy = isRunning(j) || starting.includes(j.job_name);
              const c = busy
                ? TONE_COLOR.running
                : !j.enabled
                  ? TONE_COLOR.off
                  : TONE_COLOR[h.tone];
              const nx = nextRun(j);
              return (
                <div className="sx-job" key={j.job_name}>
                  <div className="sx-job-t">
                    <b>{j.label || j.job_name}</b>
                    <span className="sx-pill" style={{ "--c": c } as React.CSSProperties}>
                      {busy
                        ? "Em execução"
                        : !j.enabled
                          ? "Desativado"
                          : h.tone === "success"
                            ? "No prazo"
                            : h.label.replace("Cron ", "")}
                    </span>
                  </div>
                  <div className="sx-r">
                    <span>Último sucesso</span>
                    <span>{fmtDateTime(j.last_success_at)}</span>
                  </div>
                  <div className="sx-r">
                    <span>Próxima</span>
                    <span>{nx ? fmtNext(nx) : "—"}</span>
                  </div>
                  {/* Detalhe técnico do erro só para quem opera o job */}
                  {j.canRun && j.last_ok === false && j.last_error && (
                    <div className="sx-err">{j.last_error}</div>
                  )}
                  {j.canRun && jobs.length > 1 && (
                    <div>
                      <button
                        type="button"
                        className="sx-btn"
                        disabled={busy}
                        onClick={() => void run([j])}
                      >
                        {busy ? <Loader2 size={12} className="sx-spin" /> : <RefreshCw size={12} />}
                        Rodar só este
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="sx-f">
              {runnable.length > 0 ? (
                <Link
                  to="/app/$module"
                  params={{ module: "cron-jobs" }}
                  hash={jobs[0].job_name}
                  className="sx-link"
                  onClick={() => setOpen(false)}
                >
                  Ver no Cron Jobs <ExternalLink size={12} />
                </Link>
              ) : (
                <span className="sx-muted">Sem permissão para disparar</span>
              )}
              {runnable.length > 0 && (
                <button
                  type="button"
                  className="sx-btn primary"
                  disabled={running}
                  onClick={() => run(runnable)}
                >
                  {running ? <Loader2 size={13} className="sx-spin" /> : <RefreshCw size={13} />}
                  {isSync ? "Sincronizar agora" : "Executar agora"}
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

/**
 * Lado direito do cabeçalho do módulo: a etiqueta de sincronização fica em
 * cima e as demais ações do módulo embaixo, sempre alinhadas à direita.
 * `jobs` é mantido por compatibilidade — a lista vem de MODULE_CRON_JOBS.
 */
export function SyncActions({
  moduleSlug,
  children,
  onSynced,
}: {
  moduleSlug: string;
  jobs?: string[];
  children?: React.ReactNode;
  onSynced?: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2 max-w-full">
      <CronStatus moduleSlug={moduleSlug} onSynced={onSynced} />
      {children}
    </div>
  );
}
