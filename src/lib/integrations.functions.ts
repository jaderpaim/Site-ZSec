import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit-log.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

const PROVIDER_LABEL: Record<string, string> = {
  cloudflare: "Cloudflare",
  sophos: "Sophos",
  privacy_tools: "Privacy Tools",
  gophish: "Gophish",
  qradar: "IBM QRadar SIEM",
  zabbix: "Zabbix",
  sendgrid: "SendGrid",
  purview_dlp: "Microsoft Purview DLP",
  azure_app_insights: "Azure App Insights (SAST)",
  azure_devops_sast: "Azure DevOps (SAST)",
};

const PROVIDERS = [
  "cloudflare",
  "sophos",
  "privacy_tools",
  "gophish",
  "qradar",
  "zabbix",
  "sendgrid",
  "purview_dlp",
  "azure_app_insights",
  "azure_devops_sast",
] as const;

// Campos de `config` que guardam segredo. São só de escrita: nunca voltam para
// o navegador, e um valor vazio no salvamento mantém o que já está gravado.
const SECRET_CONFIG_KEYS = ["password", "audit_client_secret", "page_rules_api_key"] as const;

const UpsertIntegrationSchema = z.object({
  provider: z.enum(PROVIDERS),
  name: z.string().min(1).max(200),
  enabled: z.boolean(),
  base_url: z.string().max(500).nullable(),
  // vazio/null/ausente = manter a credencial atual
  api_key: z.string().max(500).nullable().optional(),
  config: z.record(z.string(), z.unknown()),
});

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (roleError) throw new Error(`Permissão indisponível: ${roleError.message}`);
  if (isAdmin !== true) throw new Error("Acesso negado: requer perfil admin");
}

// "••••a91f" para tokens longos; só "••••" para senhas e valores curtos
function secretHint(value: unknown, showTail: boolean): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return showTail && value.length >= 16 ? `••••${value.slice(-4)}` : "••••";
}

export type IntegrationView = {
  id: string;
  provider: (typeof PROVIDERS)[number];
  name: string;
  enabled: boolean;
  base_url: string | null;
  config: { [key: string]: Json | undefined };
  /** Segredos salvos → dica mascarada. Chave "api_key" para a credencial principal. */
  secrets: Record<string, string>;
};

// Lista as integrações para a tela de configuração SEM os segredos. A tabela
// não é mais legível pelo navegador (ver migração 20261003120000): só o
// servidor, com a service role, lê `api_key` e os segredos de `config`.
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<IntegrationView[]> => {
    await requireAdmin(context);
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .select("id, provider, name, enabled, base_url, api_key, config")
      .in("provider", [...PROVIDERS]);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const raw =
        row.config && typeof row.config === "object" && !Array.isArray(row.config)
          ? row.config
          : {};
      const config: IntegrationView["config"] = {};
      const secrets: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if ((SECRET_CONFIG_KEYS as readonly string[]).includes(k)) {
          const hint = secretHint(v, k !== "password");
          if (hint) secrets[k] = hint;
        } else {
          config[k] = v;
        }
      }
      const keyHint = secretHint(row.api_key, true);
      if (keyHint) secrets.api_key = keyHint;
      return {
        id: row.id,
        provider: row.provider as IntegrationView["provider"],
        name: row.name,
        enabled: row.enabled,
        base_url: row.base_url,
        config,
        secrets,
      };
    });
  });

// Migrado de Integracoes.tsx: antes gravava direto do client via
// supabase.from("integrations").upsert(...), protegido só pela RLS
// "admin manage integrations" (has_role(auth.uid(),'admin')). Aqui replicamos
// exatamente o mesmo gate de autorização, apenas movendo a escrita para o
// servidor para permitir registrar auditoria.
//
// Como o navegador não recebe mais os segredos, o salvamento MESCLA com a
// linha atual: segredo vazio mantém o gravado, e chaves de `config` que não
// vieram no envio são preservadas.
export const upsertIntegration = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertIntegrationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const { data: existing, error: readError } = await supabaseAdmin
      .from("integrations")
      .select("api_key, config")
      .eq("provider", data.provider)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const config: Record<string, unknown> = {
      ...((existing?.config as Record<string, unknown>) ?? {}),
    };
    for (const [k, v] of Object.entries(data.config)) {
      const isSecret = (SECRET_CONFIG_KEYS as readonly string[]).includes(k);
      if (isSecret && (typeof v !== "string" || !v.trim())) continue;
      config[k] = v;
    }
    const newKey = data.api_key?.trim();

    const { error } = await supabaseAdmin.from("integrations").upsert(
      {
        provider: data.provider,
        name: data.name,
        enabled: data.enabled,
        base_url: data.base_url,
        api_key: newKey || existing?.api_key || null,
        config: config as Json,
      },
      { onConflict: "provider" },
    );

    const label = PROVIDER_LABEL[data.provider] ?? data.provider;
    const replaced = [
      ...(newKey ? ["api_key"] : []),
      ...SECRET_CONFIG_KEYS.filter(
        (k) => typeof data.config[k] === "string" && String(data.config[k]).trim(),
      ),
    ];
    await logAudit({
      userId: context.userId,
      modulo: "integracoes",
      acao: "salvar_integracao",
      descricao: `Salvou configuração da integração ${label} (${data.enabled ? "ativa" : "inativa"})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      // não gravamos api_key/config no detalhe do audit log — pode conter segredos;
      // só QUAIS segredos foram substituídos
      detalhes: {
        provider: data.provider,
        enabled: data.enabled,
        base_url: data.base_url,
        segredos_substituidos: replaced,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
