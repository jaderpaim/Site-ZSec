import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Field, Section } from "../cmdb/CmdbDetailsSheet";
import { TipoBadge } from "../cmdb/CmdbBadges";
import { SevBadge, StatusBadge, closedAt, lastUpdatedAt, pickRaw, type Vuln } from "./vuln-shared";

const NAO_INFORMADO = "Não informado";
const MIN_WIDTH = 420;
const MAX_WIDTH = 1100;

function fmtDate(s: string | null | undefined): string {
  if (!s) return NAO_INFORMADO;
  const [y, m, d] = s.slice(0, 10).split("-");
  if (!y || !m || !d) return NAO_INFORMADO;
  return `${d}/${m}/${y}`;
}
function fmtDateTime(s: string | null | undefined): string {
  return s ? new Date(s).toLocaleString("pt-BR") : NAO_INFORMADO;
}

export function VulnDetailsSheet({
  open,
  onOpenChange,
  vuln,
  responsavel,
  canManage,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vuln: Vuln | null;
  responsavel?: string;
  // Editar/Excluir: só admins do departamento de Segurança da Informação (ver
  // VulnerabilidadesReal.tsx, SEC_INFO_DEPARTMENT_ID) — não exibido pra ninguém mais.
  canManage?: boolean;
  onEdit?: (v: Vuln) => void;
  onDelete?: (v: Vuln) => void;
}) {
  // Mantém o último item exibido enquanto o Sheet anima a saída: o `vuln` vira
  // null no mesmo instante em que o fechamento começa (clique fora, X ou Esc),
  // então desmontar com base nele cortaria a animação de saída pela metade.
  const [lastVuln, setLastVuln] = React.useState<Vuln | null>(vuln);
  React.useEffect(() => {
    if (vuln) setLastVuln(vuln);
  }, [vuln]);

  // Largura customizada pelo usuário (arrastando a alça na borda esquerda).
  // null = usa a largura padrão definida via className.
  const [width, setWidth] = React.useState<number | null>(null);
  const draggingRef = React.useRef(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = window.innerWidth - ev.clientX;
      const clamped = Math.min(MAX_WIDTH, window.innerWidth - 80, Math.max(MIN_WIDTH, next));
      setWidth(clamped);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const v = vuln ?? lastVuln;
  if (!v) return null;

  const raw = (v.raw ?? {}) as Record<string, unknown>;
  const resumo = pickRaw(raw, ["Resumo", "Título", "Titulo", "Title", "Nome", "Name", "Summary", "Vulnerability"]);
  const cve = pickRaw(raw, ["CVE", "Campo personalizado (CVE)", "CVE ID"]);
  const descricao = pickRaw(raw, ["Descrição", "Descriação", "Descricao", "Description"]);
  const referencias = pickRaw(raw, [
    "Campo personalizado (References)",
    "References",
    "Referências",
    "Referencias",
    "Plugin ID",
  ]);
  const idItem = pickRaw(raw, ["Chave do item (JIRA)", "Chave", "Key", "Issue Key", "ID"]);
  const kindLabel = (v.kind ?? "aplicacao") === "infraestrutura" ? "Interna" : "Externa / FQDN";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto"
        style={width ? { width, maxWidth: "none" } : undefined}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40 sm:block"
        />
        <SheetHeader className="space-y-3 pr-8">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-xl">{resumo || v.fqdn || "Vulnerabilidade"}</SheetTitle>
            {canManage && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit?.(v)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onDelete?.(v)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SevBadge sev={v.severity} />
            <StatusBadge status={v.status} />
            <TipoBadge value={kindLabel} />
          </div>
        </SheetHeader>

        <div className="space-y-5 pt-6">
          <Section title="Identificação">
            <Field label="Resumo" value={resumo ?? NAO_INFORMADO} />
            <Field label="FQDN" value={v.fqdn || NAO_INFORMADO} mono />
            <Field label="ID do item" value={idItem ?? NAO_INFORMADO} mono />
          </Section>

          <Section title="Classificação">
            <Field label="Severidade" value={<SevBadge sev={v.severity} />} />
            <Field label="Status" value={<StatusBadge status={v.status} />} />
            <Field label="CVE" value={cve ?? NAO_INFORMADO} mono />
          </Section>

          <Section title="Detalhes">
            <Field label="Tipo" value={v.vuln_type || NAO_INFORMADO} />
            <Field label="Sistema / App" value={v.system_app || NAO_INFORMADO} />
            <Field label="Origem" value={v.source || NAO_INFORMADO} />
            <Field label="Responsável" value={responsavel || NAO_INFORMADO} />
          </Section>

          <Section title="Datas">
            <Field label="Identificada em" value={fmtDate(v.identified_at)} />
            <Field label="Atualizado" value={fmtDate(lastUpdatedAt(v))} />
            <Field label="Importado" value={fmtDate(v.updated_at)} />
            <Field label="Prazo do plano de ação" value={fmtDate(v.treatment_due_date)} />
            <Field label="Fechada em" value={fmtDate(closedAt(v))} />
          </Section>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Descrição</h4>
            <div className="p-3 bg-accent/30 rounded-md text-sm whitespace-pre-wrap break-words">
              {descricao ?? NAO_INFORMADO}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Referências</h4>
            <div className="p-3 bg-accent/30 rounded-md text-sm whitespace-pre-wrap break-all">
              {referencias ?? NAO_INFORMADO}
            </div>
          </div>

          {v.mitigation_description && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                {(v.pending_status ?? v.status) === "Fechada" ? "Descrição da solução" : "Descrição da mitigação"}
              </h4>
              <div className="p-3 bg-accent/30 rounded-md text-sm whitespace-pre-wrap break-words">
                {v.mitigation_description}
              </div>
            </div>
          )}

          {v.pending_approval === true && (
            <Section title="Aprovação pendente">
              <Field label="Mudança solicitada" value={`⏳ ${v.pending_status ?? NAO_INFORMADO}`} />
              <Field label="Solicitado por" value={v.pending_by ?? NAO_INFORMADO} />
              <Field label="Solicitado em" value={fmtDateTime(v.pending_at)} />
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
