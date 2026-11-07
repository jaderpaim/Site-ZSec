import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  importDnsRecords,
  previewDnsImport,
  type ImportPreviewRow,
} from "@/lib/cloudflare.guard.functions";

// Importar registros DNS de um arquivo de zona (BIND), em 3 etapas:
// Arquivo → Revisão (novos / já existem / sensíveis) → Justificativa.
// Sem aprovação de outra pessoa (decisão do usuário); o servidor exige
// manage_importar_dns + perfil admin, faz cópia da zona antes e alerta.

const MIN_JUSTIFICATION = 20;
const MAX_BYTES = 256 * 1024;
const STEPS = ["Arquivo", "Revisão", "Justificativa"] as const;

export function DnsImportDialog({
  open,
  onOpenChange,
  zoneId,
  zoneName,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  zoneName: string;
  onImported: () => void;
}) {
  const preview = useServerFn(previewDnsImport);
  const doImport = useServerFn(importDnsRecords);
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null);
  const [proxied, setProxied] = React.useState(true);
  const [rows, setRows] = React.useState<ImportPreviewRow[] | null>(null);
  const [skipped, setSkipped] = React.useState<string[]>([]);
  const [tooMany, setTooMany] = React.useState(false);
  const [why, setWhy] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setFile(null);
    setRows(null);
    setSkipped([]);
    setTooMany(false);
    setWhy("");
    setTyped("");
    setProxied(true);
  }, [open, zoneId]);

  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("Arquivo maior que 256 KB.");
      return;
    }
    setFile({ name: f.name, text: await f.text() });
    setRows(null);
  }

  async function goReview() {
    if (!file) return;
    setBusy(true);
    try {
      const res: any = await preview({ data: { zoneId, fileText: file.text } });
      if (!res?.ok) {
        toast.error(res?.error ?? "Não foi possível ler o arquivo.");
        return;
      }
      setRows(res.rows);
      setSkipped(res.skipped ?? []);
      setTooMany(!!res.tooMany);
      setStep(1);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    try {
      const res: any = await doImport({
        data: {
          zoneId,
          fileText: file.text,
          proxied,
          justification: why.trim(),
          confirmName: typed.trim(),
        },
      });
      if (res?.ok) {
        toast.success(
          `${res.added} registro(s) importado(s). Cópia da zona guardada, alerta enviado e linha no Histórico.`,
        );
        onOpenChange(false);
        onImported();
      } else toast.error(res?.error ?? "Falha ao importar.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const newRows = (rows ?? []).filter((r) => r.status === "new");
  const existing = (rows ?? []).filter((r) => r.status === "exists").length;
  const outsideRows = (rows ?? []).filter((r) => r.status === "outside");
  const outside = outsideRows.length;
  const outsideExample = outsideRows[0]?.name ?? "";
  const sensitive = newRows.filter((r) => r.sensitive).length;
  const whyOk = why.trim().length >= MIN_JUSTIFICATION;
  const nameOk = typed.trim().toLowerCase() === zoneName.toLowerCase();
  const box = (tone: "info" | "warn" | "plain" | "danger"): React.CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12.5,
    border: `1px solid ${
      tone === "warn"
        ? "color-mix(in oklch, var(--v2-high) 45%, transparent)"
        : tone === "danger"
          ? "color-mix(in oklch, var(--v2-crit) 45%, transparent)"
          : tone === "info"
            ? "color-mix(in oklch, var(--v2-accent) 35%, transparent)"
            : "var(--v2-line)"
    }`,
    background:
      tone === "warn"
        ? "color-mix(in oklch, var(--v2-high) 12%, transparent)"
        : tone === "danger"
          ? "color-mix(in oklch, var(--v2-crit) 12%, transparent)"
          : tone === "info"
            ? "color-mix(in oklch, var(--v2-accent) 8%, transparent)"
            : "var(--v2-surface-2)",
    color: "var(--v2-fg)",
    minWidth: 0,
    overflowWrap: "anywhere",
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {/* min-w-0 + overflow-hidden: nada de dentro alarga o diálogo além da tela. */}
      <DialogContent
        className="max-w-2xl min-w-0 overflow-hidden"
        style={{ width: "min(672px, calc(100vw - 32px))" }}
      >
        <DialogHeader>
          <DialogTitle>Importar registros DNS · {zoneName}</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Etapas">
          {STEPS.map((s, i) => (
            <span
              key={s}
              aria-current={i === step ? "step" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "3px 10px 3px 4px",
                borderRadius: 999,
                border: `1px solid ${i === step ? "var(--v2-accent)" : "var(--v2-line)"}`,
                color:
                  i === step ? "var(--v2-accent)" : i < step ? "var(--v2-fg-2)" : "var(--v2-fg-3)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "inline-grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "var(--font-data)",
                  background: i === step ? "var(--v2-accent)" : "var(--v2-surface-2)",
                  color: i === step ? "#fff" : "inherit",
                }}
              >
                {i + 1}
              </span>
              {s}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 13,
            minHeight: 180,
            minWidth: 0,
          }}
        >
          {step === 0 && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  void readFile(e.dataTransfer.files?.[0]);
                }}
                style={{
                  border: `1.5px dashed ${drag ? "var(--v2-accent)" : "var(--v2-line)"}`,
                  borderRadius: 10,
                  padding: 22,
                  background: drag
                    ? "color-mix(in oklch, var(--v2-accent) 6%, transparent)"
                    : "transparent",
                  color: "var(--v2-fg-2)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <FileUp size={20} />
                <b style={{ color: "var(--v2-fg)" }}>Arraste o arquivo de zona (BIND) aqui</b>
                <span style={{ fontSize: 12 }}>
                  ou clique para escolher · .txt ou .zone · até 200 registros
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.zone,.bind,text/plain"
                style={{ display: "none" }}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
              {file && (
                <div
                  style={{
                    ...box("plain"),
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--font-data)",
                  }}
                >
                  <span style={{ overflowWrap: "anywhere" }}>{file.name}</span>
                  <span style={{ color: "var(--v2-fg-3)" }}>
                    {(file.text.length / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={proxied}
                  onChange={(e) => setProxied(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Ativar proxy nos registros A, AAAA e CNAME importados{" "}
                  <span style={{ color: "var(--v2-fg-3)" }}>
                    (igual à opção do painel da Cloudflare)
                  </span>
                </span>
              </label>
              <div style={box("info")}>
                O import só <b>adiciona</b> registros. Nada é apagado nem alterado; registros iguais
                aos que já existem são ignorados.
              </div>
            </>
          )}

          {step === 1 && rows && (
            <>
              <div style={box("plain")}>
                {rows.length} registro(s) no arquivo: <b>{newRows.length} novo(s)</b>,{" "}
                <b>{existing} já existe(m)</b> (serão ignorados)
                {sensitive > 0 && (
                  <>
                    , <b style={{ color: "var(--v2-high)" }}>{sensitive} sensível(is)</b>
                  </>
                )}
                .
              </div>
              {tooMany && (
                <div style={box("warn")}>
                  O arquivo passa de 200 registros, o máximo por import. Divida em mais de um
                  arquivo.
                </div>
              )}
              {outside > 0 && (
                <div style={box("danger")}>
                  <b>
                    {outside} registro(s) não pertencem a {zoneName}
                  </b>{" "}
                  (ex.:{" "}
                  <span style={{ fontFamily: "var(--font-data)" }}>{outsideExample}</span>
                  ). O arquivo parece ser de outra zona; o import fica bloqueado. Abra a zona certa
                  no topo ou corrija o arquivo.
                </div>
              )}
              <div
                style={{
                  maxHeight: 280,
                  overflow: "auto",
                  border: "1px solid var(--v2-line)",
                  borderRadius: 8,
                  minWidth: 0,
                }}
              >
                {/* Largura fixa por coluna: texto longo quebra ou corta dentro da
                    célula em vez de alargar o diálogo. */}
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    tableLayout: "fixed",
                  }}
                >
                  <colgroup>
                    <col style={{ width: 64 }} />
                    <col style={{ width: "30%" }} />
                    <col />
                    <col style={{ width: 170 }} />
                  </colgroup>
                  <thead>
                    <tr
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "var(--v2-surface-2)",
                        zIndex: 1,
                      }}
                    >
                      {["Tipo", "Nome", "Conteúdo", "Situação"].map((h) => (
                        <th
                          key={h}
                          style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const cut: React.CSSProperties = {
                        padding: "6px 8px",
                        fontFamily: "var(--font-data)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      };
                      const shortName =
                        r.name === zoneName
                          ? "@"
                          : r.name.endsWith(`.${zoneName}`)
                            ? r.name.slice(0, -(zoneName.length + 1))
                            : r.name;
                      const content = `${r.priority != null ? `${r.priority} ` : ""}${r.content}`;
                      return (
                        <tr
                          key={i}
                          style={{
                            borderTop: "1px solid var(--v2-line)",
                            background:
                              r.status === "outside"
                                ? "color-mix(in oklch, var(--v2-crit) 6%, transparent)"
                                : undefined,
                          }}
                        >
                          <td style={{ padding: "6px 8px", verticalAlign: "top" }}>{r.type}</td>
                          <td title={r.name} style={{ ...cut, verticalAlign: "top" }}>
                            {shortName}
                          </td>
                          <td title={content} style={{ ...cut, verticalAlign: "top" }}>
                            {content}
                          </td>
                          <td
                            style={{ padding: "6px 8px", verticalAlign: "top", lineHeight: 1.35 }}
                          >
                            {r.status === "outside" ? (
                              <b style={{ color: "var(--v2-crit)" }}>Outra zona</b>
                            ) : r.status === "exists" ? (
                              <span style={{ color: "var(--v2-fg-3)" }}>Já existe</span>
                            ) : r.sensitive ? (
                              <>
                                <b style={{ color: "var(--v2-high)" }}>Novo · sensível</b>
                                <div
                                  title={r.sensitive}
                                  style={{ fontSize: 11, color: "var(--v2-fg-3)" }}
                                >
                                  {r.sensitive.split(":")[0]}
                                </div>
                              </>
                            ) : (
                              <span style={{ color: "var(--v2-accent)" }}>Novo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sensitive > 0 && (
                <div style={box("warn")}>
                  Registros de e-mail (MX, SPF, DMARC, DKIM), NS em subdomínio, curinga e
                  verificação de domínio mudam quem recebe e-mail ou quem prova posse do domínio.
                  Confira antes de seguir.
                </div>
              )}
              {skipped.length > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--v2-fg-3)" }}>
                  {skipped.length} linha(s) não reconhecida(s) serão ignoradas pela leitura:{" "}
                  {skipped.slice(0, 2).join(" · ")}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
                htmlFor="dns-import-why"
              >
                <b>Justificativa (obrigatória)</b>
                <Textarea
                  id="dns-import-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  rows={4}
                  placeholder="Por que esses registros estão sendo importados? Cite o chamado ou a GMUD, se tiver."
                />
                <span
                  style={{ fontSize: 11.5, color: whyOk ? "var(--v2-fg-3)" : "var(--v2-crit)" }}
                >
                  {whyOk
                    ? `${why.trim().length} caracteres. Vai para o Histórico, para o alerta no Teams e para o e-mail dos admins.`
                    : `Mínimo de ${MIN_JUSTIFICATION} caracteres (${why.trim().length}/${MIN_JUSTIFICATION}).`}
                </span>
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
                htmlFor="dns-import-zone"
              >
                <span>
                  Digite <b style={{ fontFamily: "var(--font-data)" }}>{zoneName}</b> para
                  confirmar
                </span>
                <Input
                  id="dns-import-zone"
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <div style={box("plain")}>
                Antes de importar, é feita uma <b>cópia completa da zona</b> (Ações › Backups de
                DNS), para desfazer se precisar. Depois, os {newRows.length} registro(s) novo(s)
                entram com aviso no Teams e no e-mail.
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <button
            className="ops-btn outline"
            disabled={busy}
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          {step === 0 && (
            <button
              className="ops-btn primary"
              disabled={!file || busy}
              onClick={() => void goReview()}
            >
              {busy && <Loader2 size={13} className="ops-spin" />} Revisar
            </button>
          )}
          {step === 1 && (
            <button
              className="ops-btn primary"
              disabled={busy || tooMany || outside > 0 || newRows.length === 0}
              onClick={() => setStep(2)}
              title={
                outside > 0
                  ? "O arquivo tem registros de outra zona"
                  : newRows.length === 0
                    ? "Nenhum registro novo no arquivo"
                    : undefined
              }
            >
              Continuar
            </button>
          )}
          {step === 2 && (
            <button
              className="ops-btn primary"
              disabled={busy || !whyOk || !nameOk}
              style={{ background: "var(--v2-crit)", borderColor: "var(--v2-crit)" }}
              onClick={() => void runImport()}
            >
              {busy && <Loader2 size={13} className="ops-spin" />}
              {busy ? "Importando…" : `Importar ${newRows.length} registro(s)`}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
