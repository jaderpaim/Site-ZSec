import * as React from "react";
import { Lock } from "lucide-react";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import type { ZoneChange } from "@/lib/cloudflare.hosts.functions";
import {
  changeArea,
  changeDetails,
  changeText,
  changeWho,
  fmtVal,
  fmtWhen,
  useZoneChanges,
  type ChangeArea,
} from "./change-utils";

const CSS = `
.hs-diff { display:grid; gap:10px; }
.hs-diff span { font-size:12.5px; color:var(--v2-fg-3); }
.hs-diff div div { font:12.5px/1.5 var(--font-data); padding:6px 10px; border-radius:6px; margin-top:4px; overflow-wrap:anywhere; }
.hs-m { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); color:color-mix(in oklch, var(--v2-crit) 70%, var(--v2-fg)); }
.hs-p { background:color-mix(in oklch, var(--v2-ok) 12%, transparent); color:color-mix(in oklch, var(--v2-ok) 65%, var(--v2-fg)); }
.hs-root { display:flex; flex-direction:column; gap:16px; font-family:var(--font-ui); color:var(--v2-fg); }
.hs-sh { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.hs-sh h2 { margin:0; font-size:18px; font-weight:600; }
.hs-sh p { margin:2px 0 0; font-size:13px; color:var(--v2-fg-3); }
.hs-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); }
.hs-seg button { height:28px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; }
.hs-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
.hs-box { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow-x:auto; }
.hs-box table { width:100%; border-collapse:collapse; font-size:13px; }
.hs-box th { text-align:left; font-weight:500; font-size:12px; color:var(--v2-fg-3); padding:9px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.hs-box td { padding:9px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.hs-box tbody tr { cursor:pointer; } .hs-box tbody tr:hover td { background:var(--v2-hover); }
.hs-box tr:last-child td { border-bottom:0; }
.hs-mono { font-family:var(--font-data); font-size:12.5px; }
.hs-trunc { max-width:340px; overflow:hidden; text-overflow:ellipsis; }
.hs-tag { display:inline-flex; align-items:center; height:22px; padding:0 7px; border-radius:5px; font:500 12px var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); }
.hs-err { color:var(--v2-crit); font-size:12px; margin-left:6px; }
.hs-note { font-size:12.5px; color:var(--v2-fg-2); padding:10px 12px; border:1px dashed var(--v2-line-strong); border-radius:10px; }
.hs-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
`;

export function ChangeDetailSheet({
  change,
  onClose,
}: {
  change: ZoneChange | null;
  onClose: () => void;
}) {
  const c = change;
  const d = c ? changeDetails(c) : {};
  const t = c ? changeText(c) : { verb: "", target: "" };
  return (
    <DetailSheet
      open={!!c}
      onOpenChange={(o) => !o && onClose()}
      eyebrow={c ? `${changeArea(c)} · ${fmtWhen(c.createdAt)}` : ""}
      title={c ? `${changeWho(c)} ${t.verb} ${t.target}`.trim() : ""}
      footer={
        <button className="cf-btn" style={{ marginRight: "auto" }} onClick={onClose}>
          Fechar
        </button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {c && (
        <>
          {d.changes && d.changes.length > 0 && (
            <DetailSection title="O que mudou">
              <div className="hs-diff">
                {d.changes.map((x, i) => (
                  <div key={i}>
                    <span>{x.path}</span>
                    <div className="hs-m">− {fmtVal(x.before)}</div>
                    <div className="hs-p">+ {fmtVal(x.after)}</div>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
          <DetailSection title="Detalhes">
            <DetailList
              items={[
                ["Quem", c.userEmail ?? "Sistema"],
                ["Por onde", c.source === "cloudflare" ? "Painel da Cloudflare" : "Z-Sec"],
                ["Quando", new Date(c.createdAt).toLocaleString("pt-BR")],
                ["Área", changeArea(c)],
                ["Resultado", c.status === "success" ? "Aplicado" : "Falhou"],
                ...(c.message ? ([["Resumo", c.message]] as Array<[string, string]>) : []),
              ]}
            />
          </DetailSection>
        </>
      )}
    </DetailSheet>
  );
}

export function HistoryView({
  zoneId,
  zoneName,
}: {
  zoneId: string | null;
  zoneName: string | null;
}) {
  const [area, setArea] = React.useState<"Todas" | ChangeArea>("Todas");
  const [days, setDays] = React.useState(30);
  const [open, setOpen] = React.useState<ZoneChange | null>(null);
  const q = useZoneChanges(zoneId, days, true);
  const res = q.data;
  const rows = res?.ok ? res.changes.filter((c) => area === "Todas" || changeArea(c) === area) : [];

  return (
    <div className="hs-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hs-sh">
        <div>
          <h2>Histórico de alterações</h2>
          <p>
            O que foi alterado na zona {zoneName ?? ""}, pelo Z-Sec ou direto no painel da
            Cloudflare: quem fez, quando e o antes/depois
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="hs-seg" role="group" aria-label="Área">
            {(["Todas", "DNS", "Regras", "Cache", "Load Balancing"] as const).map((a) => (
              <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="hs-seg" role="group" aria-label="Período">
            {[7, 30, 90].map((n) => (
              <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
                {n} dias
              </button>
            ))}
          </div>
        </div>
      </div>
      {res?.ok && res.cloudflareAudit.status !== "ok" && (
        <div className="hs-note">
          Só aparecem as alterações feitas pelo Z-Sec.{" "}
          {res.cloudflareAudit.status === "denied"
            ? "Para incluir as feitas direto no painel da Cloudflare, dê ao token da integração a permissão “Account Audit Logs: Read”."
            : `O log de auditoria da Cloudflare não respondeu (${res.cloudflareAudit.message ?? "erro"}).`}
        </div>
      )}
      <div className="hs-box">
        {res && !res.ok ? (
          <div className="hs-empty">
            {res.denied ? (
              <>
                <Lock size={14} style={{ verticalAlign: -2 }} /> Você não tem permissão para ver o
                histórico de alterações.
              </>
            ) : (
              res.error
            )}
          </div>
        ) : q.isLoading ? (
          <div className="hs-empty">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="hs-empty">Nenhuma alteração nesse período.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
                <th>Alvo</th>
                <th>Área</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const t = changeText(c);
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => setOpen(c)}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(c)}
                  >
                    <td className="hs-mono">{fmtWhen(c.createdAt)}</td>
                    <td>{c.userEmail ?? "Sistema"}</td>
                    <td>
                      {t.verb}
                      {c.status !== "success" && <span className="hs-err">falhou</span>}
                    </td>
                    <td className="hs-mono hs-trunc" title={t.target}>
                      {t.target || "—"}
                    </td>
                    <td>
                      <span className="hs-tag">{changeArea(c)}</span>
                    </td>
                    <td style={{ color: "var(--v2-fg-3)" }}>
                      {c.source === "cloudflare" ? "Painel da Cloudflare" : "Z-Sec"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <ChangeDetailSheet change={open} onClose={() => setOpen(null)} />
    </div>
  );
}
