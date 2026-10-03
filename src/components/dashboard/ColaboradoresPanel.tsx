import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Trash2 } from "lucide-react";
import { useDepartments } from "@/lib/use-departments";
import { usePermissions } from "@/lib/use-permissions";
import { useAuth } from "@/lib/auth-context";

const MODULE = "departamentos";

export type Colab = {
  id: string;
  display_name: string;
  email: string;
  unidade: string | null;
  department_id: string | null;
  cargo: string | null;
};

export const NO_DEPT = "__none";

/**
 * Colaboradores visíveis para o usuário: admin/admin do módulo/"manage" veem
 * todos; os demais só os do próprio departamento (regra de antes, mantida).
 */
export function useVisibleColaboradores() {
  const { user } = useAuth();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canViewAll = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "manage");

  const { data: myDepartmentId } = useQuery({
    queryKey: ["my-profile-dept", user?.id],
    enabled: !!user && !canViewAll,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("department_id")
        .eq("id", user!.id)
        .maybeSingle();
      return (data?.department_id as string | null) ?? null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: async (): Promise<Colab[]> => {
      const PAGE = 1000;
      const all: Colab[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("colaboradores")
          .select("id, display_name, email, unidade, department_id, cargo")
          .order("display_name")
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Colab[]));
        if (data.length < PAGE) break;
        page++;
      }
      return all;
    },
  });

  const rows = React.useMemo(
    () =>
      canViewAll
        ? (data ?? [])
        : (data ?? []).filter((c) => c.department_id === (myDepartmentId ?? null)),
    [data, canViewAll, myDepartmentId],
  );
  return { rows, isLoading, canViewAll };
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Aba "Colaboradores" do módulo Departamentos (CSS vem do DepartamentosDashboard). */
export function ColaboradoresPanel({
  rows,
  deptFilter,
  onDeptFilter,
  createOpen,
  onCreateOpenChange,
}: {
  rows: Colab[];
  deptFilter: string;
  onDeptFilter: (v: string) => void;
  createOpen: boolean;
  onCreateOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canDelete =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");
  const canViewAll = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "manage");
  const { data: depts } = useDepartments();

  const [search, setSearch] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [confirmDel, setConfirmDel] = React.useState<Colab | null>(null);
  const [form, setForm] = React.useState({
    display_name: "",
    email: "",
    unidade: "",
    department_id: "",
    cargo: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("colaboradores").insert({
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
        unidade: form.unidade.trim() || null,
        department_id: form.department_id || null,
        cargo: form.cargo.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador adicionado");
      setForm({ display_name: "", email: "", unidade: "", department_id: "", cargo: "" });
      onCreateOpenChange(false);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["ia-ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("colaboradores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador removido");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deptNameById = React.useMemo(
    () => new Map((depts ?? []).map((d) => [d.id, d.name])),
    [depts],
  );
  const units = React.useMemo(
    () =>
      [...new Set(rows.map((c) => c.unidade).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );
  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    (c) =>
      (!deptFilter ||
        (deptFilter === NO_DEPT ? !c.department_id : c.department_id === deptFilter)) &&
      (!unit || c.unidade === unit) &&
      (!q || `${c.display_name} ${c.email} ${c.cargo ?? ""}`.toLowerCase().includes(q)),
  );

  const closeCreate = () => {
    onCreateOpenChange(false);
    setForm({ display_name: "", email: "", unidade: "", department_id: "", cargo: "" });
  };

  return (
    <>
      <div className="dp-tbar">
        <b>
          Colaboradores{" "}
          <span>
            (
            {filtered.length === rows.length ? rows.length : `${filtered.length} de ${rows.length}`}
            )
          </span>
        </b>
        {canViewAll && (
          <select
            className="dp-select"
            aria-label="Departamento"
            value={deptFilter}
            onChange={(e) => onDeptFilter(e.target.value)}
          >
            <option value="">Todos os departamentos</option>
            <option value={NO_DEPT}>Sem departamento</option>
            {(depts ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {units.length > 1 && (
          <select
            className="dp-select"
            aria-label="Unidade"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">Todas as unidades</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <label className="dp-search">
          <Search size={14} />
          <input
            placeholder="Buscar nome, e-mail ou cargo"
            aria-label="Buscar colaboradores"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="dp-empty">
          {rows.length === 0
            ? 'Nenhum colaborador cadastrado. Use "Novo colaborador" ou importe via Importar dados.'
            : "Nenhum colaborador com esses filtros."}
        </div>
      ) : (
        <div className="dp-scroll">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Departamento</th>
                <th>Cargo</th>
                <th>Unidade</th>
                {canDelete && (
                  <th>
                    <span style={{ fontSize: 0 }}>Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="dp-who">
                      <span className="dp-av">{initials(c.display_name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <b>{c.display_name}</b>
                        <small>{c.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {c.department_id ? (
                      (deptNameById.get(c.department_id) ?? "—")
                    ) : (
                      <span
                        className="dp-pill"
                        style={{ "--c": "var(--v2-med)" } as React.CSSProperties}
                      >
                        Sem departamento
                      </span>
                    )}
                  </td>
                  <td>{c.cargo ?? <span className="dp-dim">—</span>}</td>
                  <td className="dp-dim">{c.unidade ?? "—"}</td>
                  {canDelete && (
                    <td>
                      <div className="dp-row-act">
                        <button
                          className="dp-icon-btn danger"
                          title="Remover"
                          aria-label="Remover"
                          onClick={() => setConfirmDel(c)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dp-foot">
        Para carga em lote use Importar dados.
        {!canViewAll && " Você vê só os colaboradores do seu departamento."}
      </p>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => (o ? onCreateOpenChange(true) : closeCreate())}
      >
        <DialogContent className="font-ui sm:max-w-lg" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Novo colaborador</DialogTitle>
          </DialogHeader>
          <form
            className="dp-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.display_name.trim() || !form.email.trim()) {
                toast.error("Nome e e-mail são obrigatórios");
                return;
              }
              create.mutate();
            }}
          >
            <div className="dp-row2">
              <div className="dp-field">
                <label htmlFor="col-nome">Nome</label>
                <input
                  id="col-nome"
                  className="dp-input"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  required
                />
              </div>
              <div className="dp-field">
                <label htmlFor="col-email">E-mail</label>
                <input
                  id="col-email"
                  type="email"
                  className="dp-input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="dp-row2">
              <div className="dp-field">
                <label htmlFor="col-dept">Departamento</label>
                <select
                  id="col-dept"
                  className="dp-input"
                  value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                >
                  <option value="">Sem departamento</option>
                  {(depts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dp-field">
                <label htmlFor="col-cargo">Cargo</label>
                <input
                  id="col-cargo"
                  className="dp-input"
                  value={form.cargo}
                  onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                />
              </div>
            </div>
            <div className="dp-field">
              <label htmlFor="col-unid">Unidade</label>
              <input
                id="col-unid"
                className="dp-input"
                value={form.unidade}
                onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
              />
            </div>
            <DialogFooter style={{ gap: 8, paddingTop: 4 }}>
              <button type="button" className="dp-btn ghost" onClick={closeCreate}>
                Cancelar
              </button>
              <button type="submit" className="dp-btn primary" disabled={create.isPending}>
                {create.isPending && <Loader2 size={13} className="animate-spin" />} Adicionar
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              Remover colaborador?
            </DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            <b style={{ color: "var(--v2-fg)" }}>{confirmDel?.display_name}</b> ({confirmDel?.email}
            ) será removido do cadastro. Não dá para desfazer.
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="dp-btn ghost"
              onClick={() => setConfirmDel(null)}
              disabled={remove.isPending}
            >
              Cancelar
            </button>
            <button
              className="dp-btn danger"
              disabled={remove.isPending}
              onClick={() => confirmDel && remove.mutate(confirmDel.id)}
            >
              {remove.isPending && <Loader2 size={13} className="animate-spin" />} Remover
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};
