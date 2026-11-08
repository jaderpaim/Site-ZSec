import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit-log.functions";
import type { Database } from "@/integrations/supabase/types";

// ─── Módulos que disparam alerta via webhook (Teams/Telegram) ──────────────
// Cada módulo pode ser ativado/desativado individualmente aqui, sem afetar
// a configuração do canal (URL do Teams, token do Telegram) nem o agendamento
// do cron job correspondente.
export const ALERT_MODULES = [
  {
    key: "cmdb_device_alert",
    label: "CMDB — Alertas de Dispositivos",
    description: "Notifica o time quando um ativo do CMDB perde cobertura SIEM/Zabbix (status Alerta ou Inativo).",
    channels: ["Teams", "Telegram"],
  },
  {
    key: "cloudflare_dns_created",
    label: "Cloudflare — Novo Registro DNS",
    description: "Notifica o time quando um novo registro DNS é criado em uma zona da Cloudflare.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_dns_updated",
    label: "Cloudflare — Registro DNS Editado",
    description: "Notifica o time quando um registro DNS existente é editado em uma zona da Cloudflare.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_rule_updated",
    label: "Cloudflare — Regra Editada",
    description: "Notifica o time quando uma regra de Rules (Overview/Page Rules) é editada em uma zona da Cloudflare.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_rule_toggled",
    label: "Cloudflare — Regra Habilitada/Desabilitada",
    description: "Notifica o time quando uma regra de Rules é habilitada ou desabilitada em uma zona da Cloudflare.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_rule_deleted",
    label: "Cloudflare — Regra Excluída",
    description: "Notifica o time quando uma regra de Rules é excluída em uma zona da Cloudflare.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_zone_created",
    label: "Cloudflare — Novo Domínio Adicionado",
    description:
      "Notifica o time quando um novo domínio (zona) é conectado à conta Cloudflare pelo módulo Cloudflare WAF.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_dns_delete_request",
    label: "Cloudflare — Solicitação de Exclusão de DNS",
    description:
      "Notifica o time quando alguém pede a exclusão de um registro DNS e quando o pedido é confirmado (registro apagado) ou recusado.",
    channels: ["Teams"],
  },
  {
    key: "cloudflare_audit_alert",
    label: "Cloudflare — Alerta de Auditoria",
    description:
      "Notifica o time quando o monitor do log de auditoria da conta detecta exclusão de DNS fora do fluxo, volume anormal, host crítico alterado, falha de backup ou restauração de DNS.",
    channels: ["Teams"],
  },
  {
    key: "sophos_audit_alert",
    label: "Sophos — Auditoria",
    description:
      "Notifica o time quando o Audit Log da Sophos registra criação, exclusão, atualização de configuração ou sessão de Live Response (Live Terminal).",
    channels: ["Teams"],
  },
  {
    key: "sast_triage",
    label: "SAST — Triagem de Achado",
    description:
      "Notifica o time quando um achado SAST das esteiras CI/CD é marcado como resolvido, falso positivo, risco aceito ou reaberto.",
    channels: ["Teams"],
  },
  {
    key: "ssl_cert_renewed",
    label: "SSL — Certificado Renovado",
    description:
      "Notifica o time quando um certificado SSL importado é substituído (renovação), com as URLs vinculadas que precisam receber o novo certificado.",
    channels: ["Teams"],
  },
  {
    key: "threat_intel_credential_revealed",
    label: "Threat Intelligence — Credencial Revelada",
    description:
      "Notifica o time quando a senha de uma credencial vazada é revelada em tela no Threat Intelligence.",
    channels: ["Teams"],
  },
  {
    key: "threat_intel_credential_critical",
    label: "Threat Intelligence — Credencial Crítica",
    description:
      "Notifica o time quando a validação confirma uma credencial vazada com acesso efetivo (senha válida, sem MFA e com acesso ao sistema). As válidas de risco menor vão pelo alerta \"Credencial Válida\".",
    channels: ["Teams"],
  },
  {
    key: "threat_intel_credential_valid",
    label: "Threat Intelligence — Credencial Válida",
    description:
      "Notifica o time quando a validação confirma que uma credencial vazada ainda funciona, mas com risco menor: o login exige MFA ou a pessoa não tem acesso efetivo ao sistema.",
    channels: ["Teams"],
  },
  {
    key: "threat_intel_domain_spike",
    label: "Threat Intelligence — Pico de Domínio",
    description:
      "Notifica o time quando a varredura periódica detecta um pico de credenciais vazadas de um domínio de parceiro no dia. No máximo um aviso por domínio de parceiro por dia.",
    channels: ["Teams"],
  },
  {
    key: "threat_intel_incident_closed",
    label: "Threat Intelligence — Incidente Encerrado",
    description:
      "Notifica o time quando um incidente de credencial vazada é resolvido ou cancelado (a abertura já sai pelos canais de incidente do módulo).",
    channels: ["Teams"],
  },
] as const;

export type AlertModuleKey = (typeof ALERT_MODULES)[number]["key"];

function providerFor(key: string): string {
  return `alert_module:${key}`;
}

async function assertCanManage(userSupabase: SupabaseClient<Database>, userId: string) {
  const [{ data: isAdmin }, { data: isModAdmin }] = await Promise.all([
    userSupabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    userSupabase.rpc("is_module_admin", { _user_id: userId, _module: "disponibilidade" }),
  ]);
  if (!isAdmin && !isModAdmin) {
    throw new Error("Sem permissão para alterar módulos de alerta");
  }
}

export const getAlertModulesConfig = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async (): Promise<Record<string, boolean>> => {
    const providers = ALERT_MODULES.map((m) => providerFor(m.key));
    const { data } = await supabaseAdmin.from("integrations").select("provider, enabled").in("provider", providers);
    const rows = (data ?? []) as Array<{ provider: string; enabled: boolean }>;
    const byProvider = new Map(rows.map((r) => [r.provider, r.enabled]));
    const out: Record<string, boolean> = {};
    for (const m of ALERT_MODULES) {
      const v = byProvider.get(providerFor(m.key));
      out[m.key] = v === undefined ? true : !!v;
    }
    return out;
  });

export const setAlertModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        key: z.enum(ALERT_MODULES.map((m) => m.key) as [string, ...string[]]),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId);

    const provider = providerFor(data.key);
    const { data: existing } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("provider", provider)
      .maybeSingle();

    let error: { message: string } | null = null;
    if (existing?.id) {
      ({ error } = await supabaseAdmin
        .from("integrations")
        .update({ enabled: data.enabled } as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabaseAdmin.from("integrations").insert({
        provider,
        name: "config",
        enabled: data.enabled,
        config: {},
        created_by: userId,
      } as never));
    }

    const moduleLabel = ALERT_MODULES.find((m) => m.key === data.key)?.label ?? data.key;
    await logAudit({
      userId,
      modulo: "alertas",
      acao: data.enabled ? "enable" : "disable",
      descricao: `${data.enabled ? "Ativou" : "Desativou"} o módulo de alerta "${moduleLabel}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { key: data.key, enabled: data.enabled },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Server-only helper used by the alert dispatchers (CMDB, Cloudflare, ...).
 * Defaults to enabled when no row exists yet for the module.
 */
export async function isAlertModuleEnabled(key: AlertModuleKey): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("enabled")
    .eq("provider", providerFor(key))
    .maybeSingle();
  return data ? !!(data as { enabled: boolean }).enabled : true;
}
