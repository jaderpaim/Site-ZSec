import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createGmud } from "@/lib/gmud.functions";
import { listDepartmentsApprovalSummary } from "@/lib/aprovadores.functions";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/use-departments";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CalendarDays, AlertTriangle, Shield } from "lucide-react";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-bg)",
  border: "var(--v2-line)",
  borderHi: "var(--v2-line-strong)",
  accent: "var(--v2-accent)",
  accentGlow: "color-mix(in oklch, var(--v2-accent) 14%, transparent)",
  success: "var(--v2-ok)",
  successBg: "color-mix(in oklch, var(--v2-ok) 12%, transparent)",
  warning: "var(--v2-med)",
  warningBg: "color-mix(in oklch, var(--v2-med) 10%, transparent)",
  danger: "var(--v2-crit)",
  dangerBg: "color-mix(in oklch, var(--v2-crit) 10%, transparent)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
};

type FormErrors = Partial<Record<string, string>>;

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  .gng-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:18px; padding-top:4px; }
  .gng-root * { box-sizing:border-box; }
  .gng-root ::-webkit-scrollbar { width:6px; height:6px; }
  .gng-root ::-webkit-scrollbar-track { background:transparent; }
  .gng-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  @keyframes gng-spin { to{transform:rotate(360deg)} }
  .gng-spin { animation:gng-spin 0.75s linear infinite; }

  /* seção: só um título discreto com linha, sem caixa dentro de caixa */
  .gng-sec { display:grid; gap:12px; }
  .gng-sec-hd { display:flex; align-items:center; gap:7px; padding-bottom:6px; border-bottom:1px solid var(--v2-line); font-size:12px; font-weight:500; color:var(--v2-fg-3); }
  .gng-sec-body { display:flex; flex-direction:column; gap:12px; }

  /* campo */
  .gng-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
  .gng-label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); display:flex; align-items:center; gap:4px; }
  .gng-label .req { color:var(--v2-crit); }
  .gng-err-msg { font-size:12px; color:color-mix(in oklch, var(--v2-crit) 80%, var(--v2-fg)); }

  /* entradas */
  .gng-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-family:inherit; font-size:13px; outline:none; transition:border-color .15s, box-shadow .15s; }
  .gng-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .gng-input::placeholder { color:var(--v2-fg-3); }
  .gng-input.error { border-color:color-mix(in oklch, var(--v2-crit) 60%, transparent); }
  .gng-root textarea { background:var(--v2-bg) !important; border-color:var(--v2-line) !important; color:var(--v2-fg) !important; font-family:inherit !important; font-size:13px !important; border-radius:8px !important; }
  .gng-root textarea:focus { border-color:var(--v2-accent) !important; box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent) !important; outline:none !important; }
  .gng-root textarea.error { border-color:color-mix(in oklch, var(--v2-crit) 60%, transparent) !important; }
  .gng-root textarea::placeholder { color:var(--v2-fg-3) !important; }

  /* data e hora */
  .gng-dt-wrap { position:relative; }
  .gng-dt-icon { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:var(--v2-fg-3); cursor:pointer; background:none; border:none; padding:0; display:flex; align-items:center; }
  .gng-dt-icon:hover { color:var(--v2-fg); }
  input[type="datetime-local"].gng-input { padding-right:36px; }
  input[type="datetime-local"].gng-input::-webkit-calendar-picker-indicator { opacity:0; position:absolute; right:0; width:36px; height:100%; cursor:pointer; }

  .gng-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .gng-col-2 { grid-column:span 2; }
  @media (max-width: 560px) { .gng-grid-2 { grid-template-columns:1fr; } .gng-col-2 { grid-column:auto; } }

  /* avisos */
  .gng-warn { background:color-mix(in oklch, var(--v2-med) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); border-radius:8px; padding:10px 12px; }
  .gng-warn-title { font-size:13px; font-weight:600; color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); margin-bottom:4px; }
  .gng-warn-body { font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }

  /* departamentos */
  .gng-dept-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:6px; max-height:240px; overflow-y:auto; }
  .gng-dept-item { display:flex; align-items:center; gap:9px; min-height:36px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; cursor:pointer; }
  .gng-dept-item:hover { background:var(--v2-hover); }
  .gng-dept-item:has([data-state="checked"]) { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }
  .gng-dept-name { font-size:13px; color:var(--v2-fg); flex:1; }
  .gng-dept-tag { font:500 11px var(--font-data); color:var(--v2-accent); }

  .gng-danger-box { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 35%, transparent); border-radius:8px; padding:10px 12px; }
  .gng-danger-title { font-size:13px; font-weight:600; color:color-mix(in oklch, var(--v2-crit) 80%, var(--v2-fg)); margin-bottom:4px; }
  .gng-danger-body { font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }

  .gng-err-box { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 30%, transparent); border-radius:8px; padding:10px 12px; }
  .gng-err-box-title { font-size:13px; font-weight:600; color:color-mix(in oklch, var(--v2-crit) 80%, var(--v2-fg)); margin-bottom:6px; }
  .gng-err-box ul { list-style:disc; padding-left:18px; display:flex; flex-direction:column; gap:2px; }
  .gng-err-box li { font-size:12.5px; color:var(--v2-fg-2); }

  /* rodapé fixo enquanto os campos rolam */
  .gng-footer { position:sticky; bottom:-24px; display:flex; justify-content:flex-end; gap:8px; padding:14px 0 4px; margin-bottom:-4px; border-top:1px solid var(--v2-line); background:var(--v2-surface); z-index:1; }

  .gng-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; }
  .gng-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .gng-btn.primary { background:var(--v2-accent); border:1px solid var(--v2-accent); color:var(--v2-accent-ink); }
  .gng-btn.primary:hover:not(:disabled) { filter:brightness(1.08); }
  .gng-btn.outline { background:transparent; border:1px solid transparent; color:var(--v2-fg-2); }
  .gng-btn.outline:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); }
