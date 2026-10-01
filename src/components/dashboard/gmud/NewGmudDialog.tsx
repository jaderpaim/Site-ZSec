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
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
};

type FormErrors = Partial<Record<string, string>>;

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .gng-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; padding-top:8px; }
  .gng-root * { box-sizing:border-box; }

  .gng-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .gng-root ::-webkit-scrollbar-track { background:transparent; }
  .gng-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  @keyframes gng-spin { to{transform:rotate(360deg)} }
  .gng-spin { animation:gng-spin 0.75s linear infinite; }

  /* section */
  .gng-sec { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
  .gng-sec-hd { padding:10px 14px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; display:flex; align-items:center; gap:7px; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .gng-sec-body { padding:14px; display:flex; flex-direction:column; gap:12px; }

  /* field */
  .gng-field { display:flex; flex-direction:column; gap:4px; }
  .gng-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; display:flex; align-items:center; gap:4px; }
  .gng-label .req { color:${T.danger}; }
  .gng-err-msg { font-size:10px; color:${T.danger}; margin-top:2px; font-family:'IBM Plex Mono',monospace; }

  /* inputs */
  .gng-input {
    width:100%; padding:8px 11px; border:1px solid ${T.border}; border-radius:6px;
    background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'DM Sans',sans-serif;
    font-size:13px; outline:none; transition:border-color 0.15s, box-shadow 0.15s;
  }
  .gng-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .gng-input::placeholder { color:${T.textSubtle}; }
  .gng-input.error { border-color:rgba(239,68,68,0.5); }
  .gng-input.error:focus { box-shadow:0 0 0 2px rgba(239,68,68,0.1); }

  .gng-root textarea {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'DM Sans',sans-serif !important;
    font-size:13px !important; border-radius:6px !important;
    transition:border-color 0.15s, box-shadow 0.15s !important;
  }
  .gng-root textarea:focus { border-color:rgba(59,130,246,0.5) !important; box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important; outline:none !important; }
  .gng-root textarea.error { border-color:rgba(239,68,68,0.5) !important; }
  .gng-root textarea::placeholder { color:${T.textSubtle} !important; }

  /* datetime */
  .gng-dt-wrap { position:relative; }
  .gng-dt-icon { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:${T.textMuted}; cursor:pointer; background:none; border:none; padding:0; display:flex; align-items:center; }
  .gng-dt-icon:hover { color:${T.textSecondary}; }
  input[type="datetime-local"].gng-input { padding-right:36px; }
  input[type="datetime-local"].gng-input::-webkit-calendar-picker-indicator { opacity:0; position:absolute; right:0; width:36px; height:100%; cursor:pointer; }

  /* 2-col grid */
  .gng-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .gng-col-2  { grid-column:span 2; }

  /* warning box */
  .gng-warn { background:${T.warningBg}; border:1px solid rgba(245,158,11,0.3); border-radius:7px; padding:12px 14px; }
  .gng-warn-title { font-size:12px; font-weight:700; color:${T.warning}; margin-bottom:4px; }
  .gng-warn-body  { font-size:11px; color:rgba(245,158,11,0.8); line-height:1.5; }

  /* department multi-select list */
  .gng-dept-list { display:flex; flex-direction:column; gap:2px; max-height:220px; overflow-y:auto; border:1px solid ${T.border}; border-radius:6px; padding:6px; background:${T.surfaceAlt}; }
  .gng-dept-item { display:flex; align-items:center; gap:9px; padding:7px 8px; border-radius:5px; cursor:pointer; }
  .gng-dept-item:hover { background:rgba(var(--tl-ink, 255,255,255),0.04); }
  .gng-dept-name { font-size:13px; color:${T.textPrimary}; flex:1; }
  .gng-dept-tag { font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${T.accent}; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); border-radius:4px; padding:2px 6px; }

  /* danger box (conflito criador/aprovador) */
  .gng-danger-box { background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.35); border-radius:7px; padding:12px 14px; }
  .gng-danger-title { font-size:12px; font-weight:700; color:${T.danger}; margin-bottom:4px; }
  .gng-danger-body  { font-size:11px; color:rgba(239,68,68,0.85); line-height:1.5; }

  /* error summary */
  .gng-err-box { background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px 14px; }
  .gng-err-box-title { font-size:12px; font-weight:700; color:${T.danger}; margin-bottom:6px; }
  .gng-err-box ul { list-style:disc; padding-left:18px; display:flex; flex-direction:column; gap:2px; }
  .gng-err-box li { font-size:11px; color:rgba(239,68,68,0.85); }

  /* footer */
  .gng-footer { display:flex; justify-content:flex-end; gap:8px; padding-top:12px; border-top:1px solid ${T.border}; }

  .gng-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:9px 18px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
  .gng-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .gng-btn.primary  { background:${T.successBg}; border:1px solid rgba(16,185,129,0.35); color:${T.success}; }
  .gng-btn.primary:hover:not(:disabled)  { background:rgba(16,185,129,0.2); }
  .gng-btn.outline  { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .gng-btn.outline:hover:not(:disabled)  { border-color:${T.borderHi}; color:${T.textPrimary}; }
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
    fontFamily: "'DM Sans',sans-serif",
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
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            Nova GMUD — Gestão de Mudança
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
