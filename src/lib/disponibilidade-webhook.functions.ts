import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCanManage(context: any) {
  const { supabase, userId } = context;
  const [{ data: isAdmin }, { data: isModAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("is_module_admin", { _user_id: userId, _module: "disponibilidade" }),
  ]);
  if (!isAdmin && !isModAdmin) throw new Error("Sem permissão para configurar alertas de disponibilidade");
}

function buildTeamsPayload(title: string, text: string) {
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: "3B82F6",
    summary: title,
    sections: [
      {
        activityTitle: title,
        activitySubtitle: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        text,
      },
    ],
  };
}

type StoredConfig = {
  teams_webhook_url: string | null;
  teams_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readConfig(sb: any): Promise<StoredConfig | null> {
  const { data } = await sb
    .from("integrations")
    .select("config")
    .eq("provider", "disponibilidade_alerts")
    .eq("name", "config")
    .maybeSingle();
  return (data?.config as StoredConfig) ?? null;
}

export const getDisponibilidadeNotifConfig = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManage(context);
    const cfg = await readConfig(admin());
    const token = cfg?.telegram_bot_token ?? null;
    const maskedToken = token ? token.slice(0, 8) + "…" + token.slice(-4) : null;
    return {
      teams_webhook_url: cfg?.teams_webhook_url ?? null,
      teams_enabled: cfg?.teams_enabled ?? false,
      telegram_bot_token_set: !!token,
      telegram_bot_token_masked: maskedToken,
      telegram_chat_id: cfg?.telegram_chat_id ?? null,
      telegram_enabled: cfg?.telegram_enabled ?? false,
    };
  });

const SaveSchema = z.object({
  teams_webhook_url: z.string().url("URL inválida").nullable().optional(),
  teams_enabled: z.boolean(),
  telegram_bot_token: z.string().nullable().optional(),
  telegram_chat_id: z.string().nullable().optional(),
  telegram_enabled: z.boolean(),
});

export const saveDisponibilidadeNotifConfig = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const sb = admin();
    const existing = await readConfig(sb);

    const payload: StoredConfig = {
      teams_webhook_url:
        data.teams_webhook_url !== undefined ? (data.teams_webhook_url ?? null) : (existing?.teams_webhook_url ?? null),
      teams_enabled: data.teams_enabled,
      // Preserve existing token if not provided (empty string = clear)
      telegram_bot_token:
        data.telegram_bot_token !== undefined && data.telegram_bot_token !== null
          ? data.telegram_bot_token || null
          : (existing?.telegram_bot_token ?? null),
      telegram_chat_id:
        data.telegram_chat_id !== undefined ? (data.telegram_chat_id ?? null) : (existing?.telegram_chat_id ?? null),
      telegram_enabled: data.telegram_enabled,
    };

    const { data: row } = await sb
      .from("integrations")
      .select("id")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();

    let error: { message: string } | null = null;
    if (row?.id) {
      ({ error } = await sb
        .from("integrations")
        .update({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: payload as any,
          enabled: payload.teams_enabled || payload.telegram_enabled,
        })
        .eq("id", row.id));
    } else {
      ({ error } = await sb.from("integrations").insert({
        provider: "disponibilidade_alerts",
        name: "config",
        enabled: payload.teams_enabled || payload.telegram_enabled,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: payload as any,
        created_by: context.userId,
      } as never));
    }

    await logAudit({
      userId: context.userId,
      modulo: "alertas",
      acao: row?.id ? "update" : "create",
      descricao: `${row?.id ? "Editou" : "Criou"} a configuração de notificação de disponibilidade (Teams: ${payload.teams_enabled ? "ativo" : "inativo"}, Telegram: ${payload.telegram_enabled ? "ativo" : "inativo"})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        teams_enabled: payload.teams_enabled,
        telegram_enabled: payload.telegram_enabled,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testTeamsWebhook = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManage(context);
    const cfg = await readConfig(admin());
    const url = cfg?.teams_webhook_url;
    if (!url) return { ok: false, error: "URL do webhook do Teams não configurada" };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildTeamsPayload(
            "✅ Teste de alerta — B-Security",
            "Este é um teste de integração de alertas de indisponibilidade. Tudo certo!",
          ),
        ),
      });
      const body = await res.text().catch(() => "");
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${body || "(sem corpo)"}` };
      }
      // Connectors antigos retornam "1"; Power Automate/Workflows retornam JSON.
      // Se o corpo contiver indicação explícita de rejeição, sinalizamos o erro.
      if (body && /error|invalid|bad|reject/i.test(body) && body.trim() !== "1") {
        return { ok: false, error: `Teams rejeitou: ${body}` };
      }
      return { ok: true, detail: body || undefined };
    } catch (e: unknown) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  });

export const testTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManage(context);
    const cfg = await readConfig(admin());
    const token = cfg?.telegram_bot_token;
    const chatId = cfg?.telegram_chat_id;
    if (!token) return { ok: false, error: "Token do bot Telegram não configurado" };
    if (!chatId) return { ok: false, error: "Chat ID do Telegram não configurado" };

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ <b>Teste de alerta — B-Security</b>\n\nEste é um teste de integração de alertas de indisponibilidade. Tudo certo!",
          parse_mode: "HTML",
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: any = await res.json().catch(() => ({ ok: false }));
      if (!out.ok) return { ok: false, error: out.description ?? `HTTP ${res.status}` };
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  });
