import * as React from "react";
import { useMaintenance } from "@/lib/use-maintenance";
import { Wrench } from "lucide-react";
import { Download, Calendar, Save } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters, type PeriodKey } from "@/lib/filters-context";
import { Checkbox } from "@/components/ui/checkbox";
import { useDepartments } from "@/lib/use-departments";
import { usePermissions } from "@/lib/use-permissions";
import { getModuleFilterDefault, saveModuleFilterDefault } from "@/lib/filter-defaults.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  return (
    <>
      {/* Banner de manutenção — visível para todos quando ativo */}
      {maintenance.active && (
        <div
          className="sticky top-0 z-20 flex items-center justify-center gap-2 py-2 px-4"
          style={{ background: "#ea580c" }}
        >
          <Wrench className="size-4 text-white shrink-0" />
          <span className="text-sm font-semibold text-white tracking-wide">AMBIENTE EM MANUTENÇÃO</span>
          {maintenance.activated_by && (
            <span className="text-xs text-orange-200 ml-1">— ativado por {maintenance.activated_by}</span>
          )}
        </div>
      )}
      <header
        className="h-16 border-b border-border bg-surface/40 backdrop-blur sticky z-10 flex items-center justify-between px-8"
        style={{ top: maintenance.active ? "36px" : 0 }}
      >
        <div className="flex items-center gap-6 min-w-0">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="flex items-center justify-center text-mono-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>

          {hasFilters && <div className="h-6 w-px bg-border" />}

          {hasFilters && (
            <div className="flex items-center gap-3">
              {/* Salvar período como padrão do módulo (indisponível no modo "Por mês", que não é persistido) */}
              {!hidePeriod && moduleSlug && filters.period !== "months" && (
                <button
                  onClick={() => saveFilterDefaultMutation.mutate()}
                  disabled={saveFilterDefaultMutation.isPending}
                  title="Salvar período como padrão deste módulo"
                  className="h-8 px-2 inline-flex items-center gap-1.5 text-xs bg-surface border border-border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <Save className="size-3.5" />
                </button>
              )}

              {/* Período */}
              {!hidePeriod && (
                <div className="flex items-center gap-2">
                  <span className="text-mono-xs text-muted-foreground">Período</span>
                  <Select value={filters.period} onValueChange={(v) => setFilters({ period: v as PeriodKey })}>
                    <SelectTrigger className="h-8 w-[170px] text-xs bg-surface">
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
                      <PopoverTrigger className="h-8 px-2 inline-flex items-center gap-1.5 text-xs bg-surface border border-border rounded-md hover:bg-accent">
                        <Calendar className="size-3.5" />
                        {filters.selectedMonths?.length
                          ? `${filters.selectedMonths.length} mês(es)`
                          : "Selecionar meses"}
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2 space-y-1 max-h-72 overflow-y-auto">
                        {monthOptions.length === 0 && (
                          <p className="text-mono-xs text-muted-foreground px-1 py-2">
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
                                  const next = v ? [...current, opt.value] : current.filter((m) => m !== opt.value);
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
                      <PopoverTrigger className="h-8 px-2 inline-flex items-center gap-1.5 text-xs bg-surface border border-border rounded-md hover:bg-accent">
                        <Calendar className="size-3.5" />
                        {filters.customFrom && filters.customTo
                          ? `${filters.customFrom} → ${filters.customTo}`
                          : "Selecionar"}
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3 space-y-2">
                        <div>
                          <label className="text-mono-xs text-muted-foreground">De</label>
                          <Input
                            type="date"
                            value={filters.customFrom ?? ""}
                            onChange={(e) => setFilters({ customFrom: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-mono-xs text-muted-foreground">Até</label>
                          <Input
                            type="date"
                            value={filters.customTo ?? ""}
                            onChange={(e) => setFilters({ customTo: e.target.value })}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              {/* Departamento */}
              {!hideDepartment && canFilterDepartment && (
                <div className="flex items-center gap-2">
                  <span className="text-mono-xs text-muted-foreground">Departamento</span>
                  <Select value={filters.departmentId} onValueChange={(v) => setFilters({ departmentId: v })}>
                    <SelectTrigger className="h-8 w-[200px] text-xs bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {departments?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {!hideExport && canFilterDepartment && (
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:brightness-110 font-medium transition-all">
              <Download className="size-3.5" /> Exportar
            </button>
          </div>
        )}
      </header>
    </>
  );
}
