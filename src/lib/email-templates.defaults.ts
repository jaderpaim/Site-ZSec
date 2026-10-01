/**
 * Default HTML builders for every SMTP template.
 * Pure functions — no async, no env vars, no DB access.
 * Import these in functions files instead of writing HTML inline.
 */
import { escapeHtml } from "./email-templates.functions";

function tipoStyle(tipo: string): { bg: string; color: string } {
  if (tipo === "Emergencial") return { bg: "#450a0a", color: "#fca5a5" };
  if (tipo === "Prioritária") return { bg: "#451a03", color: "#fdba74" };
  return { bg: "#172554", color: "#93c5fd" };
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return s;
  }
}

// ─── Cloudflare ───────────────────────────────────────────────────────────────

export function buildDnsRecordCreatedHtml(args: {
  zona: string;
  tipo: string;
  nome: string;
  conteudo: string;
  proxy: string;
  criado_por: string;
  link: string;
}): string {
  const { zona, tipo, nome, conteudo, proxy, criado_por, link } = args;
  const proxyAtivo = proxy.toLowerCase().startsWith("ativ");
  const proxyStyle = proxyAtivo ? { bg: "#451a03", color: "#fdba74" } : { bg: "#1f2937", color: "#9ca3af" };

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Novo registro DNS — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">Novo registro DNS criado em ${escapeHtml(zona)} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP verde -->
<tr><td bgcolor="#059669" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Cloudflare WAF</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#0a1f1a" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#052e16" style="border-radius:20px;border:1px solid #059669;padding:7px 20px;">
      <span style="font-size:11px;color:#6ee7b7;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#10003;&nbsp; REGISTRO DNS CRIADO</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">Um novo registro DNS<br/>foi criado na Cloudflare</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    A altera&ccedil;&atilde;o foi aplicada via painel B&#8209;Security<br/>na aba Opera&ccedil;&otilde;es do m&oacute;dulo Cloudflare WAF.
  </p>
</td></tr>

<!-- CARD REGISTRO -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">

    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">ZONA</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(zona)}</div>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">TIPO</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="#172554" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:#93c5fd;font-family:Arial,sans-serif;">${escapeHtml(tipo)}</span>
              </td>
            </tr></table>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">PROXY</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="${proxyStyle.bg}" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:${proxyStyle.color};font-family:Arial,sans-serif;">${escapeHtml(proxy)}</span>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">NOME</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;word-break:break-all;">${escapeHtml(nome)}</div>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">CONTE&Uacute;DO</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;word-break:break-all;">${escapeHtml(conteudo)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Status criado -->
    <tr><td bgcolor="#052e16" style="padding:16px 24px;" align="center">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">CRIADO POR</div>
      <div style="font-size:16px;font-weight:700;color:#6ee7b7;font-family:Arial,sans-serif;">${escapeHtml(criado_por)}</div>
    </td></tr>

  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#059669">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ver no painel</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#059669" style="border-radius:10px;">
      <a href="${link}" style="background-color:#059669;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ver no painel</a>
    </td></tr>
  </table><!--<![endif]-->
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#059669" width="4" style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong> para administradores globais.
          Acesse o sistema para revisar a altera&ccedil;&atilde;o.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do m&oacute;dulo Cloudflare WAF.</div>
</td></tr>

<!-- ACCENT BOTTOM verde -->
<tr><td bgcolor="#047857" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

export function buildDnsRecordUpdatedHtml(args: {
  zona: string;
  tipo: string;
  nome: string;
  conteudo_anterior: string;
  conteudo_novo: string;
  proxy: string;
  editado_por: string;
  link: string;
  // Diff campo a campo (calculado em updateDnsRecord/diffObjects). Sem isso o
  // card "Conteúdo anterior/novo" aparecia SEMPRE, mesmo quando o conteúdo não
  // mudou (ex.: só o proxy foi ligado) — dava a entender que o conteúdo tinha
  // mudado quando na verdade era outro campo.
  changes?: Array<{ path: string; before: unknown; after: unknown }>;
}): string {
  const { zona, tipo, nome, conteudo_anterior, conteudo_novo, proxy, editado_por, link, changes = [] } = args;
  const proxyAtivo = proxy.toLowerCase().startsWith("ativ");
  const proxyStyle = proxyAtivo ? { bg: "#451a03", color: "#fdba74" } : { bg: "#1f2937", color: "#9ca3af" };
  const contentChanged = conteudo_anterior !== conteudo_novo;
  // changes já vem calculado por quem chama; se não vier (chamador antigo),
  // cai pro comportamento anterior (só compara conteúdo).
  const effectiveChanges = changes.length > 0 ? changes : contentChanged ? [{ path: "content", before: conteudo_anterior, after: conteudo_novo }] : [];
  const FIELD_LABEL: Record<string, string> = {
    content: "Conte&uacute;do",
    name: "Nome",
    type: "Tipo",
    ttl: "TTL",
    proxied: "Proxy",
    comment: "Coment&aacute;rio",
  };
  const fmtVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const changesRowsHtml = effectiveChanges
    .map(
      (c, i) => `
    <tr><td bgcolor="#111827" style="padding:14px 24px;${i < effectiveChanges.length - 1 ? "border-bottom:1px solid #1e2a3a;" : ""}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td width="26%" style="font-size:10px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;" valign="top">${FIELD_LABEL[c.path] ?? escapeHtml(c.path)}</td>
        <td width="37%" style="font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;text-decoration:line-through;word-break:break-all;" valign="top">${escapeHtml(fmtVal(c.before))}</td>
        <td width="37%" style="font-size:13px;color:#fdba74;font-weight:600;font-family:Arial,sans-serif;word-break:break-all;" valign="top">${escapeHtml(fmtVal(c.after))}</td>
      </tr></table>
    </td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Registro DNS editado — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">Registro DNS editado em ${escapeHtml(zona)} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP âmbar -->
<tr><td bgcolor="#d97706" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Cloudflare WAF</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#1f1706" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#451a03" style="border-radius:20px;border:1px solid #d97706;padding:7px 20px;">
      <span style="font-size:11px;color:#fdba74;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#9998;&nbsp; REGISTRO DNS ATUALIZADO</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">Um registro DNS existente<br/>foi editado na Cloudflare</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    A altera&ccedil;&atilde;o foi aplicada via painel B&#8209;Security<br/>na aba Opera&ccedil;&otilde;es do m&oacute;dulo Cloudflare WAF.
  </p>
</td></tr>

<!-- CARD REGISTRO -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">

    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">ZONA</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(zona)}</div>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">TIPO</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="#172554" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:#93c5fd;font-family:Arial,sans-serif;">${escapeHtml(tipo)}</span>
              </td>
            </tr></table>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">PROXY</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="${proxyStyle.bg}" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:${proxyStyle.color};font-family:Arial,sans-serif;">${escapeHtml(proxy)}</span>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:16px 24px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">NOME</div>
      <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;word-break:break-all;">${escapeHtml(nome)}</div>
    </td></tr>

    ${
      effectiveChanges.length > 0
        ? `<tr><td bgcolor="#111827" style="padding:16px 24px 8px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">O QUE MUDOU</div>
    </td></tr>
    ${changesRowsHtml}`
        : `<tr><td bgcolor="#111827" style="padding:16px 24px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">Nenhum campo alterado (reenviado igual).</div>
    </td></tr>`
    }

    <!-- Status editado -->
    <tr><td bgcolor="#1f1706" style="padding:16px 24px;" align="center">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">EDITADO POR</div>
      <div style="font-size:16px;font-weight:700;color:#fdba74;font-family:Arial,sans-serif;">${escapeHtml(editado_por)}</div>
    </td></tr>

  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#d97706">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ver no painel</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#d97706" style="border-radius:10px;">
      <a href="${link}" style="background-color:#d97706;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ver no painel</a>
    </td></tr>
  </table><!--<![endif]-->
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#d97706" width="4" style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong> para administradores globais.
          Acesse o sistema para revisar a altera&ccedil;&atilde;o.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do m&oacute;dulo Cloudflare WAF.</div>
</td></tr>

<!-- ACCENT BOTTOM âmbar -->
<tr><td bgcolor="#b45309" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

// Template compartilhado pras 3 notificações de mudança em Cloudflare Rules
// (editada/habilitada-desabilitada/excluída) — mesma "casca" visual dos
// templates de DNS acima (header/hero/card/CTA/footer), só que genérico e
// data-driven (facts + ator), pra não repetir ~150 linhas de HTML por ação.
export function buildRuleAlertHtml(args: {
  badge: string; // ex.: "REGRA EDITADA"
  heroTitle: string; // ex.: "Uma regra de Rules foi editada"
  accentColor: string; // hex, ex.: "#d97706"
  accentBg: string; // hex escuro pro hero/status, ex.: "#2d1a06"
  zona: string;
  categoria: string;
  descricao: string;
  extraFacts?: Array<{ label: string; value: string }>;
  atorLabel: string; // ex.: "EDITADO POR"
  ator: string;
  atorColor: string; // ex.: "#fdba74"
  link: string;
}): string {
  const { badge, heroTitle, accentColor, accentBg, zona, categoria, descricao, extraFacts = [], atorLabel, ator, atorColor, link } = args;
  const factsRows: Array<Array<{ label: string; value: string }>> = [];
  const baseFacts = [
    { label: "CATEGORIA", value: categoria },
    { label: "DESCRIÇÃO", value: descricao },
    ...extraFacts,
  ];
  for (let i = 0; i < baseFacts.length; i += 2) factsRows.push(baseFacts.slice(i, i + 2));

  const factsHtml = factsRows
    .map((row, idx) => {
      const isLast = idx === factsRows.length - 1;
      const cells = row
        .map(
          (f, i) => `
          <td width="${row.length === 1 ? "100%" : "50%"}" style="padding:16px 24px;${i === 0 && row.length > 1 ? "border-right:1px solid #1e2a3a;" : ""}" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">${escapeHtml(f.label)}</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;word-break:break-word;">${escapeHtml(f.value)}</div>
          </td>`,
        )
        .join("");
      return `<tr><td bgcolor="#111827" style="padding:0;${isLast ? "" : "border-bottom:1px solid #1e2a3a;"}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${cells}</tr></table></td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${escapeHtml(heroTitle)} — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">${escapeHtml(heroTitle)} em ${escapeHtml(zona)} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<tr><td bgcolor="${accentColor}" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Cloudflare WAF — Rules</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<tr><td bgcolor="${accentBg}" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#111827" style="border-radius:20px;border:1px solid ${accentColor};padding:7px 20px;">
      <span style="font-size:11px;color:${atorColor};letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">${escapeHtml(badge)}</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">${escapeHtml(heroTitle)}</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    A altera&ccedil;&atilde;o foi aplicada via painel B&#8209;Security<br/>na aba Opera&ccedil;&otilde;es do m&oacute;dulo Cloudflare WAF.
  </p>
</td></tr>

<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">

    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">ZONA</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(zona)}</div>
    </td></tr>

    ${factsHtml}

    <tr><td bgcolor="${accentBg}" style="padding:16px 24px;" align="center">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">${escapeHtml(atorLabel)}</div>
      <div style="font-size:16px;font-weight:700;color:${atorColor};font-family:Arial,sans-serif;">${escapeHtml(ator)}</div>
    </td></tr>

  </table>
</td></tr>

<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="${accentColor}">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ver no painel</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="${accentColor}" style="border-radius:10px;">
      <a href="${link}" style="background-color:${accentColor};border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ver no painel</a>
    </td></tr>
  </table><!--<![endif]-->
</td></tr>

<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="${accentColor}" width="4" style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong> para administradores globais.
          Acesse o sistema para revisar a altera&ccedil;&atilde;o.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do m&oacute;dulo Cloudflare WAF.</div>
</td></tr>

<tr><td bgcolor="${accentColor}" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── CMDB ─────────────────────────────────────────────────────────────────────

export function buildCmdbDeviceAlertHtml(tabela: string): string {
  return `<div style="font-family:Arial,sans-serif">
  <h3>Device Alert</h3>
  <p>Os ativos abaixo estão presentes em apenas <b>um</b> dos sistemas de monitoramento (SIEM ou Zabbix).</p>
  ${tabela}
</div>`;
}

export function buildCmdbDeviceStoppedHtml(tabela: string): string {
  return `<div style="font-family:Arial,sans-serif">
  <h3>Device Stopped</h3>
  <p>Os ativos abaixo <b>não foram localizados</b> no SIEM nem no Zabbix.</p>
  ${tabela}
</div>`;
}

// ─── Domínios / SSL ───────────────────────────────────────────────────────────

export function buildDomainExpiryAlertHtml(tabela: string): string {
  return `<div style="font-family:Arial,sans-serif"><h3>Domínios próximos do vencimento</h3>${tabela}</div>`;
}

export function buildSslExpiryAlertHtml(tabela: string): string {
  return `<div style="font-family:Arial,sans-serif"><h3>Certificados SSL próximos do vencimento</h3>${tabela}</div>`;
}

// ─── Fornecedores ─────────────────────────────────────────────────────────────

export function buildFornecedorExpiryAlertHtml(args: {
  nome: string;
  servico: string;
  vencimento: string;
  dias: number;
}): string {
  const { nome, servico, vencimento, dias } = args;
  const diasColor = dias <= 7 ? "#c1121f" : "#d4a017";
  const nomeEsc = escapeHtml(nome);
  const servicoEsc = escapeHtml(servico);
  const vencimentoEsc = escapeHtml(vencimento);
  return `<div style="font-family:Arial,sans-serif">
  <h3>Contrato de fornecedor próximo do vencimento</h3>
  <table style="border-collapse:collapse">
    <tbody>
      <tr><td style="padding:6px 12px;border:1px solid #ddd"><b>Fornecedor</b></td><td style="padding:6px 12px;border:1px solid #ddd">${nomeEsc}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #ddd"><b>Serviço prestado</b></td><td style="padding:6px 12px;border:1px solid #ddd">${servicoEsc}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #ddd"><b>Vencimento</b></td><td style="padding:6px 12px;border:1px solid #ddd">${vencimentoEsc}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #ddd"><b>Dias restantes</b></td><td style="padding:6px 12px;border:1px solid #ddd;color:${diasColor}"><b>${dias} dia(s)</b></td></tr>
    </tbody>
  </table>
</div>`;
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

// E-mail de boas-vindas para usuário recém-criado (convite p/ definir senha).
// Layout baseado na tela de login (login.tsx): tema escuro, escudo com ∞,
// wordmark "B-Security / Security Suite" e acento azul.
export function buildUserInviteHtml(args: {
  fullName: string;
  email: string;
  roleLabel: string;
  inviteUrl: string;
}): string {
  const nome = escapeHtml(args.fullName);
  const emailEsc = escapeHtml(args.email);
  const papel = escapeHtml(args.roleLabel);
  const url = args.inviteUrl;
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Bem-vindo ao B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">Sua conta no B-Security foi criada &#8212; ative seu acesso. &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP -->
<tr><td bgcolor="#2563eb" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:16px;">
    <tr><td bgcolor="#1e3a6e" width="56" height="56" align="center" valign="middle" style="border-radius:14px;border:1px solid #3b82f6;">
      <span style="font-size:30px;color:#93c5fd;font-weight:700;line-height:56px;font-family:Arial,sans-serif;">&#8734;</span>
    </td></tr>
  </table>
  <div style="font-size:26px;font-weight:700;color:#f8fafc;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Acesso ao Painel</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#0f1623" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#1e3a6e" style="border-radius:20px;border:1px solid #3b82f6;padding:7px 20px;">
      <span style="font-size:11px;color:#93c5fd;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#9679;&nbsp; CONTA CRIADA</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#f8fafc;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">Bem-vindo(a) ao B-Security!</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    Ol&aacute;, <strong style="color:#ffffff;">${nome}</strong>!<br/>Sua conta foi criada com sucesso. Clique no bot&atilde;o abaixo para ativ&aacute;-la e, em seguida, acesse o sistema pelo SSO da sua organiza&ccedil;&atilde;o.
  </p>
</td></tr>

<!-- CARD DADOS -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">
    <tr>
      <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;" valign="top">
        <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">E-MAIL DE ACESSO</div>
        <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;word-break:break-all;">${emailEsc}</div>
      </td>
      <td width="50%" style="padding:16px 24px;border-bottom:1px solid #1e2a3a;" valign="top">
        <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">PERFIL</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td bgcolor="#172554" style="border-radius:4px;padding:5px 14px;">
            <span style="font-size:12px;font-weight:700;color:#93c5fd;font-family:Arial,sans-serif;">${papel}</span>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr><td colspan="2" bgcolor="#0d1320" style="padding:14px 24px;" align="center">
      <div style="font-size:12px;color:#9ca3af;line-height:1.6;font-family:Arial,sans-serif;">O link de ativa&ccedil;&atilde;o &eacute; pessoal e tem validade limitada. N&atilde;o &eacute; necess&aacute;rio criar senha &mdash; o acesso &eacute; via SSO.</div>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#2563eb">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ativar minha conta</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#2563eb" style="border-radius:10px;">
      <a href="${url}" style="background-color:#2563eb;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ativar minha conta</a>
    </td></tr>
  </table><!--<![endif]-->
  <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
    Se o bot&atilde;o n&atilde;o funcionar, copie o link:<br/>
    <a href="${url}" style="color:#3b82f6;text-decoration:none;word-break:break-all;font-size:11px;">${url}</a>
  </p>
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#1d4ed8" width="4" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong>.
          Se voc&ecirc; n&atilde;o esperava este convite, ignore esta mensagem. N&atilde;o compartilhe este link.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">Suite de Seguran&ccedil;a exclusiva do <strong style="color:#d1d5db;">Bernoulli Educa&ccedil;&atilde;o</strong><br/>&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite.</div>
</td></tr>

<!-- ACCENT BOTTOM -->
<tr><td bgcolor="#1d4ed8" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── GMUD ─────────────────────────────────────────────────────────────────────

export function buildGmudApprovedHtml(g: any, approveUrl: string): string {
  const ts = tipoStyle(g.tipo);
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>GMUD Aprovada — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">GMUD aprovada: ${escapeHtml(g.titulo)} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP verde -->
<tr><td bgcolor="#059669" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Gest&atilde;o de Mudan&ccedil;as</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#0a1f1a" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#052e16" style="border-radius:20px;border:1px solid #059669;padding:7px 20px;">
      <span style="font-size:11px;color:#6ee7b7;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#10003;&nbsp; GMUD APROVADA</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">Sua GMUD foi aprovada<br/>por todos os aprovadores!</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    Voc&ecirc; j&aacute; pode iniciar a execu&ccedil;&atilde;o da mudan&ccedil;a<br/>na janela de manuten&ccedil;&atilde;o planejada.
  </p>
</td></tr>

<!-- CARD GMUD -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">

    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">T&Iacute;TULO DA GMUD</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(g.titulo)}</div>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">TIPO</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="${ts.bg}" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:${ts.color};font-family:Arial,sans-serif;">${escapeHtml(g.tipo)}</span>
              </td>
            </tr></table>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">IMPACTO</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${escapeHtml(g.impacto)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td bgcolor="#0d1320" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td colspan="2" align="center" style="padding:14px 24px 8px;">
          <div style="font-size:10px;color:#059669;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:700;">&#8212;&nbsp;&nbsp;Janela de Manuten&ccedil;&atilde;o&nbsp;&nbsp;&#8212;</div>
        </td></tr>
        <tr>
          <td width="50%" align="center" style="padding:6px 24px 18px;border-right:1px solid #1e2a3a;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">IN&Iacute;CIO</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_inicio)}</div>
          </td>
          <td width="50%" align="center" style="padding:6px 24px 18px;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">FIM</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_fim)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Status aprovada -->
    <tr><td bgcolor="#052e16" style="padding:16px 24px;" align="center">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">STATUS</div>
      <div style="font-size:16px;font-weight:700;color:#6ee7b7;font-family:Arial,sans-serif;">&#10003;&nbsp; Aprovada por todos os aprovadores</div>
    </td></tr>

  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${approveUrl}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#059669">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ver GMUD</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#059669" style="border-radius:10px;">
      <a href="${approveUrl}" style="background-color:#059669;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ver GMUD</a>
    </td></tr>
  </table><!--<![endif]-->
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#059669" width="4" style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong>.
          Acesse o sistema para acompanhar a execu&ccedil;&atilde;o da mudan&ccedil;a.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do sistema de gest&atilde;o de mudan&ccedil;as.</div>
</td></tr>

<!-- ACCENT BOTTOM verde -->
<tr><td bgcolor="#047857" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

export function buildGmudRejectedHtml(
  g: any,
  approveUrl: string,
  rejectedByName: string,
  motivo: string | null,
): string {
  const ts = tipoStyle(g.tipo);
  const motivoRow = motivo
    ? `<tr><td bgcolor="#111827" style="padding:16px 24px;border-top:1px solid #2a1414;"><div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">MOTIVO DA REJEI&Ccedil;&Atilde;O</div><div style="font-size:13px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">${escapeHtml(motivo)}</div></td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>GMUD Rejeitada — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">GMUD rejeitada: ${escapeHtml(g.titulo)} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP vermelho -->
<tr><td bgcolor="#dc2626" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Gest&atilde;o de Mudan&ccedil;as</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#1f0a0a" align="center" style="padding:44px 48px 32px;border-top:1px solid #2a1414;border-bottom:1px solid #2a1414;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#450a0a" style="border-radius:20px;border:1px solid #dc2626;padding:7px 20px;">
      <span style="font-size:11px;color:#fca5a5;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#10007;&nbsp; GMUD REJEITADA</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">Sua GMUD foi rejeitada<br/>por ${escapeHtml(rejectedByName)}</h1>
  <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    Confira o motivo abaixo e, se necess&aacute;rio,<br/>ajuste e abra uma nova solicita&ccedil;&atilde;o.
  </p>
</td></tr>

<!-- CARD GMUD -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #2a1414;border-radius:12px;overflow:hidden;">

    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #2a1414;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">T&Iacute;TULO DA GMUD</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(g.titulo)}</div>
    </td></tr>

    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #2a1414;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #2a1414;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">TIPO</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="${ts.bg}" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:${ts.color};font-family:Arial,sans-serif;">${escapeHtml(g.tipo)}</span>
              </td>
            </tr></table>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">IMPACTO</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${escapeHtml(g.impacto)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td bgcolor="#0d1320" style="padding:0;border-bottom:1px solid #2a1414;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td colspan="2" align="center" style="padding:14px 24px 8px;">
          <div style="font-size:10px;color:#dc2626;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:700;">&#8212;&nbsp;&nbsp;Janela de Manuten&ccedil;&atilde;o&nbsp;&nbsp;&#8212;</div>
        </td></tr>
        <tr>
          <td width="50%" align="center" style="padding:6px 24px 18px;border-right:1px solid #2a1414;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">IN&Iacute;CIO</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_inicio)}</div>
          </td>
          <td width="50%" align="center" style="padding:6px 24px 18px;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">FIM</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_fim)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Status rejeitada -->
    <tr><td bgcolor="#450a0a" style="padding:16px 24px;" align="center">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">STATUS</div>
      <div style="font-size:16px;font-weight:700;color:#fca5a5;font-family:Arial,sans-serif;">&#10007;&nbsp; Rejeitada por ${escapeHtml(rejectedByName)}</div>
    </td></tr>

    ${motivoRow}

  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${approveUrl}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#dc2626">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Ver GMUD</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#dc2626" style="border-radius:10px;">
      <a href="${approveUrl}" style="background-color:#dc2626;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Ver GMUD</a>
    </td></tr>
  </table><!--<![endif]-->
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #2a1414;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#dc2626" width="4" style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong>.
          Acesse o sistema para revisar os detalhes da rejei&ccedil;&atilde;o.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do sistema de gest&atilde;o de mudan&ccedil;as.</div>
</td></tr>

<!-- ACCENT BOTTOM vermelho -->
<tr><td bgcolor="#b91c1c" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}

export function buildGmudApprovalRequestHtml(
  g: any,
  a: any,
  fromUser: string | null,
  approveUrl: string,
  opts?: { reminder?: boolean },
): string {
  const isReminder = !!opts?.reminder;
  const ts = tipoStyle(g.tipo);
  const ordemAtual = a.etapa_atual ?? a.ordem ?? 1;
  const totalEtapas = a.total_etapas ?? a.total_aprovadores ?? "?";
  const criadoPor = escapeHtml(g.criado_por_nome ?? g.criado_por_email ?? "—");
  const designacao = fromUser
    ? `Voc&ecirc; foi designado(a) por <strong style="color:#ffffff;font-family:Arial,sans-serif;">${escapeHtml(fromUser)}</strong>.`
    : "Sua an&aacute;lise e decis&atilde;o s&atilde;o necess&aacute;rias.";
  const badgeText = isReminder ? "LEMBRETE &mdash; AINDA PENDENTE" : "APROVA&Ccedil;&Atilde;O NECESS&Aacute;RIA";
  const headline = isReminder
    ? "Lembrete: uma GMUD ainda<br/>aguarda sua aprova&ccedil;&atilde;o"
    : "Voc&ecirc; tem uma GMUD<br/>aguardando sua aprova&ccedil;&atilde;o";
  const preheader = isReminder
    ? `Lembrete &#8212; aprova&ccedil;&atilde;o ainda pendente: ${escapeHtml(g.titulo)}`
    : `Aprova&ccedil;&atilde;o necess&aacute;ria: ${escapeHtml(g.titulo)}`;
  const descricaoRow = g.descricao
    ? `<tr><td bgcolor="#111827" style="padding:16px 24px;"><div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">DESCRI&Ccedil;&Atilde;O</div><div style="font-size:13px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">${escapeHtml(g.descricao)}</div></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Aprovação de GMUD — B-Security</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,p,a{margin:0;padding:0;border:0;border-collapse:collapse;}img{border:0;display:block;outline:none;text-decoration:none;}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0b0f1a;">${preheader} &#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;width:100%;">

<!-- ACCENT TOP -->
<tr><td bgcolor="#2563eb" height="4" style="border-radius:8px 8px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

<!-- HEADER -->
<tr><td bgcolor="#111827" align="center" style="padding:32px 48px 28px;">
  <div style="font-size:26px;font-weight:700;color:#f8fafc;letter-spacing:-0.5px;line-height:1;font-family:Arial,sans-serif;">B&#8209;Security</div>
  <div style="font-size:9px;color:#d1d5db;letter-spacing:4px;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Security Suite</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top:18px;">
    <tr>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;"><div style="font-size:10px;color:#d1d5db;letter-spacing:3.5px;text-transform:uppercase;font-family:Arial,sans-serif;white-space:nowrap;">Gest&atilde;o de Mudan&ccedil;as</div></td>
      <td bgcolor="#1e2a3a" height="1" width="48" style="font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td></tr>

<!-- HERO -->
<tr><td bgcolor="#0f1623" align="center" style="padding:44px 48px 32px;border-top:1px solid #1e2a3a;border-bottom:1px solid #1e2a3a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:28px;">
    <tr><td bgcolor="#1e3a6e" style="border-radius:20px;border:1px solid #3b82f6;padding:7px 20px;">
      <span style="font-size:11px;color:#93c5fd;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">&#9679;&nbsp; ${badgeText}</span>
    </td></tr>
  </table>
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#f8fafc;line-height:1.3;font-family:Arial,sans-serif;text-align:center;">${headline}</h1>
  <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
    Ol&aacute;, <strong style="color:#ffffff;">${escapeHtml(a.nome_aprovador)}</strong>!<br/>${designacao}
  </p>
</td></tr>

<!-- CARD GMUD -->
<tr><td bgcolor="#0d1320" style="padding:28px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111827" style="border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;">

    <!-- Título -->
    <tr><td bgcolor="#111827" style="padding:20px 24px 18px;border-bottom:1px solid #1e2a3a;">
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">T&Iacute;TULO DA GMUD</div>
      <div style="font-size:17px;font-weight:700;color:#f8fafc;line-height:1.3;font-family:Arial,sans-serif;">${escapeHtml(g.titulo)}</div>
    </td></tr>

    <!-- Tipo | Impacto -->
    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">TIPO</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td bgcolor="${ts.bg}" style="border-radius:4px;padding:5px 14px;">
                <span style="font-size:12px;font-weight:700;color:${ts.color};font-family:Arial,sans-serif;">${escapeHtml(g.tipo)}</span>
              </td>
            </tr></table>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">IMPACTO</div>
            <div style="font-size:14px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${escapeHtml(g.impacto)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Janela de Manutenção -->
    <tr><td bgcolor="#0d1320" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td colspan="2" align="center" style="padding:14px 24px 8px;">
          <div style="font-size:10px;color:#3b82f6;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:700;">&#8212;&nbsp;&nbsp;Janela de Manuten&ccedil;&atilde;o&nbsp;&nbsp;&#8212;</div>
        </td></tr>
        <tr>
          <td width="50%" align="center" style="padding:6px 24px 18px;border-right:1px solid #1e2a3a;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">IN&Iacute;CIO</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_inicio)}</div>
          </td>
          <td width="50%" align="center" style="padding:6px 24px 18px;">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">FIM</div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmtDate(g.data_fim)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Criado por | Etapa -->
    <tr><td bgcolor="#111827" style="padding:0;border-bottom:1px solid #1e2a3a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="50%" style="padding:16px 24px;border-right:1px solid #1e2a3a;" valign="top">
            <div style="font-size:10px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">CRIADO POR</div>
            <div style="font-size:15px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${criadoPor}</div>
          </td>
          <td width="50%" style="padding:16px 24px;" valign="top">
            <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-bottom:9px;font-family:Arial,sans-serif;">ETAPA</div>
            <div style="font-size:18px;font-weight:700;color:#38bdf8;font-family:Arial,sans-serif;letter-spacing:-0.3px;">${ordemAtual} de ${totalEtapas}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    ${descricaoRow}
  </table>
</td></tr>

<!-- CTA -->
<tr><td bgcolor="#0d1320" align="center" style="padding:0 40px 32px;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${approveUrl}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="8%" stroke="f" fillcolor="#2563eb">
    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">Abrir GMUD para Aprovar ou Rejeitar</center>
  </v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr><td bgcolor="#2563eb" style="border-radius:10px;">
      <a href="${approveUrl}" style="background-color:#2563eb;border-radius:10px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:54px;text-align:center;text-decoration:none;width:400px;mso-hide:all;">Abrir GMUD para Aprovar ou Rejeitar</a>
    </td></tr>
  </table><!--<![endif]-->
  <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
    Se o bot&atilde;o n&atilde;o funcionar, copie o link:<br/>
    <a href="${approveUrl}" style="color:#3b82f6;text-decoration:none;word-break:break-all;font-size:11px;">${approveUrl}</a>
  </p>
</td></tr>

<!-- AVISO -->
<tr><td bgcolor="#0d1320" style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0f1a" style="border:1px solid #1e2a3a;border-radius:8px;overflow:hidden;">
    <tr>
      <td bgcolor="#1d4ed8" width="4" style="font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:14px 18px;">
        <div style="font-size:12px;color:#d1d5db;line-height:1.75;font-family:Arial,sans-serif;">
          E-mail enviado automaticamente pelo <strong style="color:#ffffff;">B-Security Suite</strong>.
          Fa&ccedil;a login com <strong style="color:#ffffff;">${escapeHtml(a.email_aprovador)}</strong> para aprovar ou rejeitar.
          N&atilde;o compartilhe este link.
        </div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0b0f1a" align="center" style="padding:24px 40px 32px;border-top:1px solid #111827;">
  <div style="font-size:13px;font-weight:700;color:#d1d5db;font-family:Arial,sans-serif;margin-bottom:6px;">B&#8209;Security &nbsp;<span style="font-size:8px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;font-weight:400;">Security Suite</span></div>
  <div style="font-size:11px;color:#9ca3af;line-height:1.8;font-family:Arial,sans-serif;">&copy; 2025 Bernoulli Educa&ccedil;&atilde;o &mdash; B-Security Suite<br/>Notifica&ccedil;&atilde;o autom&aacute;tica do sistema de gest&atilde;o de mudan&ccedil;as.</div>
</td></tr>

<!-- ACCENT BOTTOM -->
<tr><td bgcolor="#1d4ed8" height="4" style="border-radius:0 0 8px 8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;
}
