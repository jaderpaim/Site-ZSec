// Envio de e-mail feito direto pelo servidor do app, por SMTP, com qualquer
// provedor (MailerSend, Microsoft 365, Google Workspace, Amazon SES,
// SendGrid...). A configuração vem da tela Configurações → SMTP.
//
// Antes cada módulo chamava a Edge Function send-smtp do Supabase, que só
// sabia enviar pela API HTTP da SendGrid e exigia a chave legacy do Supabase.
//
// TLS: porta 465 usa TLS desde a conexão (SMTPS); nas demais (587, 25...) a
// opção "TLS / SSL" da tela exige STARTTLS -- sem ela, a conexão pode seguir
// sem criptografia se o servidor não oferecer STARTTLS.

import { readSecret } from "@/lib/crypto.server";

export type MailPayload = {
  host: string;
  port?: number;
  secure?: boolean;
  username?: string | null;
  /** Obrigatória quando há usuário; relays internos sem autenticação deixam os dois vazios. */
  password?: string | null;
  from: { name?: string | null; email?: string | null };
  to: string | { name?: string | null; email: string };
  subject: string;
  html: string;
};

/** Mesmo formato que a Edge Function devolvia, para os chamadores não mudarem. */
export type MailResult = { ok: boolean; error?: string };

export async function sendMail(p: MailPayload): Promise<MailResult> {
  if (!p?.host || !p.from?.email || !p.to || !p.subject || (p.username && !p.password)) {
    return { ok: false, error: "Campos obrigatórios faltando" };
  }
  const port = p.port || 587;
  const implicitTls = port === 465;
  try {
    // Carregado sob demanda: só é usado aqui, no servidor.
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: p.host.trim(),
      port,
      secure: implicitTls,
      requireTLS: !implicitTls && p.secure !== false,
      // A senha vem cifrada de smtp_config (ou em texto puro do SMTP_PASSWORD).
      auth: p.username ? { user: p.username, pass: readSecret(p.password) ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    const to = typeof p.to === "string" ? p.to : { name: p.to.name ?? "", address: p.to.email };
    await transport.sendMail({
      from: { name: p.from.name ?? "", address: p.from.email },
      to,
      subject: p.subject,
      html: p.html,
    });
    transport.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
