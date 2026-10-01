import * as React from "react";

export type PeriodKey = "all" | "30d" | "60d" | "90d" | "custom" | "months";

export type MonthOption = { value: string; label: string }; // value: "YYYY-MM"

export type GlobalFilters = {
  period: PeriodKey;
  customFrom?: string; // ISO date
  customTo?: string; // ISO date
  departmentId: string | "all";
  selectedMonths?: string[]; // "YYYY-MM", usado quando period === "months"
};

type Ctx = {
  filters: GlobalFilters;
  setFilters: (f: Partial<GlobalFilters>) => void;
  dateRange: { from: Date; to: Date };
  // Opções de mês disponíveis para o filtro "Por mês" — publicadas pelo módulo
  // ativo (ex: Vulnerabilidades) já que o AppHeader não conhece os dados do módulo.
  monthOptions: MonthOption[];
  setMonthOptions: (opts: MonthOption[]) => void;
};

const FiltersContext = React.createContext<Ctx | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setState] = React.useState<GlobalFilters>({
    period: "all",
    departmentId: "all",
  });
  const [monthOptions, setMonthOptions] = React.useState<MonthOption[]>([]);

  const setFilters = (f: Partial<GlobalFilters>) => setState((prev) => ({ ...prev, ...f }));

  const dateRange = React.useMemo(() => {
    const to = filters.period === "custom" && filters.customTo ? new Date(filters.customTo) : new Date();
    let from: Date;
    if (filters.period === "all" || filters.period === "months") {
      from = new Date(0);
    } else if (filters.period === "custom" && filters.customFrom) {
      from = new Date(filters.customFrom);
    } else {
      const days = filters.period === "60d" ? 60 : filters.period === "90d" ? 90 : 30;
      from = new Date();
      from.setDate(from.getDate() - days);
    }
    return { from, to };
  }, [filters]);

  return (
    <FiltersContext.Provider value={{ filters, setFilters, dateRange, monthOptions, setMonthOptions }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = React.useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}
