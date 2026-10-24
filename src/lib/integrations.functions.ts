import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit-log.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { readSecret, writeSecret } from "@/lib/crypto.server";

const PROVIDER_LABEL: Record<string, string> = {
  cloudflare: "Cloudflare",
  sophos: "Sophos",
  privacy_tools: "Privacy Tools",
  gophish: "Gophish",
  qradar: "IBM QRadar SIEM",
  zabbix: "Zabbix",
  sendgrid: "SendGrid",
  purview_dlp: "Microsoft Purview DLP",
  leakradar: "CTI",
  azure_app_insights: "Azure App Insights (SAST)",
  azure_devops_sast: "Azure DevOps (SAST)",
  gitea_sast: "Gitea (SAST)",
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
  "leakradar",
  "azure_app_insights",
  "azure_devops_sast",
  "gitea_sast",
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

// Origem (esquema + host + porta) de um base_url; null quando vazio ou inválido.
function originOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return url.trim().toLowerCase();
  }
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
          const hint = secretHint(typeof v === "string" ? readSecret(v) : v, k !== "password");
          if (hint) secrets[k] = hint;
        } else {
          config[k] = v;
        }
      }
      const keyHint = secretHint(readSecret(row.api_key), true);
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
      .select("api_key, config, base_url")
      .eq("provider", data.provider)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    // Credencial gravada só vale para o host em que foi cadastrada. Se o endereço
    // mudar de origem, exige digitar de novo os segredos que já existem — senão
    // trocar o base_url bastava para o servidor mandar a credencial (que o admin
    // não consegue ler) para outro host.
    if (existing && originOf(existing.base_url) !== originOf(data.base_url)) {
      const existingConfig = (existing.config as Record<string, unknown> | null) ?? {};
      const missing = [
        ...(existing.api_key && !data.api_key?.trim() ? ["api_key"] : []),
        ...SECRET_CONFIG_KEYS.filter(
          (k) =>
            typeof existingConfig[k] === "string" &&
            String(existingConfig[k]).trim() &&
            !(typeof data.config[k] === "string" && String(data.config[k]).trim()),
        ),
      ];
      if (missing.length) {
        throw new Error(
          `O endereço da integração mudou: informe novamente a credencial (${missing.join(", ")}) para salvar.`,
        );
      }
    }

    const config: Record<string, unknown> = {
      ...((existing?.config as Record<string, unknown>) ?? {}),
    };
    for (const [k, v] of Object.entries(data.config)) {
      const isSecret = (SECRET_CONFIG_KEYS as readonly string[]).includes(k);
      if (isSecret && (typeof v !== "string" || !v.trim())) continue;
      // Segredos dentro de config também vão cifrados (crypto.server.ts).
      config[k] = isSecret ? writeSecret(String(v).trim()) : v;
    }
    const newKey = data.api_key?.trim();

    const { error } = await supabaseAdmin.from("integrations").upsert(
      {
        provider: data.provider,
        name: data.name,
        enabled: data.enabled,
        base_url: data.base_url,
        api_key: newKey ? writeSecret(newKey) : existing?.api_key || null,
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

    // Cloudflare: já traz a lista de zonas ao salvar, para o módulo não abrir
    // vazio até o primeiro sync. Falha aqui não desfaz o salvamento -- volta
    // como aviso e o sync normal tenta de novo.
    if (data.provider === "cloudflare" && data.enabled) {
      const { syncCloudflareZones } = await import("./cloudflare.server");
      const sync = await syncCloudflareZones();
      return sync.ok
        ? { ok: true, info: `${sync.zones} zona(s) encontrada(s) na Cloudflare.` }
        : {
            ok: true,
            warning: `Integração salva, mas não foi possível listar as zonas: ${sync.error}`,
          };
    }

    // LeakRadar: testa a chave e confirma o domain_search (sem ele a coleta
    // não tem IDs para deduplicar). Não consome pontos.
    if (data.provider === "leakradar" && data.enabled) {
      const { getLeakRadarAccount } = await import("./leakradar.server");
      try {
        const acc = await getLeakRadarAccount();
        if (acc.hasDomainSearch === false) {
          return {
            ok: true,
            warning:
              "Integração salva, mas o plano não devolve IDs na busca por domínio (domain_search). A coleta vai falhar.",
          };
        }
        const pts = acc.points == null ? "" : ` · ${acc.points.toLocaleString("pt-BR")} pontos`;
        return { ok: true, info: `Conectado${acc.plan ? ` ao plano ${acc.plan}` : ""}${pts}.` };
      } catch (e) {
        return {
          ok: true,
          warning: `Integração salva, mas o teste de conexão falhou: ${(e as Error).message}`,
        };
      }
    }

    return { ok: true };
  });
