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
