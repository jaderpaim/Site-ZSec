import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Panel } from "../primitives";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { listFornecedores } from "@/lib/fornecedores.functions";
import type { FornecedorRow } from "./FornecedorDialog";

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysToExpire(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  const target = new Date(Date.UTC(y, m - 1, day));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((target.getTime() - todayUtc) / 86400000);
}

export function FornecedoresDashboardTab() {
  const fetchList = useServerFn(listFornecedores);
  const { data, isLoading } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: () => fetchList() as Promise<FornecedorRow[]>,
  });

  const [search, setSearch] = React.useState("");
  const rows = React.useMemo(() => {
    const list = data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.nome.toLowerCase().includes(s) ||
        r.servico_prestado.toLowerCase().includes(s),
    );
  }, [data, search]);

  return (
    <Panel
      title={`Fornecedores (${rows.length})`}
      action={
        <div className="relative w-64">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou serviço"
            className="pl-8 h-8"
          />
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhum fornecedor cadastrado.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-mono-xs text-muted-foreground border-b border-border">
              <th className="text-left p-2">Nome</th>
              <th className="text-left p-2">Serviço prestado</th>
              <th className="text-left p-2">Data de contratação</th>
              <th className="text-left p-2">Data de expiração</th>
              <th className="text-right p-2">Dias p/ vencer</th>
              <th className="text-center p-2">Alerta (dias)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const days = daysToExpire(r.data_expiracao);
              const daysCls =
                days === null ? "text-muted-foreground"
                : days < 0 ? "text-danger font-semibold"
                : days <= (r.alert_days ?? 30) ? "text-danger font-semibold"
                : days <= 60 ? "text-warning font-medium"
                : "text-foreground";
              return (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="p-2 font-medium">{r.nome}</td>
                  <td className="p-2 text-muted-foreground">{r.servico_prestado}</td>
                  <td className="p-2 font-mono text-xs">{fmtDate(r.data_contratacao)}</td>
                  <td className="p-2 font-mono text-xs">{fmtDate(r.data_expiracao)}</td>
                  <td className={`p-2 font-mono text-xs text-right ${daysCls}`}>
                    {days === null ? "—" : days < 0 ? `Vencido há ${Math.abs(days)}d` : `${days}d`}
                  </td>
                  <td className="p-2 text-center text-xs">{r.alert_days ?? 30}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
