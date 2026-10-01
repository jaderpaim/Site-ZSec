import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Field, Section } from "../cmdb/CmdbDetailsSheet";
import { Ticket, ChevronRight, Send, Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { extractSeverityFromSubject, type SekParsedAlert } from "@/lib/sek-zendesk-parser";
import { replySekTicket } from "@/lib/sek-zendesk.functions";

// Mesmos tokens de cor do SocReal.tsx -- as classes exec-* (exec-panel,
// exec-table etc.) já existem globalmente (injetadas via <style> pelo
// componente pai), só precisamos dos hexes pra elementos sem classe pronta.
// textMuted/textSecondary iguais a textPrimary de propósito, pra bater com
// o resto da página (ver const T em SocReal.tsx).
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  accent: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textMuted: "#F1F5F9",
};

// sek_tickets ainda não existe no types.ts gerado (migration nova, aplicada
// manualmente) -- mesmo cast solto já usado nos hooks server-side.
const ticketsDb = supabase as unknown as {
  from: (t: string) => any;
};

type SekTicket = {
  id: number;
  subject: string;
  status: string;
  priority: string | null;
  ofensa_numero: string | null;
  zendesk_created_at: string | null;
  zendesk_updated_at: string | null;
  parsed_alert: SekParsedAlert | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  open: "Aberto",
  pending: "Aguardando resposta",
  hold: "Em espera",
  solved: "Resolvido",
  closed: "Fechado",
};

const RESOLVED_STATUSES = new Set(["solved", "closed"]);

// Severidade real do alerta (o que o QRadar atribuiu, embutido no assunto do
// ticket) -- não é o priority nativo do Zendesk, que na prática fica quase
// todo "normal" e não reflete a criticidade de verdade do alerta.
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: T.danger,
  high: T.warning,
  medium: T.accent,
  low: T.neutral,
};
const SEVERITY_ORDER: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function fmtDateTime(s: string | null | undefined): string {
  return s ? new Date(s).toLocaleString("pt-BR") : "—";
}

