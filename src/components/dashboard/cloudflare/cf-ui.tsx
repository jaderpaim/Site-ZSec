import * as React from "react";

// Peças visuais das telas da proteção de DNS (Solicitações, Alertas de
// auditoria, Backups, Exceções). Portadas do b-security-suite; as classes
// cfx-* ficam em CFX_CSS abaixo, já nos tokens --v2-* do Z-Sec. O
// CloudflareReal injeta CFX_CSS uma vez para o módulo inteiro.

export function fmtCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(".", ",")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",")} mil`;
  return String(Math.round(n));
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(n < 10 ? 1 : 0).replace(".", ",")}%`;
}

// Carregamento do bloco (um ou outro; string = texto do aviso):
//   loading — primeira carga: o conteúdo já vem em esqueleto; aviso + barra no topo;
//   busy    — trocando zona/período: conteúdo atual esmaecido + aviso + barra.
export function Block({
  title,
  icon: Icon,
  extra,
  loading,
  busy,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  extra?: React.ReactNode;
  loading?: boolean | string;
  busy?: boolean | string;
  children: React.ReactNode;
}) {
  const state = loading ? "loading" : busy ? "busy" : "";
  const msg =
    typeof loading === "string" ? loading : typeof busy === "string" ? busy : "Carregando…";
  return (
    <section className={`cfx-block${state ? ` cfx-${state}` : ""}`} aria-busy={!!state}>
      <div className="cfx-load-bar" aria-hidden />
      {state && (
        <div className="cfx-load-pill" role="status">
          <span className="cfx-load-spin" aria-hidden />
          {msg}
        </div>
      )}
      <div className="cfx-block-h">
        <div className="cfx-block-t">
          {Icon && <Icon size={13} />}
          {title}
        </div>
        {extra}
      </div>
      <div className="cfx-block-b">{children}</div>
    </section>
  );
}

// Esqueleto: faixa com brilho no lugar de um texto/número que ainda não chegou.
export function Skel({ w = "60%", h = 12 }: { w?: number | string; h?: number }) {
  return <span className="cfx-skel" style={{ width: w, height: h }} aria-hidden />;
}

// Conteúdo que acabou de chegar entra com um fade curto.
export function Fade({ children }: { children: React.ReactNode }) {
  return <span className="cfx-fade">{children}</span>;
}

