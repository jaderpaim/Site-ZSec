import { APP_NAME } from "@/lib/brand";
import { postTeamsWebhook } from "@/lib/teams-webhook";

type AtivoNotif = { nome: string; tipo: string | null; ip_hostname: string | null };

type NotifConfig = {
  teams_webhook_url: string | null;
  teams_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNotifConfig(sb: any): Promise<NotifConfig | null> {
  const { data } = await sb
    .from("integrations")
    .select("config, enabled")
    .eq("provider", "disponibilidade_alerts")
    .eq("name", "config")
    .maybeSingle();
  if (!data?.enabled) return null;
  return (data.config as NotifConfig) ?? null;
}

function buildTeamsCard(ativos: AtivoNotif[]) {
  const rows = ativos
    .map(
      (a) =>
        `• **${a.nome}** (${a.tipo ?? "?"})${a.ip_hostname ? ` — \`${a.ip_hostname}\`` : ""}`,
    )
    .join("\n\n");
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: "F97316",
    summary: `${ativos.length} ativo(s) indisponível(is) — ${APP_NAME}`,
    sections: [
      {
        activityTitle: `🔴 Indisponibilidade detectada — ${ativos.length} ativo(s)`,
        activitySubtitle: now,
        text: rows || "Nenhum detalhe disponível.",
      },
    ],
  };
}

function buildTelegramText(ativos: AtivoNotif[]): string {
  const lines = ativos
    .map(
      (a) =>
        `• <b>${a.nome}</b> (${a.tipo ?? "?"})${a.ip_hostname ? ` — <code>${a.ip_hostname}</code>` : ""}`,
    )
    .join("\n");
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `🔴 <b>Indisponibilidade detectada — ${APP_NAME}</b>\n📅 ${now}\n\n<b>${ativos.length} ativo(s) indisponível(is):</b>\n${lines}`;
}

type ChangeNotif = {
  kind: "update" | "delete";
  ativoNome: string;
  actorEmail: string | null;
};

function buildTeamsChangeCard(change: ChangeNotif) {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const acao = change.kind === "update" ? "editado" : "excluído";
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: "F97316",
    summary: `Registro de indisponibilidade ${acao} — ${APP_NAME}`,
    sections: [
      {
        activityTitle: `✏️ Indisponibilidade ${acao} — ${change.ativoNome}`,
        activitySubtitle: now,
        text: `Por: ${change.actorEmail ?? "desconhecido"}`,
      },
    ],
  };
}

function buildTelegramChangeText(change: ChangeNotif): string {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const acao = change.kind === "update" ? "editado" : "excluído";
  return `✏️ <b>Indisponibilidade ${acao} — ${APP_NAME}</b>\n📅 ${now}\n\n<b>Ativo:</b> ${change.ativoNome}\n<b>Por:</b> ${change.actorEmail ?? "desconhecido"}`;
}

/**
 * Alerta de edição/exclusão de um registro de indisponibilidade já existente
 * -- diferente de notifyNewIndisponibilidades (detecção automática pelo sync),
 * essa é disparada por uma ação humana (upsertIndisponibilidade/deleteIndisponibilidade)
 * e serve de trilha de auditoria visível pro time, já que qualquer usuário com
 * permissão de edição/exclusão do módulo pode alterar o histórico de qualquer
 * ativo, não só o que ele mesmo registrou. Falhas são silenciosas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyIndisponibilidadeChanged(sb: any, change: ChangeNotif): Promise<void> {
  try {
    const cfg = await getNotifConfig(sb);
    if (!cfg) return;

    const tasks: Promise<unknown>[] = [];

    if (cfg.teams_enabled && cfg.teams_webhook_url) {
      tasks.push(
        postTeamsWebhook(cfg.teams_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildTeamsChangeCard(change)),
        }).catch(() => {}),
      );
    }

    if (cfg.telegram_enabled && cfg.telegram_bot_token && cfg.telegram_chat_id) {
      tasks.push(
        fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cfg.telegram_chat_id,
            text: buildTelegramChangeText(change),
            parse_mode: "HTML",
          }),
        }).catch(() => {}),
      );
    }

    await Promise.allSettled(tasks);
  } catch {
    // notificações não são críticas
  }
}

/**
 * Envia alertas de novos ativos indisponíveis para Teams e/ou Telegram.
 * Falhas são silenciosas — nunca derrubam o sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyNewIndisponibilidades(sb: any, ativos: AtivoNotif[]): Promise<void> {
  if (ativos.length === 0) return;
  try {
    const cfg = await getNotifConfig(sb);
    if (!cfg) return;

    const tasks: Promise<unknown>[] = [];

    if (cfg.teams_enabled && cfg.teams_webhook_url) {
      tasks.push(
        postTeamsWebhook(cfg.teams_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildTeamsCard(ativos)),
        }).catch(() => {}),
      );
    }

    if (cfg.telegram_enabled && cfg.telegram_bot_token && cfg.telegram_chat_id) {
      tasks.push(
        fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cfg.telegram_chat_id,
            text: buildTelegramText(ativos),
            parse_mode: "HTML",
          }),
        }).catch(() => {}),
      );
    }

    await Promise.allSettled(tasks);
  } catch {
    // notificações não são críticas
  }
}
