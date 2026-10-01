import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit-log.functions";

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

const UpsertIntegrationSchema = z.object({
  provider: z.enum([
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
  ]),
  name: z.string().min(1).max(200),
  enabled: z.boolean(),
  base_url: z.string().max(500).nullable(),
  api_key: z.string().max(500).nullable(),
  config: z.record(z.string(), z.unknown()),
});

// Migrado de Integracoes.tsx: antes gravava direto do client via
// supabase.from("integrations").upsert(...), protegido só pela RLS
// "admin manage integrations" (has_role(auth.uid(),'admin')). Aqui replicamos
// exatamente o mesmo gate de autorização, apenas movendo a escrita para o
// servidor para permitir registrar auditoria.
export const upsertIntegration = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertIntegrationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" as any,
    });
    if (roleError) throw new Error(`Permissão indisponível: ${roleError.message}`);
    if (isAdmin !== true) throw new Error("Acesso negado: requer perfil admin");

    const { error } = await supabaseAdmin.from("integrations").upsert(data as any, { onConflict: "provider" });

    const label = PROVIDER_LABEL[data.provider] ?? data.provider;
    await logAudit({
      userId: context.userId,
      modulo: "integracoes",
      acao: "salvar_integracao",
      descricao: `Salvou configuração da integração ${label} (${data.enabled ? "ativa" : "inativa"})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      // não gravamos api_key/config no detalhe do audit log — pode conter segredos
      detalhes: { provider: data.provider, enabled: data.enabled, base_url: data.base_url },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