// Linhas fantasmas de tabela (primeira carga).
export function SkelRows({ rows = 8, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} aria-hidden>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className={j > 0 ? "r" : undefined}>
              <Skel w={j === 0 ? 110 + ((i * 37) % 70) : 38 + ((i + j) % 3) * 10} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Área de gráfico em esqueleto (mesma altura do gráfico real).
export function SkelChart({ h = 210 }: { h?: number }) {
  return <div className="cfx-skel cfx-skel-chart" style={{ height: h }} aria-hidden />;
}

export function Kpi({
  label,
  value,
  sub,
  color,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  // Ainda sem dado: esqueleto no lugar do número (o cartão já ocupa o espaço).
  loading?: boolean;
}) {
  return (
    <div className="cfx-kpi" style={color ? ({ "--kc": color } as React.CSSProperties) : undefined}>
      <span className="cfx-kpi-l">{label}</span>
      <span className="cfx-kpi-v">{loading ? <Skel w="55%" h={18} /> : <Fade>{value}</Fade>}</span>
      {sub != null && <span className="cfx-kpi-s">{loading ? <Skel w="40%" h={9} /> : sub}</span>}
    </div>
  );
}

export function Badge({
  label,
  color,
  dot = true,
  dashed = false,
}: {
  label: string;
  color: string;
  dot?: boolean;
  // Borda tracejada: risco de configuração (ex.: "Exposto por skip").
  dashed?: boolean;
}) {
  return (
    <span
      className="cfx-badge"
      style={{ "--bc": color, ...(dashed ? { borderStyle: "dashed" } : {}) } as React.CSSProperties}
    >
      {dot && <span className="cfx-dot" />}
      {label}
    </span>
  );
}

export function BarList({
  rows,
  color,
}: {
  rows: Array<{ key: string; label: string; value: number; color?: string }>;
  color: string;
}) {
  if (rows.length === 0)
    return (
      <div className="cfx-muted" style={{ fontSize: 12 }}>
        Sem dados no período.
      </div>
    );
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="cfx-bl">
      {rows.map((r) => (
        <div
          key={r.key}
          className="cfx-bl-row"
          style={{ "--bc": r.color ?? color } as React.CSSProperties}
        >
          <span className="k" title={r.label}>
            {r.label}
          </span>
          <span className="v">{fmtCount(r.value)}</span>
          <span className="t">
            <b style={{ width: `${((r.value / max) * 100).toFixed(1)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Note({
  color,
  icon: Icon,
  children,
}: {
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="cfx-note" style={{ "--nc": color } as React.CSSProperties}>
      <Icon size={15} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="cfx-empty">{children}</div>;
}

export const CFX_CSS = `
.cfx-mono { font-family:var(--font-data); }
.cfx-muted { color:var(--v2-fg-3); }
.cfx-dot { width:6px; height:6px; border-radius:50%; background:currentColor; display:inline-block; flex-shrink:0; }
.cfx-grp { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.cfx-col { display:flex; flex-direction:column; gap:14px; }
.cfx-lbl { font-size:12px; font-weight:500; color:var(--v2-fg-3); }
.cfx-btn { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border-radius:8px; font:500 13px var(--font-ui); cursor:pointer; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); white-space:nowrap; }
.cfx-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
.cfx-btn:disabled { opacity:.45; cursor:not-allowed; }
.cfx-btn.pri, .cfx-btn.solid { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
.cfx-btn.pri:hover:not(:disabled), .cfx-btn.solid:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
.cfx-btn.dng { border-color:color-mix(in oklch, var(--v2-crit) 45%, var(--v2-line)); color:var(--v2-crit); }
.cfx-btn.dng:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 8%, var(--v2-surface)); }
.cfx-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }
.cfx-tabs { display:flex; gap:4px; border-bottom:1px solid var(--v2-line); overflow-x:auto; scrollbar-width:none; }
.cfx-tab { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 10px; border:0; background:transparent; color:var(--v2-fg-2); font:500 13.5px var(--font-ui); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
.cfx-tab:hover { color:var(--v2-fg); }
.cfx-tab.on { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
.cfx-day { height:28px; padding:0 10px; border-radius:6px; font:500 12.5px var(--font-ui); border:1px solid var(--v2-line); cursor:pointer; color:var(--v2-fg-2); background:var(--v2-surface); }
.cfx-day.on { background:var(--v2-surface-2); color:var(--v2-fg); border-color:var(--v2-line-strong); }
.cfx-block { position:relative; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; min-width:0; }
.cfx-block-h { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--v2-line); }
.cfx-block-t { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; }
.cfx-block-t svg { color:var(--v2-fg-3); }
.cfx-block-b { padding:16px; min-width:0; display:flex; flex-direction:column; gap:14px; transition:opacity .2s ease; }
.cfx-busy > .cfx-block-b { opacity:.45; pointer-events:none; }
.cfx-load-bar { position:absolute; left:0; right:0; top:0; height:2px; overflow:hidden; opacity:0; transition:opacity .2s; z-index:3; border-radius:12px 12px 0 0; pointer-events:none; }
.cfx-load-bar::after { content:""; position:absolute; top:0; bottom:0; width:35%; background:var(--v2-accent); animation:cfx-slide 1.1s ease-in-out infinite; }
.cfx-loading > .cfx-load-bar, .cfx-busy > .cfx-load-bar { opacity:1; }
.cfx-load-pill { position:absolute; left:50%; top:52px; transform:translateX(-50%); z-index:4; display:inline-flex; align-items:center; gap:8px; padding:5px 12px; border-radius:999px; background:var(--v2-surface); border:1px solid var(--v2-line); box-shadow:0 6px 18px rgba(0,0,0,.14); font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; pointer-events:none; }
.cfx-load-spin { width:12px; height:12px; border:2px solid var(--v2-line); border-top-color:var(--v2-accent); border-radius:50%; animation:cfx-spin .8s linear infinite; }
.cfx-skel { display:inline-block; vertical-align:middle; max-width:100%; border-radius:4px; background:linear-gradient(90deg, var(--v2-surface-2) 0%, var(--v2-hover) 50%, var(--v2-surface-2) 100%); background-size:200% 100%; animation:cfx-shimmer 1.3s ease-in-out infinite; }
.cfx-skel-chart { display:block; width:100%; border-radius:8px; }
.cfx-fade { display:inline-block; animation:cfx-fadein .22s ease-out both; }
.cfx-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.cfx-kpi { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:6px; min-width:0; }
.cfx-kpi-l { font-size:12.5px; color:var(--v2-fg-3); }
.cfx-kpi-v { font-size:22px; font-weight:600; letter-spacing:-.02em; line-height:1.1; color:var(--kc, var(--v2-fg)); font-variant-numeric:tabular-nums; }
.cfx-kpi-s { font-size:12px; color:var(--v2-fg-3); }
.cfx-chips { display:flex; gap:6px; flex-wrap:wrap; }
.cfx-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-radius:999px; font:500 12.5px var(--font-ui); border:1px solid var(--v2-line); cursor:pointer; color:var(--v2-fg-2); background:var(--v2-surface); }
.cfx-chip:hover { color:var(--v2-fg); }
.cfx-chip.on { color:var(--cc, var(--v2-accent)); background:color-mix(in oklch, var(--cc, var(--v2-accent)) 12%, transparent); border-color:color-mix(in oklch, var(--cc, var(--v2-accent)) 45%, transparent); }
.cfx-badge { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:6px; font:500 12px var(--font-ui); white-space:nowrap; color:var(--bc); background:color-mix(in oklch, var(--bc) 12%, transparent); border:1px solid color-mix(in oklch, var(--bc) 30%, transparent); }
.cfx-badge .cfx-dot { width:5px; height:5px; }
.cfx-tbl-wrap { overflow-x:auto; }
.cfx-tbl { width:100%; border-collapse:collapse; font-size:13px; }
.cfx-tbl th { text-align:left; font-weight:500; font-size:12px; color:var(--v2-fg-3); padding:9px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.cfx-tbl td { padding:9px 12px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
.cfx-tbl tr:last-child td { border-bottom:0; }
.cfx-tbl .r { text-align:right; font-variant-numeric:tabular-nums; font-family:var(--font-data); }
.cfx-tbl-scroll { max-height:520px; overflow:auto; border:1px solid var(--v2-line); border-radius:10px; }
.cfx-tbl-scroll thead th { position:sticky; top:0; z-index:1; background:var(--v2-surface); }
.cfx-host { font-family:var(--font-data); font-weight:500; font-size:12.5px; word-break:break-all; }
.cfx-host small { display:block; font-weight:400; font-size:12px; color:var(--v2-fg-3); margin-top:2px; }
.cfx-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
.cfx-bl { display:flex; flex-direction:column; gap:7px; }
.cfx-bl-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; font-size:12.5px; padding:3px 4px; }
.cfx-bl-row .k { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cfx-bl-row .v { font-family:var(--font-data); color:var(--v2-fg-2); font-size:12px; }
.cfx-bl-row .t { grid-column:1 / -1; height:4px; border-radius:2px; background:var(--v2-surface-2); overflow:hidden; }
.cfx-bl-row .t b { display:block; height:100%; background:var(--bc, var(--v2-accent)); }
.cfx-note { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; border:1px solid color-mix(in oklch, var(--nc) 35%, transparent); background:color-mix(in oklch, var(--nc) 8%, transparent); color:var(--v2-fg); }
.cfx-note > svg { color:var(--nc); flex-shrink:0; margin-top:2px; }
.cfx-note b { color:var(--nc); }
.cfx-input { font:13px var(--font-data); background:var(--v2-surface); color:var(--v2-fg); border:1px solid var(--v2-line); border-radius:8px; height:32px; padding:0 10px; min-width:0; }
.cfx-input:focus { outline:2px solid var(--v2-accent); outline-offset:1px; }
.cfx-bubble { min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--v2-crit); color:#fff; font:600 11px var(--font-data); display:inline-grid; place-items:center; line-height:1; }
.cfx-alert-dot { width:8px; height:8px; border-radius:50%; background:var(--v2-crit); display:inline-block; }
@keyframes cfx-slide { from { left:-35%; } to { left:100%; } }
@keyframes cfx-spin { to { transform:rotate(360deg); } }
@keyframes cfx-shimmer { from { background-position:100% 0; } to { background-position:-100% 0; } }
@keyframes cfx-fadein { from { opacity:0; transform:translateY(2px); } to { opacity:1; transform:none; } }
@media (max-width:860px) { .cfx-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:560px) { .zo-metric { grid-template-columns:1fr !important; } }
@media (prefers-reduced-motion:reduce) {
  .cfx-skel, .cfx-load-bar::after, .cfx-load-spin, .cfx-fade { animation:none; }
  .cfx-block-b { transition:none; }
}
`;
