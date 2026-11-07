// Server-only: alertas do Threat Intel no Teams, pelo módulo de Alertas
// (mesmo canal/config "disponibilidade_alerts" dos demais módulos). Cada tipo
// tem toggle próprio em Configurações › Alertas. Portado do b-security-suite
// (notifyTeams de threat-intel.server.ts). NUNCA importar em código de cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAlertModuleEnabled, type AlertModuleKey } from "@/lib/alert-modules.functions";
import { postTeamsWebhook } from "@/lib/teams-webhook";
import { APP_NAME } from "@/lib/brand";
import { appUrlOrNull } from "@/lib/app-url";

export type ThreatIntelAlertKey = Extract<
  AlertModuleKey,
  | "threat_intel_credential_revealed"
  | "threat_intel_credential_critical"
  | "threat_intel_credential_valid"
  | "threat_intel_domain_spike"
  | "threat_intel_incident_closed"
>;

export async function notifyThreatIntel(
  key: ThreatIntelAlertKey,
  card: { title: string; color: string; facts: { name: string; value: string }[] },
): Promise<void> {
  try {
    if (!(await isAlertModuleEnabled(key))) return;
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    type TeamsCfg = { teams_enabled?: boolean; teams_webhook_url?: string | null };
    const cfg = integ?.enabled ? ((integ.config as TeamsCfg) ?? null) : null;
    if (!cfg?.teams_enabled || !cfg.teams_webhook_url) return;
    const base = appUrlOrNull();
    await postTeamsWebhook(cfg.teams_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: card.color,
        summary: card.title,
        sections: [
          {
            activityTitle: `🛡️ ${APP_NAME} · ${card.title}`,
            activitySubtitle: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            facts: card.facts,
            markdown: true,
          },
        ],
        ...(base
          ? {
              potentialAction: [
                {
                  "@type": "OpenUri",
                  name: `Abrir no ${APP_NAME}`,
                  targets: [{ os: "default", uri: `${base}/app/threat-intel` }],
                },
              ],
            }
          : {}),
      }),
    }).catch(() => {});
  } catch (e) {
    console.error("[threat-intel] notifyThreatIntel:", e);
  }
}

// Nome de quem fez a ação, para o card.
export async function actorName(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const p = data as { full_name?: string | null; email?: string | null } | null;
  return p?.full_name || p?.email || userId;
}
