import * as React from "react";
import { useMaintenance } from "@/lib/use-maintenance";
import { Wrench } from "lucide-react";
import { Download, Calendar, Save, Menu, Search, ChevronRight, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/use-theme";
import { MODULE_BY_SLUG } from "@/lib/modules";
import { useShellState } from "@/components/layout/shell-state";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters, type PeriodKey } from "@/lib/filters-context";
import { Checkbox } from "@/components/ui/checkbox";
import { useDepartments } from "@/lib/use-departments";
import { usePermissions } from "@/lib/use-permissions";
import { getModuleFilterDefault, saveModuleFilterDefault } from "@/lib/filter-defaults.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Props {
  title: string;
  subtitle?: string;
  moduleSlug?: string;
  hidePeriod?: boolean;
  hideDepartment?: boolean;
  hideExport?: boolean;
}

export function AppHeader({
  title,
  subtitle,
  moduleSlug,
  hidePeriod = false,
  hideDepartment = false,
  hideExport = false,
}: Props) {
  const { maintenance } = useMaintenance();
  const { filters, setFilters, monthOptions } = useFilters();
  const allowMonthFilter = moduleSlug === "vulnerabilidades";
  const { data: departments } = useDepartments();
  const { isAdmin, isAnyModuleAdmin } = usePermissions();
  const canFilterDepartment = isAdmin; // apenas admin global vê o filtro de departamento

  const hasFilters = !hidePeriod || !hideDepartment;
  const { setNavOpen, setSearchOpen } = useShellState();
  const { theme, setTheme } = useTheme();
  const group = (moduleSlug && MODULE_BY_SLUG[moduleSlug]?.group) || subtitle;

  const fetchFilterDefault = useServerFn(getModuleFilterDefault);
  const saveFilterDefaultFn = useServerFn(saveModuleFilterDefault);
  const qc = useQueryClient();

  const filterDefaultQuery = useQuery({
    queryKey: ["module-filter-default", moduleSlug],
    queryFn: () => fetchFilterDefault({ data: { module: moduleSlug! } }),
    enabled: !!moduleSlug && !hidePeriod,
    staleTime: Infinity,
  });

  // Departamento nunca é salvo por módulo — ao trocar de módulo, sempre volta para "Todos"
  // (evita que a seleção de um módulo "vaze" para os outros).
  const deptResetForModuleRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!moduleSlug || deptResetForModuleRef.current === moduleSlug) return;
    deptResetForModuleRef.current = moduleSlug;
    setFilters({ departmentId: "all" });
  }, [moduleSlug, setFilters]);

  // Período: ao entrar no módulo, aplica o padrão salvo (se existir) ou volta ao
  // baseline "Todos os períodos" — nunca herda o período deixado por outro módulo.
  const appliedForModuleRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!moduleSlug || hidePeriod) return;
    if (!filterDefaultQuery.data?.ok) return;
    if (appliedForModuleRef.current === moduleSlug) return;
    appliedForModuleRef.current = moduleSlug;
    const def = filterDefaultQuery.data.filterDefault;
    setFilters({
      period: def?.period ?? "all",
      customFrom: def?.customFrom ?? undefined,
      customTo: def?.customTo ?? undefined,
    });
  }, [moduleSlug, hidePeriod, filterDefaultQuery.data, setFilters]);

  const saveFilterDefaultMutation = useMutation({
    mutationFn: () =>
      saveFilterDefaultFn({
        data: {
          module: moduleSlug!,
          period: filters.period,
          customFrom: filters.customFrom,
          customTo: filters.customTo,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Período salvo como padrão deste módulo");
        qc.invalidateQueries({ queryKey: ["module-filter-default", moduleSlug] });
      } else {
        toast.error("Não foi possível salvar o padrão");
      }
    },
    onError: () => toast.error("Não foi possível salvar o padrão"),
  });

  // Classes compartilhadas pelos controles do cabeçalho (interface v2)
  const ctl =
    "h-8 inline-flex items-center gap-1.5 px-2.5 text-[12.5px] text-v2-fg bg-v2-surface border border-v2-line rounded-lg hover:bg-v2-hover hover:border-v2-line-strong transition-colors disabled:opacity-50";
  const lbl = "text-[12px] text-v2-fg-3 hidden xl:inline";

  return (
    <>
      {/* Banner de manutenção — visível para todos quando ativo */}
      {maintenance.active && (
        <div className="font-ui sticky top-0 z-20 flex items-center justify-center gap-2 h-9 px-4 bg-v2-high text-v2-accent-ink">
          <Wrench className="size-4 shrink-0" />
          <span className="text-[13px] font-semibold">Ambiente em manutenção</span>
          {maintenance.activated_by && (
            <span className="text-[12px] opacity-80">· ativado por {maintenance.activated_by}</span>
          )}
        </div>
      )}
      <header
        className="font-ui min-h-[52px] py-2 border-b border-v2-line bg-v2-bg/90 backdrop-blur sticky z-10 flex items-center gap-3 px-4 lg:px-6 flex-wrap"
        style={{ top: maintenance.active ? "36px" : 0 }}
      >
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="lg:hidden size-8 grid place-items-center rounded-lg text-v2-fg-2 hover:bg-v2-hover hover:text-v2-fg"
          aria-label="Abrir menu"
        >
          <Menu className="size-[18px]" />
        </button>

        <nav aria-label="Trilha" className="flex items-center gap-1.5 min-w-0 text-[13px]">
          {group && (
            <>
              <span className="text-v2-fg-3 hidden sm:inline">{group}</span>
              <ChevronRight className="size-3.5 text-v2-fg-3 shrink-0 hidden sm:inline" />
            </>
          )}
          <h1 className="text-v2-fg font-semibold truncate text-[14px]">{title}</h1>
        </nav>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {hasFilters && !hidePeriod && (
            <div className="flex items-center gap-2">
              <span className={lbl}>Período</span>
              <Select
                value={filters.period}
                onValueChange={(v) => setFilters({ period: v as PeriodKey })}
              >
                <SelectTrigger className="h-8 w-[168px] text-[12.5px] bg-v2-surface border-v2-line text-v2-fg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="60d">Últimos 60 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  {allowMonthFilter && <SelectItem value="months">Por mês</SelectItem>}
                </SelectContent>
              </Select>
              {filters.period === "months" && allowMonthFilter && (
                <Popover>
                  <PopoverTrigger className={ctl}>
                    <Calendar className="size-3.5" />
                    {filters.selectedMonths?.length
                      ? `${filters.selectedMonths.length} mês(es)`
                      : "Selecionar meses"}
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 space-y-1 max-h-72 overflow-y-auto">
                    {monthOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-2">
                        Nenhum mês com dados encontrado.
                      </p>
                    )}
                    {monthOptions.map((opt) => {
                      const checked = filters.selectedMonths?.includes(opt.value) ?? false;
                      return (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const current = filters.selectedMonths ?? [];
                              const next = v
                                ? [...current, opt.value]
                                : current.filter((m) => m !== opt.value);
                              setFilters({ selectedMonths: next });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              )}
              {filters.period === "custom" && (
                <Popover>
                  <PopoverTrigger className={ctl}>
                    <Calendar className="size-3.5" />
                    {filters.customFrom && filters.customTo
                      ? `${filters.customFrom} → ${filters.customTo}`
                      : "Selecionar datas"}
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground">De</label>
                      <Input
                        type="date"
                        value={filters.customFrom ?? ""}
                        onChange={(e) => setFilters({ customFrom: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Até</label>
                      <Input
                        type="date"
                        value={filters.customTo ?? ""}
                        onChange={(e) => setFilters({ customTo: e.target.value })}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {/* Salvar período como padrão do módulo (indisponível no modo "Por mês", que não é persistido) */}
              {moduleSlug && filters.period !== "months" && (
                <button
                  type="button"
                  onClick={() => saveFilterDefaultMutation.mutate()}
                  disabled={saveFilterDefaultMutation.isPending}
                  title="Salvar período como padrão deste módulo"
                  aria-label="Salvar período como padrão deste módulo"
                  className={`${ctl} w-8 justify-center px-0`}
                >
                  <Save className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {hasFilters && !hideDepartment && canFilterDepartment && (
            <div className="flex items-center gap-2">
              <span className={lbl}>Departamento</span>
              <Select
                value={filters.departmentId}
                onValueChange={(v) => setFilters({ departmentId: v })}
              >
                <SelectTrigger className="h-8 w-[190px] text-[12.5px] bg-v2-surface border-v2-line text-v2-fg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os departamentos</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!hideExport && canFilterDepartment && (
            <button
              type="button"
              className="h-8 inline-flex items-center gap-1.5 px-3 text-[12.5px] font-medium rounded-lg bg-v2-accent text-v2-accent-ink hover:brightness-110 transition"
            >
              <Download className="size-3.5" /> Exportar
            </button>
          )}

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={`${ctl} text-v2-fg-3 md:w-[220px]`}
            aria-label="Buscar módulo"
          >
            <Search className="size-3.5" />
            <span className="hidden md:inline">Buscar módulo</span>
            <kbd className="hidden md:inline ml-auto font-data text-[11px] px-1.5 border border-v2-line rounded">
              ⌘K
            </kbd>
          </button>

          <div
            role="group"
            aria-label="Tema"
            className="h-8 inline-flex items-center p-0.5 gap-0.5 bg-v2-bg border border-v2-line rounded-lg"
          >
            {(
              [
                ["dark", "Escuro", Moon],
                ["light", "Claro", Sun],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                title={`Tema ${label.toLowerCase()}`}
                className={`h-full inline-flex items-center gap-1.5 px-2.5 rounded-md text-[12.5px] transition-colors ${
                  theme === value
                    ? "bg-v2-surface text-v2-fg shadow-[0_0_0_1px_var(--v2-line)]"
                    : "text-v2-fg-2 hover:text-v2-fg"
                }`}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>
    </>
  );
}
