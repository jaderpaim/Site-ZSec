/**
 * Layout único dos e-mails do sistema: fundo claro, cabeçalho com a marca e o
 * módulo, selo de status, título que diz o que aconteceu, blocos de conteúdo
 * (fatos, antes/depois, tabela, aviso), um botão principal e rodapé dizendo
 * por que a pessoa recebeu. Tabelas + estilos inline para Outlook/Gmail; o
 * modo escuro vem por @media onde o cliente suporta.
 */
import { APP_NAME } from "@/lib/brand";

export function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type Tone = "info" | "ok" | "warn" | "crit" | "neutral";
const TONE: Record<Tone, { fg: string; bg: string; line: string }> = {
  info: { fg: "#1d4ed8", bg: "#eff6ff", line: "#2563eb" },
  ok: { fg: "#047857", bg: "#ecfdf5", line: "#059669" },
  warn: { fg: "#b45309", bg: "#fffbeb", line: "#d97706" },
  crit: { fg: "#b91c1c", bg: "#fef2f2", line: "#dc2626" },
  neutral: { fg: "#374151", bg: "#f3f4f6", line: "#6b7280" },
};
const C = {
  page: "#f3f4f6",
  card: "#ffffff",
  line: "#e5e7eb",
  fg: "#111827",
  fg2: "#374151",
  muted: "#6b7280",
  accent: "#2563eb",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

export type Fact = { label: string; value: string; mono?: boolean; html?: string };
export type Block =
  | { kind: "facts"; title?: string; items: Fact[] }
  | { kind: "diff"; title?: string; items: Array<{ label: string; before: string; after: string }> }
  | {
      kind: "table";
      title?: string;
      columns: Array<{ label: string; align?: "left" | "right" }>;
      rows: Array<Array<{ text: string; mono?: boolean; chip?: Tone }>>;
      more?: string;
    }
  | { kind: "note"; tone: Tone; title?: string; text: string }
  | { kind: "text"; text: string }
  // HTML já pronto (ex.: tabela vinda de um token de template)
  | { kind: "html"; html: string };

export type EmailSpec = {
  module: string;
  tone: Tone;
  status: string; // texto do selo
  title: string;
  intro: string; // pode conter <strong>
  preheader: string;
  blocks: Block[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  meta?: string; // "Feito por X · data"
  reason: string; // por que recebeu
  replyable?: boolean; // true = rodapé convida a responder (padrão: "não responda")
};

const label = (t: string) =>
  `<div style="font:600 12px/1.4 ${FONT};color:${C.muted};margin:0 0 8px;">${esc(t)}</div>`;

export function emailChip(text: string, tone: Tone) {
  const t = TONE[tone];
  return `<span class="chip-${tone}" style="display:inline-block;padding:2px 8px;border-radius:999px;background:${t.bg};color:${t.fg};font:600 12px/18px ${FONT};white-space:nowrap;">${esc(text)}</span>`;
}

export function renderEmailBlock(b: Block): string {
  if (b.kind === "html") return b.html;
  if (b.kind === "text")
    return `<p style="margin:0;font:15px/1.6 ${FONT};color:${C.fg2};">${b.text}</p>`;
  if (b.kind === "note") {
    const t = TONE[b.tone];
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;"><tr><td class="note" style="background:${t.bg};border-left:3px solid ${t.line};border-radius:6px;padding:12px 14px;">
${b.title ? `<div style="font:600 13px/1.4 ${FONT};color:${t.fg};margin-bottom:4px;">${esc(b.title)}</div>` : ""}<div style="font:14px/1.6 ${FONT};color:${C.fg2};">${esc(b.text)}</div></td></tr></table>`;
  }
  if (b.kind === "facts") {
    const rows = b.items
      .map(
        (f, i) =>
          `<tr><td class="lbl" valign="top" style="padding:10px 12px 10px 0;width:150px;font:13px/1.5 ${FONT};color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ""}">${esc(f.label)}</td><td valign="top" class="val" style="padding:10px 0;font:${f.mono ? `13px/1.5 ${MONO}` : `14px/1.5 ${FONT}`};color:${C.fg};word-break:break-word;${i ? `border-top:1px solid ${C.line};` : ""}">${f.html ?? esc(f.value).replace(/\n/g, "<br/>")}</td></tr>`,
      )
      .join("");
    return `${b.title ? label(b.title) : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="facts">${rows}</table>`;
  }
  if (b.kind === "diff") {
    const rows = b.items
      .map(
        (d, i) => `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ""}">
<div style="font:13px/1.5 ${FONT};color:${C.muted};margin-bottom:6px;">${esc(d.label)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;"><tr>
<td class="del" style="background:#fef2f2;border-radius:6px;padding:8px 10px;font:13px/1.5 ${MONO};color:#991b1b;word-break:break-all;"><span style="color:#b91c1c;font-weight:700;">&minus;</span>&nbsp; ${esc(d.before) || "<em>vazio</em>"}</td></tr>
<tr><td style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="add" style="background:#ecfdf5;border-radius:6px;padding:8px 10px;font:13px/1.5 ${MONO};color:#065f46;word-break:break-all;"><span style="color:#047857;font-weight:700;">+</span>&nbsp; ${esc(d.after) || "<em>vazio</em>"}</td>
</tr></table></td></tr>`,
      )
      .join("");
    return `${b.title ? label(b.title) : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`;
  }
  // table
  const th = b.columns
    .map(
      (c) =>
        `<th align="${c.align ?? "left"}" style="padding:8px 10px;background:#f9fafb;border-bottom:1px solid ${C.line};font:600 12px/1.4 ${FONT};color:${C.muted};text-align:${c.align ?? "left"};white-space:nowrap;">${esc(c.label)}</th>`,
    )
    .join("");
  const tr = b.rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell, i) => {
            const al = b.columns[i]?.align ?? "left";
            const inner = cell.chip ? emailChip(cell.text, cell.chip) : esc(cell.text);
            return `<td align="${al}" style="padding:9px 10px;border-bottom:1px solid ${C.line};font:${cell.mono ? `12.5px/1.5 ${MONO}` : `13.5px/1.5 ${FONT}`};color:${C.fg};text-align:${al};word-break:break-word;">${inner}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `${b.title ? label(b.title) : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="dt" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;overflow:hidden;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>${b.more ? `<div style="font:13px/1.5 ${FONT};color:${C.muted};margin-top:8px;">${esc(b.more)}</div>` : ""}`;
}

function button(label: string, url: string, color: string) {
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" stroke="f" fillcolor="${color}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">${esc(label)}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${url}" class="btn" style="display:inline-block;background:${color};color:#ffffff;font:600 15px/44px ${FONT};padding:0 22px;border-radius:8px;text-decoration:none;mso-hide:all;">${esc(label)}</a><!--<![endif]-->`;
}

export function renderEmail(s: EmailSpec): string {
  const t = TONE[s.tone];
  const btnColor = s.tone === "crit" ? TONE.crit.line : C.accent;
  const body = s.blocks
    .map((b) => `<tr><td class="px" style="padding:0 32px 24px;">${renderEmailBlock(b)}</td></tr>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="x-apple-disable-message-reformatting"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/>
<title>${esc(s.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
a{color:${C.accent};}
@media (max-width:600px){
  .px{padding-left:20px!important;padding-right:20px!important;}
  .facts td.lbl,.facts td.val{display:block;width:auto!important;}
  .facts td.lbl{padding:10px 0 2px!important;}
  .facts td.val{padding:0 0 10px!important;border-top:0!important;}
  .btn{display:block!important;text-align:center!important;}
  h1{font-size:20px!important;}
}
@media (prefers-color-scheme:dark){
  .page{background:#0f1115!important;}
  .card{background:#181b21!important;border-color:#2a2f38!important;}
  h1,.val,.dt td,.fg{color:#f3f4f6!important;}
  .intro,.note div{color:#c9ced6!important;}
  .lbl,.muted,.dt th{color:#9aa1ad!important;}
  .dt th{background:#1f232a!important;}
  .dt,.dt td,.dt th,.facts td{border-color:#2a2f38!important;}
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(s.preheader)}&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="page" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td style="padding:0 4px 14px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    <td valign="middle"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td width="26" height="26" align="center" valign="middle" style="background:#111827;border-radius:7px;font:700 14px/26px ${FONT};color:#ffffff;">Z</td>
      <td style="padding-left:8px;font:700 15px/1 ${FONT};color:${C.fg};" class="fg">${APP_NAME}</td>
    </tr></table></td>
    <td align="right" valign="middle" class="muted" style="font:13px/1 ${FONT};color:${C.muted};">${esc(s.module)}</td>
  </tr></table>
</td></tr>
<tr><td class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:12px;overflow:hidden;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr><td style="height:4px;background:${t.line};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td class="px" style="padding:28px 32px 0;">${emailChip(s.status, s.tone)}</td></tr>
    <tr><td class="px" style="padding:14px 32px 0;"><h1 style="margin:0;font:700 22px/1.3 ${FONT};color:${C.fg};">${esc(s.title)}</h1></td></tr>
    <tr><td class="px" style="padding:10px 32px 24px;"><p class="intro" style="margin:0;font:15px/1.6 ${FONT};color:${C.fg2};">${s.intro}</p></td></tr>
    ${body}
    ${s.cta ? `<tr><td class="px" style="padding:4px 32px ${s.secondary ? "12px" : "28px"};">${button(s.cta.label, s.cta.url, btnColor)}</td></tr>` : ""}
    ${s.secondary ? `<tr><td class="px" style="padding:0 32px 28px;font:14px/1.5 ${FONT};"><a href="${s.secondary.url}" style="color:${C.accent};text-decoration:underline;">${esc(s.secondary.label)}</a></td></tr>` : ""}
    ${s.meta ? `<tr><td class="px muted" style="padding:14px 32px;border-top:1px solid ${C.line};font:13px/1.5 ${FONT};color:${C.muted};">${s.meta}</td></tr>` : ""}
  </table>
</td></tr>
<tr><td class="muted" style="padding:16px 8px 0;font:12px/1.6 ${FONT};color:${C.muted};text-align:center;">
  ${esc(s.reason)}<br/>Mensagem automática do ${APP_NAME}${s.replyable ? " · dúvidas: responda este e-mail." : " · não responda este e-mail."}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

/** Tom do selo de prazo: vermelho até 7 dias, âmbar até 30, verde depois. */
export function daysTone(days: number): Tone {
  return days <= 7 ? "crit" : days <= 30 ? "warn" : "ok";
}

/** Destaque de nome/ator dentro do texto (mantém contraste no modo escuro). */
export function emailStrong(text: string): string {
  return `<strong class="fg" style="color:#111827;">${esc(text)}</strong>`;
}