function TicketStatusBadge({ status }: { status: string }) {
  const resolved = RESOLVED_STATUSES.has(status);
  const color = resolved ? T.neutral : T.warning;
  const bg = resolved ? "rgba(107,114,128,0.1)" : "rgba(245,158,11,0.10)";
  return (
    <span className="exec-badge" style={{ background: bg, color, border: `1px solid ${color}33` }}>
      <span className="exec-badge-dot" style={{ background: color }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function SeverityBadge({ subject }: { subject: string }) {
  const severity = extractSeverityFromSubject(subject);
  if (!severity) return <span style={{ color: T.textMuted }}>—</span>;
  const color = SEVERITY_COLOR[severity] ?? T.neutral;
  return (
    <span className="exec-badge" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}

type SortKey = "subject" | "ofensa_numero" | "severity" | "zendesk_created_at" | "zendesk_updated_at" | "status";

function SortHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  style,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  style?: React.CSSProperties;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      style={{ ...style, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp size={11} color={T.accent} />
          ) : (
            <ArrowDown size={11} color={T.accent} />
          )
        ) : (
          <ChevronsUpDown size={11} color={T.textMuted} style={{ opacity: 0.5 }} />
        )}
      </span>
    </th>
  );
}

export function SekTicketsPanel() {
  const [selected, setSelected] = React.useState<SekTicket | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("zendesk_updated_at");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["sek-tickets"],
    queryFn: async (): Promise<SekTicket[]> => {
      const { data, error } = await ticketsDb
        .from("sek_tickets")
        .select(
          "id, subject, status, priority, ofensa_numero, zendesk_created_at, zendesk_updated_at, parsed_alert",
        )
        .order("zendesk_updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SekTicket[];
    },
  });

  const tickets = data ?? [];
  const abertos = tickets.filter((t) => !RESOLVED_STATUSES.has(t.status));

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleTickets = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = tickets.filter((t) => {
      const matchesSearch =
        !q || t.subject.toLowerCase().includes(q) || (t.ofensa_numero ?? "").toLowerCase().includes(q);
      const matchesSeverity = severityFilter === "all" || extractSeverityFromSubject(t.subject) === severityFilter;
      return matchesSearch && matchesSeverity;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        // "Resolvido" e "Fechado" são a mesma categoria pro usuário (ambos
        // RESOLVED_STATUSES) -- ordena por aberto/resolvido primeiro, senão
        // alternar a direção intercalava os dois em vez de agrupar "todos
        // os abertos" de um lado e "todos os resolvidos" do outro.
        const aResolved = RESOLVED_STATUSES.has(a.status) ? 1 : 0;
        const bResolved = RESOLVED_STATUSES.has(b.status) ? 1 : 0;
        cmp = aResolved - bResolved || a.status.localeCompare(b.status);
      } else if (sortKey === "severity") {
        const aSev = extractSeverityFromSubject(a.subject);
        const bSev = extractSeverityFromSubject(b.subject);
        cmp = (SEVERITY_ORDER[aSev ?? ""] ?? -1) - (SEVERITY_ORDER[bSev ?? ""] ?? -1);
      } else if (sortKey === "zendesk_created_at" || sortKey === "zendesk_updated_at") {
        cmp = new Date(a[sortKey] ?? 0).getTime() - new Date(b[sortKey] ?? 0).getTime();
      } else {
        cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [tickets, search, severityFilter, sortKey, sortDir]);

  function openTicket(t: SekTicket) {
    setSelected(t);
    setSheetOpen(true);
  }

  return (
    <>
      <div>
        <div className="exec-section-label">
          <Ticket size={10} />
          Tickets SEK — Detalhamento
        </div>
        <div className="exec-panel">
          <div className="exec-panel-header">
            <div className="exec-panel-title">
              <Ticket size={14} color={T.accent} />
              Tickets SEK / Zendesk
            </div>
            <span
              className="exec-badge"
              style={{
                background: "rgba(59,130,246,0.10)",
                color: T.accent,
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              {abertos.length} em aberto
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "10px 16px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
              <Search
                size={13}
                color={T.textMuted}
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por assunto ou nº ofensa..."
                style={{ paddingLeft: 28, height: 30, fontSize: 12 }}
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger style={{ width: 160, height: 30, fontSize: 12 }}>
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas severidades</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
            {(search || severityFilter !== "all") && (
              <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>
                {visibleTickets.length} de {tickets.length}
              </span>
            )}
          </div>
          <div className="exec-panel-body" style={{ padding: 0 }}>
            {isLoading ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 12,
                  color: T.textMuted,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                Carregando...
              </div>
            ) : tickets.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 12,
                  color: T.textMuted,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                Nenhum ticket sincronizado ainda.
              </div>
            ) : visibleTickets.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 12,
                  color: T.textMuted,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                Nenhum ticket bate com esse filtro.
              </div>
            ) : (
              <div className="exec-scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="exec-table">
                  <thead>
                    <tr>
                      <SortHeader
                        label="Assunto"
                        sortKey="subject"
                        currentKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                        style={{ paddingLeft: 20 }}
                      />
                      <SortHeader label="Nº Ofensa" sortKey="ofensa_numero" currentKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortHeader label="Severidade" sortKey="severity" currentKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortHeader label="Criado" sortKey="zendesk_created_at" currentKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortHeader label="Atualizado" sortKey="zendesk_updated_at" currentKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortHeader label="Status" sortKey="status" currentKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <th style={{ paddingRight: 20 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTickets.map((t) => (
                      <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => openTicket(t)}>
                        <td
                          style={{
                            paddingLeft: 20,
                            maxWidth: 420,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={t.subject}
                        >
                          {t.subject}
                        </td>
                        <td className="mono">{t.ofensa_numero ?? "—"}</td>
                        <td>
                          <SeverityBadge subject={t.subject} />
                        </td>
                        <td className="mono" style={{ color: T.textMuted, fontSize: 11 }}>
                          {fmtDateTime(t.zendesk_created_at)}
                        </td>
                        <td className="mono" style={{ color: T.textMuted, fontSize: 11 }}>
                          {fmtDateTime(t.zendesk_updated_at)}
                        </td>
                        <td>
                          <TicketStatusBadge status={t.status} />
                        </td>
                        <td style={{ paddingRight: 20, textAlign: "right" }}>
                          <ChevronRight size={13} color={T.textMuted} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <SekTicketDetailsSheet open={sheetOpen} onOpenChange={setSheetOpen} ticket={selected} />
    </>
  );
}

// Resposta pública de verdade (fica visível pro cliente que abriu o
// chamado) -- por isso a confirmação explícita antes de enviar, mostrando
// de volta o texto exato que vai sair. Diferente da renovação de sessão do
// SEK/Zendesk (Integrações), aqui não existe token pra copiar/colar: é tudo
// servidor-a-servidor dentro de replySekTicket (ver sek-zendesk.functions.ts).
function ReplyTicketForm({ ticketId }: { ticketId: number }) {
  const replyFn = useServerFn(replySekTicket);
  const [text, setText] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const reply = useMutation({
    mutationFn: () => replyFn({ data: { ticketId: String(ticketId), body: text } }),
    onSuccess: () => {
      toast.success("Resposta enviada ao chamado");
      setText("");
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Responder chamado
      </h4>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Escreva a resposta que será enviada como comentário público no chamado..."
        disabled={reply.isPending}
      />
      <div className="flex justify-end mt-2">
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={!text.trim() || reply.isPending}>
              <Send className="size-3.5" />
              Enviar resposta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enviar resposta pública?</AlertDialogTitle>
              <AlertDialogDescription>
                Esse texto vai aparecer como comentário público no chamado #{ticketId} — visível pro cliente que
                abriu o chamado. Confira antes de confirmar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="text-sm p-3 bg-accent/30 rounded-md whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {text}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reply.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => reply.mutate()} disabled={reply.isPending}>
                {reply.isPending ? "Enviando..." : "Confirmar envio"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

const MIN_WIDTH = 420;
const MAX_WIDTH = 1100;

function SekTicketDetailsSheet({
  open,
  onOpenChange,
  ticket,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: SekTicket | null;
}) {
  const [lastTicket, setLastTicket] = React.useState<SekTicket | null>(ticket);
  React.useEffect(() => {
    if (ticket) setLastTicket(ticket);
  }, [ticket]);

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

  const t = ticket ?? lastTicket;
  if (!t) return null;
  const alert = t.parsed_alert;

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
          <SheetTitle className="text-xl">{alert?.alertaTitulo || t.subject}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={t.status} />
          </div>
        </SheetHeader>

        <div className="space-y-5 pt-6">
          <Section title="Identificação">
            <Field label="Assunto" value={t.subject} />
            <Field label="ID Zendesk" value={`#${t.id}`} mono />
            <Field label="Nº Ofensa" value={t.ofensa_numero ?? "—"} mono />
            <Field
              label="Severidade"
              value={SEVERITY_LABEL[extractSeverityFromSubject(t.subject) ?? ""] ?? "—"}
            />
            <Field label="Prioridade (Zendesk)" value={t.priority ?? "—"} />
          </Section>

          <Section title="Datas">
            <Field label="Criado" value={fmtDateTime(t.zendesk_created_at)} />
            <Field label="Atualizado" value={fmtDateTime(t.zendesk_updated_at)} />
          </Section>

          <ReplyTicketForm ticketId={t.id} />

          {!alert && (
            <div className="p-3 bg-accent/30 rounded-md text-sm text-muted-foreground">
              Este chamado não segue o template de alerta do SEK (ou ainda não foi possível extrair
              os campos estruturados) — sem detalhamento adicional além do assunto.
            </div>
          )}

          {alert && (
            <>
              <Section title="Alerta">
                <Field label="Cliente" value={alert.cliente ?? "—"} />
                <Field label="TLP" value={alert.tlp ?? "—"} />
                <Field label="Detectado em" value={alert.detectadoEm ?? "—"} mono />
                <Field label="Reportado em" value={alert.reportadoEm ?? "—"} mono />
              </Section>

              {alert.descricao && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Descrição
                  </h4>
                  <div className="p-3 bg-accent/30 rounded-md text-sm whitespace-pre-wrap break-words">
                    {alert.descricao}
                  </div>
                </div>
              )}

              {(alert.categorizacao || alert.vetorAtaque || alert.detectadoPor) && (
                <Section title="Categorização">
                  <Field label="Categoria" value={alert.categorizacao ?? "—"} />
                  <Field label="Vetor de ataque" value={alert.vetorAtaque?.nome ?? "—"} />
                  <Field label="Detectado por" value={alert.detectadoPor ?? "—"} mono />
                </Section>
              )}

              {alert.mitigado && (
                <Section title="Mitigação">
                  <Field
                    label="Mitigado"
                    value={
                      <span
                        style={{
                          color: /^sim$/i.test(alert.mitigado.valor ?? "") ? T.success : T.danger,
                        }}
                      >
                        {alert.mitigado.valor ?? "—"}
                      </span>
                    }
                  />
                  <Field label="Observação" value={alert.mitigado.descricao ?? "—"} />
                </Section>
              )}

              {alert.recomendacoes && Object.keys(alert.recomendacoes).length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Recomendações
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(alert.recomendacoes).map(([fase, itens]) => (
                      <div key={fase} className="p-3 bg-accent/30 rounded-md">
                        <div className="text-xs font-semibold mb-1.5" style={{ color: T.accent }}>
                          {fase}
                        </div>
                        <ul className="text-sm space-y-1 list-disc pl-4">
                          {itens.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {alert.informacoesAdicionais && alert.informacoesAdicionais.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Informações adicionais
                  </h4>
                  <div className="space-y-3">
                    {alert.informacoesAdicionais.map((info, i) => (
                      <Section key={i} title={info.tipo}>
                        {Object.entries(info.campos).map(([k, v]) => (
                          <Field key={k} label={k} value={v} mono />
                        ))}
                      </Section>
                    ))}
                  </div>
                </div>
              )}

              {alert.indicadoresTecnicos && Object.keys(alert.indicadoresTecnicos).length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Indicadores técnicos
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(alert.indicadoresTecnicos).map(([grupo, campos]) => (
                      <Section key={grupo} title={grupo}>
                        {Object.entries(campos).map(([k, v]) => (
                          <Field key={k} label={k} value={v} mono />
                        ))}
                      </Section>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
