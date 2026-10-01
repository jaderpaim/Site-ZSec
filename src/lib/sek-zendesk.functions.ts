import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { requireActiveSession } from "@/lib/session-policy.middleware";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// sek_zendesk_auth_log ainda não existe no types.ts gerado (migration nova,
// aplicada manualmente) -- mesmo cast solto usado no hook correspondente.
function authLogDb(sb: ReturnType<typeof admin>) {
  return sb as unknown as { from: (t: string) => any };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Apenas administradores podem renovar a sessão do SEK/Zendesk");
}

// Janela curta de propósito -- o token só precisa sobreviver ao tempo de
// copiar o comando e rodar o sek-session-capture localmente, nunca deveria
// ficar válido por mais que isso (ver handoff: token single-use, jti
// conferido pelo worker antes de aceitar o upload da sessão).
const RENEWAL_TTL_SECONDS = 10 * 60;

export const generateSekRenewalToken = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const secret = process.env.SEK_RENEWAL_SECRET;
    if (!secret) throw new Error("SEK_RENEWAL_SECRET não configurado no servidor");

    const token = await new SignJWT({ purpose: "session_renewal" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(context.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${RENEWAL_TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(secret));

    return { token, expiresInSeconds: RENEWAL_TTL_SECONDS };
  });

// Responder um chamado é 100% servidor-a-servidor (diferente da renovação de
// sessão, que precisa do navegador do analista pro login/MFA de verdade) --
// não existe passo manual de copiar token pra um app externo aqui. O JWT
// (purpose: ticket_reply) é gerado e consumido inteiramente dentro deste
// handler, nunca exposto ao frontend; só existe pra o worker continuar
// usando a mesma verificação/uso-único (usedNonces) que já tinha pro
// session/upload, sem duplicar lógica de autorização lá.
const REPLY_TTL_SECONDS = 60;
const WORKER_REPLY_URL = "https://sek-api.bernoulli.com.br/sek-worker/session/reply";

export const replySekTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((d: { ticketId: string; body: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const ticketId = data.ticketId?.trim();
    const body = data.body?.trim();
    if (!ticketId || !body) throw new Error("Preencha o texto da resposta");

    const secret = process.env.SEK_RENEWAL_SECRET;
    if (!secret) throw new Error("SEK_RENEWAL_SECRET não configurado no servidor");
    const token = await new SignJWT({ purpose: "ticket_reply" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(context.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${REPLY_TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(secret));

    const clientId = process.env.CF_ACCESS_CLIENT_ID;
    const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET não configurados no servidor");

    const resp = await fetch(WORKER_REPLY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "CF-Access-Client-Id": clientId,
        "CF-Access-Client-Secret": clientSecret,
      },
      body: JSON.stringify({ token, ticketId, body }),
    });
    const respBody = await resp.json().catch(() => ({}));
    // "message" é a versão amigável (ex.: "você ainda não tem sessão
    // capturada, abra o SEK Session Capture") pro caso de sessão por
    // usuário ausente -- "error" é só um código curto quando não tem
    // mensagem melhor pra mostrar.
    if (!resp.ok) throw new Error(respBody?.message || respBody?.error || `worker respondeu ${resp.status}`);
    return { ok: true };
  });

const WORKER_STATUS_URL = "https://sek-api.bernoulli.com.br/sek-worker/session/status";

// Sessões vigentes por usuário (uma por analista que já rodou o SEK Session
// Capture) -- o worker só devolve userId (sub do JWT), resolve pro nome de
// exibição aqui do mesmo jeito que sek-zendesk-auth-log.ts já faz pro
// histórico (profiles.full_name, com fallback pro email).
export const getSekSessionStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const clientId = process.env.CF_ACCESS_CLIENT_ID;
    const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET não configurados no servidor");

    const resp = await fetch(WORKER_STATUS_URL, {
      headers: {
        "CF-Access-Client-Id": clientId,
        "CF-Access-Client-Secret": clientSecret,
      },
    });
    if (!resp.ok) throw new Error(`worker respondeu ${resp.status}`);
    const data = (await resp.json()) as {
      count: number;
      users: Array<{ userId: string; lastModified: string }>;
      legacy: boolean;
    };

    const userIds = data.users.map((u) => u.userId).filter(Boolean);
    let names: Record<string, string> = {};
    if (userIds.length) {
      const sb = admin();
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      names = Object.fromEntries(
        ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [
          p.id,
          p.full_name ?? p.email ?? p.id,
        ]),
      );
    }

    return {
      legacy: data.legacy,
      sessions: data.users
        .map((u) => ({ userId: u.userId, name: names[u.userId] ?? u.userId, lastModified: u.lastModified }))
        .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    };
  });

export const listSekZendeskAuthLog = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { data, error } = await authLogDb(sb)
      .from("sek_zendesk_auth_log")
      .select("id, event, triggered_by_name, reported_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