`;

// ── DateTimePicker — UNCHANGED logic ──────────────────────────────────────────
function DateTimePicker({
  value,
  onChange,
  error,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  id: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="gng-field">
      <div className="gng-dt-wrap">
        <input
          ref={ref}
          id={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`gng-input${error ? " error" : ""}`}
        />
        <button type="button" tabIndex={-1} className="gng-dt-icon" onClick={() => ref.current?.showPicker?.()}>
          <CalendarDays size={15} />
        </button>
      </div>
      {error && <span className="gng-err-msg">{error}</span>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="gng-sec">
      <div className="gng-sec-hd">
        {Icon && <Icon size={10} />}
        {title}
      </div>
      <div className="gng-sec-body">{children}</div>
    </div>
  );
}

// ── Field wrapper ──────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gng-field" data-error={!!error}>
      <span className="gng-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {error && <span className="gng-err-msg">{error}</span>}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function NewGmudDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // ── back-end UNCHANGED ───────────────────────────────────────────────────
  const { user } = useAuth();
  const qc = useQueryClient();
  const submit = useServerFn(createGmud);
  const fetchDeptSummary = useServerFn(listDepartmentsApprovalSummary);
  const { data: depts } = useDepartments();

  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [titulo, setTitulo] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [justificativa, setJustificativa] = React.useState("");
  const [tipo, setTipo] = React.useState<"Normal" | "Prioritária" | "Emergencial">("Normal");
  const [impacto, setImpacto] = React.useState<"Baixo" | "Médio" | "Alto" | "Crítico">("Médio");
  const [dataInicio, setDataInicio] = React.useState("");
  const [dataFim, setDataFim] = React.useState("");
  const [planoExec, setPlanoExec] = React.useState("");
  const [planoRollback, setPlanoRollback] = React.useState("");
  // Ordem de seleção importa: o 1º departamento marcado é o principal
  // (gmuds.department_id); os demais entram como extra_department_ids, na
  // ordem em que foram marcados.
  const [selectedDeptIds, setSelectedDeptIds] = React.useState<string[]>([]);

  // Resumo enxuto (contagem + "sou eu") por departamento — não exige a
  // permissão "aprovadores:view", então funciona pra qualquer um que possa
  // criar GMUD, mesmo sem acesso ao módulo de Aprovadores.
  const { data: deptSummary } = useQuery({
    queryKey: ["aprovadores-dept-summary"],
    queryFn: () => fetchDeptSummary(),
  });
  const summaryByDept = React.useMemo(() => {
    const m = new Map<string, { count: number; includesMe: boolean }>();
    for (const s of deptSummary ?? []) m.set(s.department_id, { count: s.count, includesMe: s.includesMe });
    return m;
  }, [deptSummary]);

  // Janela de início a 24h ou menos torna o tipo obrigatoriamente Emergencial
  // (sem opção de escolha) — mudanças com prazo tão curto não comportam o
  // fluxo normal de revisão.
  const isUrgentWindow = React.useMemo(() => {
    if (!dataInicio) return false;
    return new Date(dataInicio).getTime() - Date.now() <= 24 * 60 * 60 * 1000;
  }, [dataInicio]);
  React.useEffect(() => {
    if (isUrgentWindow) setTipo("Emergencial");
  }, [isUrgentWindow]);

  const requiresGerenciaTI = tipo === "Emergencial" || impacto === "Crítico";
  const gerenciaTI = React.useMemo(
    () =>
      (depts ?? []).find(
        (d) => d.name.toLowerCase().includes("gerência de ti") || d.name.toLowerCase().includes("gerencia de ti"),
      ),
    [depts],
  );
  const gerenciaTIId = gerenciaTI?.id ?? null;

  // Cadeia final = departamentos selecionados + Gerência de TI (se obrigatória
  // e ainda não estiver entre os selecionados), na ordem em que serão
  // processados pelo backend.
  const finalDeptIds = React.useMemo(() => {
    const ids = [...selectedDeptIds];
    if (requiresGerenciaTI && gerenciaTIId && !ids.includes(gerenciaTIId)) ids.push(gerenciaTIId);
    return ids;
  }, [selectedDeptIds, requiresGerenciaTI, gerenciaTIId]);

  // Detecta se o próprio criador é aprovador de algum departamento da cadeia
  // final — um aprovador não pode aprovar a própria GMUD.
  const creatorIsApprover = finalDeptIds.some((id) => summaryByDept.get(id)?.includesMe);

  function toggleDept(id: string, checked: boolean) {
    setSelectedDeptIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    clearError("departmentId");
    clearError("creatorConflict");
  }

  function reset() {
    setTitulo("");
    setDescricao("");
    setJustificativa("");
    setTipo("Normal");
    setImpacto("Médio");
    setDataInicio("");
    setDataFim("");
    setPlanoExec("");
    setPlanoRollback("");
    setSelectedDeptIds([]);
    setErrors({});
  }
  function clearError(field: string) {
    setErrors((p) => {
      const n = { ...p };
      delete n[field];
      return n;
    });
  }

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!titulo.trim()) e.titulo = "Título é obrigatório";
    if (!descricao.trim()) e.descricao = "Descrição é obrigatória";
    if (!justificativa.trim()) e.justificativa = "Justificativa é obrigatória";
    if (!dataInicio) e.dataInicio = "Data de início é obrigatória";
    if (!dataFim) e.dataFim = "Data de fim é obrigatória";
    if (dataInicio && dataFim && new Date(dataFim) <= new Date(dataInicio))
      e.dataFim = "Data de fim deve ser após o início";
    if (!planoExec.trim()) e.planoExec = "Plano de execução é obrigatório";
    if (!planoRollback.trim()) e.planoRollback = "Plano de rollback é obrigatório";
    if (selectedDeptIds.length === 0) e.departmentId = "Selecione ao menos um departamento";
    else if (deptSummary) {
      const semAprovador = finalDeptIds.filter((id) => (summaryByDept.get(id)?.count ?? 0) === 0);
      if (semAprovador.length > 0) {
        const nomes = semAprovador.map((id) => (depts ?? []).find((d) => d.id === id)?.name ?? id).join(", ");
        e.departmentId = `Sem aprovador cadastrado: ${nomes}`;
      }
    }
    if (requiresGerenciaTI && !gerenciaTIId) e.gerenciaTI = "Departamento 'Gerência de TI' não encontrado no sistema";
    if (selectedDeptIds.length > 0 && deptSummary && creatorIsApprover) {
      e.creatorConflict =
        "Você é aprovador de um dos departamentos selecionados — um aprovador não pode aprovar a própria GMUD.";
    }
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setTimeout(() => {
        document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setLoading(true);
    try {
      await submit({
        data: {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          justificativa: justificativa.trim() || null,
          tipo,
          impacto,
          data_inicio: dataInicio ? new Date(dataInicio).toISOString() : null,
          data_fim: dataFim ? new Date(dataFim).toISOString() : null,
          plano_execucao: planoExec.trim() || null,
          plano_rollback: planoRollback.trim() || null,
          department_id: selectedDeptIds[0],
          extra_department_ids: [
            ...selectedDeptIds.slice(1),
            ...(requiresGerenciaTI && gerenciaTIId && !selectedDeptIds.includes(gerenciaTIId) ? [gerenciaTIId] : []),
          ],
          criado_por: user?.id ?? null,
          criado_por_email: user?.email ?? null,
        },
      });
      toast.success("GMUD criada e enviada para aprovação");
      reset();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["gmuds"] });
      qc.invalidateQueries({ queryKey: ["gmud-metrics"] });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar GMUD");
    } finally {
      setLoading(false);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const selectStyle = {
    background: T.surfaceAlt,
    borderColor: T.border,
    color: T.textPrimary,
        fontSize: 13,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="font-ui max-w-3xl max-h-[90dvh] overflow-y-auto"
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12, color: T.textPrimary }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}
          >
            Nova GMUD
          </DialogTitle>
        </DialogHeader>

        <div className="gng-root">
          <style dangerouslySetInnerHTML={{ __html: CSS }} />

          {/* ── Informações básicas ──────────────────────────────────── */}
          <Section title="Informações básicas" icon={Shield}>
            <div className="gng-grid-2">
              <div className="gng-col-2">
                <Field label="Título" required error={errors.titulo}>
                  <input
                    className={`gng-input${errors.titulo ? " error" : ""}`}
                    value={titulo}
                    onChange={(e) => {
                      setTitulo(e.target.value);
                      clearError("titulo");
                    }}
                    placeholder="Ex: Atualização do banco de dados produção"
                  />
                </Field>
              </div>

              <div className="gng-col-2">
                <Field label="Descrição" required error={errors.descricao}>
                  <Textarea
                    rows={2}
                    value={descricao}
                    className={errors.descricao ? "error" : ""}
                    onChange={(e) => {
                      setDescricao(e.target.value);
                      clearError("descricao");
                    }}
                    placeholder="Descreva a mudança a ser realizada"
                  />
                </Field>
              </div>

              <div className="gng-col-2">
                <Field label="Justificativa" required error={errors.justificativa}>
                  <Textarea
                    rows={2}
                    value={justificativa}
                    className={errors.justificativa ? "error" : ""}
                    onChange={(e) => {
                      setJustificativa(e.target.value);
                      clearError("justificativa");
                    }}
                    placeholder="Por que esta mudança é necessária?"
                  />
                </Field>
              </div>

              <Field label="Tipo" required>
                <Select value={tipo} onValueChange={(v: any) => setTipo(v)} disabled={isUrgentWindow}>
                  <SelectTrigger style={selectStyle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Prioritária">Prioritária</SelectItem>
                    <SelectItem value="Emergencial">Emergencial</SelectItem>
                  </SelectContent>
                </Select>
                {isUrgentWindow && (
                  <div style={{ fontSize: 11, color: T.warning, marginTop: 4 }}>
                    ⚠ Bloqueado em Emergencial — início em 24h ou menos.
                  </div>
                )}
              </Field>

              <Field label="Impacto" required>
                <Select value={impacto} onValueChange={(v: any) => setImpacto(v)}>
                  <SelectTrigger style={selectStyle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixo">Baixo</SelectItem>
                    <SelectItem value="Médio">Médio</SelectItem>
                    <SelectItem value="Alto">Alto</SelectItem>
                    <SelectItem value="Crítico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {requiresGerenciaTI && (
                <div className="gng-col-2 gng-warn">
                  <div className="gng-warn-title">
                    <AlertTriangle size={12} style={{ display: "inline", marginRight: 5 }} />
                    Aprovação da Gerência de TI obrigatória
                  </div>
                  <div className="gng-warn-body">
                    Por ser {tipo === "Emergencial" ? "Emergencial" : ""}
                    {tipo === "Emergencial" && impacto === "Crítico" ? " e " : ""}
                    {impacto === "Crítico" ? "de Impacto Crítico" : ""}, a <strong>Gerência de TI</strong> será
                    adicionada automaticamente como <strong>última aprovação</strong> do fluxo.
                  </div>
                  {errors.gerenciaTI && (
                    <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>⚠ {errors.gerenciaTI}</div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ── Planejamento técnico ─────────────────────────────────── */}
          <Section title="Planejamento técnico">
            <Field label="Plano de execução detalhado" required error={errors.planoExec}>
              <Textarea
                rows={5}
                value={planoExec}
                className={errors.planoExec ? "error" : ""}
                onChange={(e) => {
                  setPlanoExec(e.target.value);
                  clearError("planoExec");
                }}
                placeholder="Descreva passo a passo o que será executado…"
              />
            </Field>
            <Field label="Plano de contingência / rollback" required error={errors.planoRollback}>
              <Textarea
                rows={5}
                value={planoRollback}
                className={errors.planoRollback ? "error" : ""}
                onChange={(e) => {
                  setPlanoRollback(e.target.value);
                  clearError("planoRollback");
                }}
                placeholder="O que fazer se algo der errado…"
              />
            </Field>
          </Section>

          {/* ── Janela de manutenção ─────────────────────────────────── */}
          <Section title="Janela de manutenção">
            <div className="gng-grid-2">
              <Field label="Início" required>
                <DateTimePicker
                  id="data-inicio"
                  value={dataInicio}
                  onChange={(v) => {
                    setDataInicio(v);
                    clearError("dataInicio");
                    clearError("dataFim");
                  }}
                  error={errors.dataInicio}
                />
                <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 4 }}>
                  Início em 24h ou menos define o tipo automaticamente como Emergencial.
                </div>
              </Field>
              <Field label="Fim" required>
                <DateTimePicker
                  id="data-fim"
                  value={dataFim}
                  onChange={(v) => {
                    setDataFim(v);
                    clearError("dataFim");
                  }}
                  error={errors.dataFim}
                />
              </Field>
            </div>
          </Section>

          {/* ── Departamento ─────────────────────────────────────────── */}
          <Section title="Departamento responsável pela aprovação" icon={Shield}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>
              O envio do e-mail seguirá a <strong style={{ color: T.textSecondary }}>ordem de aprovação</strong>{" "}
              definida no cadastro de aprovadores. Cadastre/edite em{" "}
              <strong style={{ color: T.textSecondary }}>Aprovadores</strong>.
            </div>
            <Field label="Departamentos" required error={errors.departmentId}>
              <div className="gng-dept-list">
                {(depts ?? [])
                  .filter((d) => (summaryByDept.get(d.id)?.count ?? 0) > 0)
                  .map((d) => {
                    const checked = selectedDeptIds.includes(d.id);
                    return (
                      <label key={d.id} className="gng-dept-item">
                        <Checkbox checked={checked} onCheckedChange={(v) => toggleDept(d.id, !!v)} />
                        <span className="gng-dept-name">{d.name}</span>
                        {checked && selectedDeptIds[0] === d.id && <span className="gng-dept-tag">principal</span>}
                      </label>
                    );
                  })}
              </div>
            </Field>

            {creatorIsApprover && (
              <div className="gng-danger-box">
                <div className="gng-danger-title">
                  <AlertTriangle size={12} style={{ display: "inline", marginRight: 5 }} />
                  Você é aprovador de um departamento selecionado
                </div>
                <div className="gng-danger-body">
                  Um aprovador não pode aprovar a própria GMUD. Remova esse departamento da seleção ou peça a um
                  administrador para revisar o cadastro de aprovadores.
                </div>
              </div>
            )}
          </Section>

          {/* ── Error summary ─────────────────────────────────────────── */}
          {Object.keys(errors).length > 0 && (
            <div className="gng-err-box">
              <div className="gng-err-box-title">Preencha os campos obrigatórios:</div>
              <ul>
                {Object.values(errors).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="gng-footer">
            <button
              className="gng-btn outline"
              disabled={loading}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancelar
            </button>
            <button className="gng-btn primary" disabled={loading} onClick={handleSubmit}>
              {loading ? (
                <>
                  <Loader2 size={12} className="gng-spin" /> Criando…
                </>
              ) : (
                "Criar GMUD"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
