// SMTP bridge for hosted runtime.
// SendGrid is sent via HTTPS API because raw SMTP ports are restricted in this environment.
// SECURITY: only the Supabase service role key is accepted. End-user JWTs are rejected
// so authenticated users cannot use this endpoint as a free relay with their own credentials.
// All legitimate callers (smtp.functions.ts, cmdb-alerts, gmud, users) run server-side
// and already use the service role key.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  host: string;
  port: number;
  secure: boolean;
  username?: string | null;
  password: string;
  from: { name?: string | null; email: string };
  to: { name?: string | null; email: string } | string;
  subject: string;
  html: string;
}

async function sendWithSendGrid(body: Payload) {
  const toEmail = typeof body.to === "string" ? body.to : body.to.email;
  const toName = typeof body.to === "string" ? undefined : body.to.name ?? undefined;

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.password}`,
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: toEmail, ...(toName ? { name: toName } : {}) }],
          subject: body.subject,
        },
      ],
      from: {
        email: body.from.email,
        ...(body.from.name ? { name: body.from.name } : {}),
      },
      content: [{ type: "text/html", value: body.html }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `SendGrid HTTP ${response.status}`);
  }
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Only the service role key is accepted. User JWTs (anon/authenticated) are rejected
  // so this endpoint cannot be abused as an open email relay.
  return !!serviceRoleKey && token === serviceRoleKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Payload;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body?.host || !body?.port || !body?.password || !body?.from?.email || !body?.to || !body?.subject) {
    return new Response(JSON.stringify({ ok: false, error: "Campos obrigatórios faltando" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const normalizedHost = body.host.trim().toLowerCase();
    if (normalizedHost === "smtp.sendgrid.net") {
      await sendWithSendGrid(body);
    } else {
      throw new Error("SMTP direto em portas 25/465/587 não é suportado neste ambiente hospedado. Para este provedor, use a API HTTP do serviço ou um relay HTTPS próprio.");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
