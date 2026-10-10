// Treinamentos — utilidades só do servidor: sessão do colaborador, login Microsoft
// (fluxo separado do login do painel) e envio de e-mail.
//
// O colaborador não tem conta no Z-Sec. Ele prova quem é com a conta Microsoft do
// tenant e recebe um cookie assinado que só abre as páginas de treinamento. O link
// recebido por e-mail não dá acesso a nada sozinho: quem decide é a identidade.
import { createClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { APP_NAME } from "@/lib/brand";
import { sendMail as deliverMail } from "@/lib/mailer.server";
import { renderEmail } from "@/lib/email-layout";

export const LEARNER_COOKIE = "zsec_trn";
const LEARNER_TTL_SEC = 8 * 60 * 60; // 8 horas
export const VIDEO_BUCKET = "treinamentos";

/** Cliente service role sem tipos gerados (as tabelas novas ainda não estão em types.ts). */
export function adminDb() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function secret(): string {
  const s = process.env.SSO_STATE_SECRET;
  if (!s) throw new Error("SSO_STATE_SECRET não configurado");
  return s;
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

/** Comparação em tempo constante para assinaturas. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type LearnerSession = { c: string; e: string; n: string; exp: number };

export async function signLearnerSession(s: Omit<LearnerSession, "exp">): Promise<string> {
  const body: LearnerSession = { ...s, exp: Math.floor(Date.now() / 1000) + LEARNER_TTL_SEC };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyLearnerSession(
  raw: string | undefined | null,
): Promise<LearnerSession | null> {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(await hmac(payload), sig)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as LearnerSession;
    if (!body.c || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export const learnerCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: LEARNER_TTL_SEC,
};

/** Sessão do colaborador a partir do cookie da requisição atual (server functions). */
export async function currentLearner(): Promise<LearnerSession | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  return verifyLearnerSession(getCookie(LEARNER_COOKIE));
}

export function learnerRedirectUri(): string {
  const fromEnv = process.env.TREINAMENTOS_SSO_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  return `${appUrl()}/api/public/treinamentos/sso/callback`;
}

export function appBaseUrl(): string {
  return appUrl();
}

// ── E-mail (mesmo caminho dos demais módulos: sendMail em mailer.server.ts) ──
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  template: string,
): Promise<boolean> {
  const sb = adminDb();
  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg?.host) throw new Error("SMTP não configurado");
  const password = cfg.password || process.env.SMTP_PASSWORD;
  if (!password) throw new Error("Senha SMTP não configurada");
  const out = await deliverMail({
    host: cfg.host,
    port: cfg.port || 587,
    secure: !!cfg.secure,
    username: cfg.username || null,
    password,
    from: { name: cfg.from_name || `${APP_NAME} · Segurança da Informação`, email: cfg.from_email },
    to,
    subject,
    html,
  });
  await sb.from("email_logs").insert({
    to_email: to,
    subject,
    template,
    status: out.ok ? "success" : "error",
    error_message: out.ok ? null : String(out.error ?? "falha no envio"),
  });
  return !!out.ok;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Convite de treinamento. O link é fixo (Meus treinamentos) e só funciona com o login Microsoft da pessoa. */
export function buildConviteHtml(a: {
  nome: string;
  titulo: string;
  prazo: string | null;
  link: string;
}) {
  const prazo = a.prazo ? a.prazo.split("-").reverse().join("/") : null;
  const primeiro = a.nome.split(" ")[0] || a.nome;
  return renderEmail({
    module: "Segurança da Informação",
    tone: "info",
    status: "Treinamento atribuído",
    title: `${primeiro}, você tem um treinamento de segurança`,
    intro: `Faça o treinamento <strong class="fg" style="color:#111827;">${esc(a.titulo)}</strong>${prazo ? ` até <strong class="fg" style="color:#111827;">${prazo}</strong>` : ""}. Você entra com a sua conta Microsoft da empresa.`,
    preheader: prazo ? `${a.titulo} · prazo ${prazo}` : a.titulo,
    blocks: [
      {
        kind: "note",
        tone: "info",
        title: "Prefere não clicar em links de e-mail?",
        text: "Ótimo hábito. Acesse a intranet e abra Meus treinamentos.",
      },
    ],
    cta: { label: "Abrir Meus treinamentos", url: a.link },
    reason: "Você recebeu porque um treinamento foi atribuído a você pela equipe de Segurança da Informação.",
    replyable: true,
  });
}

export function clientIp(req: Request | null): string | null {
  if (!req) return null;
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
