import { createServerFn } from "@tanstack/react-start";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Forbidden");
  if (!data) throw new Error("Forbidden: admin role required");
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailTemplateVariable {
  token: string;
  description: string;
  sample: string;
  /** If true, the value is already HTML (e.g. a table) and is not escaped on substitution. */
  raw?: boolean;
}

export interface EmailTemplateDef {
  key: string;
  module_slug: string;
  module_label: string;
  label: string;
  variables: EmailTemplateVariable[];
}

const SAMPLE_ATIVOS_TABLE = `<table style="border-collapse:collapse"><thead><tr><th style="padding:6px 12px;border:1px solid #ddd">Nome</th><th style="padding:6px 12px;border:1px solid #ddd">IP/Hostname</th><th style="padding:6px 12px;border:1px solid #ddd">Bucket</th></tr></thead><tbody><tr><td style="padding:6px 12px;border:1px solid #ddd">srv-app-01</td><td style="padding:6px 12px;border:1px solid #ddd">10.0.0.10</td><td style="padding:6px 12px;border:1px solid #ddd">Alerta</td></tr></tbody></table>`;

const SAMPLE_DOMAINS_TABLE = `<table style="border-collapse:collapse"><thead><tr><th style="padding:6px 12px;border:1px solid #ddd">Domínio</th><th style="padding:6px 12px;border:1px solid #ddd">Registrador</th><th style="padding:6px 12px;border:1px solid #ddd">Vencimento</th><th style="padding:6px 12px;border:1px solid #ddd">Dias restantes</th></tr></thead><tbody><tr><td style="padding:6px 12px;border:1px solid #ddd">exemplo.com.br</td><td style="padding:6px 12px;border:1px solid #ddd">Registro.br</td><td style="padding:6px 12px;border:1px solid #ddd">2026-07-01</td><td style="padding:6px 12px;border:1px solid #ddd;color:#d4a017"><b>15 dia(s)</b></td></tr></tbody></table>`;

const SAMPLE_SSL_TABLE = `<table style="border-collapse:collapse"><thead><tr><th style="padding:6px 12px;border:1px solid #ddd">Domínio</th><th style="padding:6px 12px;border:1px solid #ddd">Emissor</th><th style="padding:6px 12px;border:1px solid #ddd">Validade</th><th style="padding:6px 12px;border:1px solid #ddd">Dias restantes</th></tr></thead><tbody><tr><td style="padding:6px 12px;border:1px solid #ddd">exemplo.com.br</td><td style="padding:6px 12px;border:1px solid #ddd">Let's Encrypt</td><td style="padding:6px 12px;border:1px solid #ddd">2026-07-01</td><td style="padding:6px 12px;border:1px solid #ddd;color:#c1121f"><b>5 dia(s)</b></td></tr></tbody></table>`;

export const EMAIL_TEMPLATE_DEFS: EmailTemplateDef[] = [
  {
    key: "cloudflare_dns_created",
    module_slug: "cloudflare-waf",
    module_label: "Cloudflare WAF",
    label: "Novo registro DNS criado",
    variables: [
      {
        token: "zona",
        description: "Nome da zona (domínio) onde o registro foi criado",
        sample: "exemplo.com.br",
      },
      { token: "tipo", description: "Tipo do registro DNS", sample: "A" },
      { token: "nome", description: "Nome do registro (subdomínio ou @)", sample: "app" },
      { token: "conteudo", description: "Conteúdo/valor do registro", sample: "192.0.2.1" },
      { token: "proxy", description: "Status do proxy Cloudflare", sample: "Ativo" },
      {
        token: "criado_por",
        description: "Nome ou e-mail de quem criou o registro",
        sample: "Maria Souza",
      },
      {
        token: "link",
        description: "Link para abrir o módulo Cloudflare WAF no sistema",
        sample: "https://app.exemplo.com/app/cloudflare-waf",
      },
    ],
  },
  {
    key: "cloudflare_dns_updated",
    module_slug: "cloudflare-waf",
    module_label: "Cloudflare WAF",
    label: "Registro DNS editado",
    variables: [
      {
        token: "zona",
        description: "Nome da zona (domínio) onde o registro foi editado",
        sample: "exemplo.com.br",
      },
      { token: "tipo", description: "Tipo do registro DNS", sample: "A" },
      { token: "nome", description: "Nome do registro (subdomínio ou @)", sample: "app" },
      { token: "conteudo_anterior", description: "Conteúdo/valor do registro antes da edição", sample: "192.0.2.1" },
      { token: "conteudo_novo", description: "Conteúdo/valor do registro após a edição", sample: "192.0.2.2" },
      { token: "proxy", description: "Status do proxy Cloudflare após a edição", sample: "Ativo" },
      {
        token: "alteracoes",
        description: "Resumo dos campos que realmente mudaram (campo: valor antigo → valor novo) — vazio se só o conteúdo foi reenviado igual",
        sample: "proxied: false → true",
      },
      {
        token: "editado_por",
        description: "Nome ou e-mail de quem editou o registro",
        sample: "Maria Souza",
      },
      {
        token: "link",
        description: "Link para abrir o módulo Cloudflare WAF no sistema",
        sample: "https://app.exemplo.com/app/cloudflare-waf",
      },
    ],
  },
  {
    key: "cloudflare_rule_updated",
    module_slug: "cloudflare-waf",
    module_label: "Cloudflare WAF",
    label: "Regra de Rules editada",
    variables: [
      { token: "zona", description: "Nome da zona (domínio) onde a regra foi editada", sample: "exemplo.com.br" },
      { token: "categoria", description: "Categoria da regra (URL Rewrite, Origin, Cache, Redirect, Page Rules...)", sample: "URL Rewrite Rules" },
      { token: "descricao", description: "Descrição da regra editada", sample: "Rewrite /old para /new" },
      { token: "alteracoes", description: "Resumo dos campos que mudaram (campo: valor antigo → valor novo)", sample: "expression: (http.host eq \"a.com\") → (http.host eq \"b.com\")" },
      { token: "editado_por", description: "Nome ou e-mail de quem editou a regra", sample: "Maria Souza" },
      { token: "link", description: "Link para abrir o módulo Cloudflare WAF no sistema", sample: "https://app.exemplo.com/app/cloudflare-waf" },
    ],
  },
  {
    key: "cloudflare_rule_toggled",
    module_slug: "cloudflare-waf",
    module_label: "Cloudflare WAF",
    label: "Regra de Rules habilitada/desabilitada",
    variables: [
      { token: "zona", description: "Nome da zona (domínio) onde a regra foi alterada", sample: "exemplo.com.br" },
      { token: "categoria", description: "Categoria da regra", sample: "Origin Rules" },
      { token: "descricao", description: "Descrição da regra alterada", sample: "Origin dinâmico p/ apps" },
      { token: "novo_status", description: "Novo status da regra após a alteração", sample: "Habilitada" },
      { token: "alterado_por", description: "Nome ou e-mail de quem habilitou/desabilitou a regra", sample: "Maria Souza" },
      { token: "link", description: "Link para abrir o módulo Cloudflare WAF no sistema", sample: "https://app.exemplo.com/app/cloudflare-waf" },
    ],
  },
  {
    key: "cloudflare_rule_deleted",
    module_slug: "cloudflare-waf",
    module_label: "Cloudflare WAF",
    label: "Regra de Rules excluída",
    variables: [
      { token: "zona", description: "Nome da zona (domínio) onde a regra foi excluída", sample: "exemplo.com.br" },
      { token: "categoria", description: "Categoria da regra excluída", sample: "Cache Rules" },
      { token: "descricao", description: "Descrição da regra excluída", sample: "Bypass cache /api/*" },
      { token: "excluido_por", description: "Nome ou e-mail de quem excluiu a regra", sample: "Maria Souza" },
      { token: "link", description: "Link para abrir o módulo Cloudflare WAF no sistema", sample: "https://app.exemplo.com/app/cloudflare-waf" },
    ],
  },
  {
    key: "cmdb_device_alert",
    module_slug: "cmdb",
    module_label: "CMDB",
    label: "Device Alert (monitoramento parcial)",
    variables: [
      { token: "quantidade", description: "Quantidade de ativos afetados", sample: "3" },
      {
        token: "tabela",
        description: "Tabela HTML com os ativos afetados",
        sample: SAMPLE_ATIVOS_TABLE,
        raw: true,
      },
    ],
  },
  {
    key: "cmdb_device_stopped",
    module_slug: "cmdb",
    module_label: "CMDB",
    label: "Device Stopped (sem monitoramento)",
    variables: [
      { token: "quantidade", description: "Quantidade de ativos afetados", sample: "2" },
      {
        token: "tabela",
        description: "Tabela HTML com os ativos afetados",
        sample: SAMPLE_ATIVOS_TABLE,
        raw: true,
      },
    ],
  },
  {
    key: "domain_expiry_alert",
    module_slug: "dominios-ssl",
    module_label: "Domínios/SSL",
    label: "Domínios próximos do vencimento",
    variables: [
      {
        token: "quantidade",
        description: "Quantidade de domínios próximos do vencimento",
        sample: "1",
      },
      {
        token: "tabela",
        description: "Tabela HTML com os domínios",
        sample: SAMPLE_DOMAINS_TABLE,
        raw: true,
      },
    ],
  },
  {
    key: "ssl_expiry_alert",
    module_slug: "dominios-ssl",
    module_label: "Domínios/SSL",
    label: "Certificados SSL próximos do vencimento",
    variables: [
      {
        token: "quantidade",
        description: "Quantidade de certificados próximos do vencimento",
        sample: "1",
      },
      {
        token: "tabela",
        description: "Tabela HTML com os certificados",
        sample: SAMPLE_SSL_TABLE,
        raw: true,
      },
    ],
  },
  {
    key: "fornecedor_expiry_alert",
    module_slug: "fornecedores",
    module_label: "Fornecedores",
    label: "Contrato de fornecedor próximo do vencimento",
    variables: [
      { token: "fornecedor", description: "Nome do fornecedor", sample: "Acme Ltda" },
      { token: "servico", description: "Serviço prestado", sample: "Licenciamento de software" },
      { token: "vencimento", description: "Data de vencimento do contrato", sample: "2026-07-01" },
      { token: "dias", description: "Dias restantes até o vencimento", sample: "10" },
    ],
  },
  {
    key: "gmud_approval_request",
    module_slug: "gmud",
    module_label: "GMUD",
    label: "Solicitação de aprovação",
    variables: [
      {
        token: "titulo",
        description: "Título da GMUD",
        sample: "Atualização do firewall perimetral",
      },
      {
        token: "tipo",
        description: "Tipo da GMUD (Normal, Padrão, Emergencial)",
        sample: "Normal",
      },
      { token: "impacto", description: "Impacto (Baixo, Médio, Alto)", sample: "Médio" },
      {
        token: "data_inicio",
        description: "Início da janela de manutenção",
        sample: "01/07/2026 22:00",
      },
      { token: "data_fim", description: "Fim da janela de manutenção", sample: "02/07/2026 02:00" },
      {
        token: "descricao",
        description: "Descrição da GMUD",
        sample: "Atualização de regras e firmware do firewall.",
      },
      {
        token: "solicitante",
        description: "Nome de quem criou/solicitou a GMUD",
        sample: "Maria Souza",
      },
      { token: "aprovador", description: "Nome do aprovador desta etapa", sample: "João Silva" },
      { token: "ordem", description: "Número da etapa de aprovação atual", sample: "1" },
      { token: "total", description: "Total de etapas de aprovação", sample: "2" },
      {
        token: "link",
        description: "Link para abrir a GMUD no sistema",
        sample: "https://app.exemplo.com/app/gmud?gmud=123",
      },
    ],
  },
  {
    key: "gmud_approved",
    module_slug: "gmud",
    module_label: "GMUD",
    label: "GMUD aprovada",
    variables: [
      {
        token: "titulo",
        description: "Título da GMUD",
        sample: "Atualização do firewall perimetral",
      },
      {
        token: "tipo",
        description: "Tipo da GMUD (Normal, Padrão, Emergencial)",
        sample: "Normal",
      },
      { token: "impacto", description: "Impacto (Baixo, Médio, Alto)", sample: "Médio" },
      {
        token: "data_inicio",
        description: "Início da janela de manutenção",
        sample: "01/07/2026 22:00",
      },
      { token: "data_fim", description: "Fim da janela de manutenção", sample: "02/07/2026 02:00" },
      {
        token: "link",
        description: "Link para abrir a GMUD no sistema",
        sample: "https://app.exemplo.com/app/gmud?gmud=123",
      },
    ],
  },
  {
    key: "gmud_rejected",
    module_slug: "gmud",
    module_label: "GMUD",
    label: "GMUD rejeitada",
    variables: [
      {
        token: "titulo",
        description: "Título da GMUD",
        sample: "Atualização do firewall perimetral",
      },
      {
        token: "tipo",
        description: "Tipo da GMUD (Normal, Padrão, Emergencial)",
        sample: "Normal",
      },
      { token: "impacto", description: "Impacto (Baixo, Médio, Alto)", sample: "Médio" },
      {
        token: "data_inicio",
        description: "Início da janela de manutenção",
        sample: "01/07/2026 22:00",
      },
      { token: "data_fim", description: "Fim da janela de manutenção", sample: "02/07/2026 02:00" },
      {
        token: "rejeitado_por",
        description: "Nome do aprovador que rejeitou",
        sample: "João Silva",
      },
      {
        token: "motivo",
        description: "Justificativa informada na rejeição",
        sample: "Janela de manutenção conflita com outra mudança em andamento.",
      },
      {
        token: "link",
        description: "Link para abrir a GMUD no sistema",
        sample: "https://app.exemplo.com/app/gmud?gmud=123",
      },
    ],
  },
];

const TEMPLATE_KEYS = EMAIL_TEMPLATE_DEFS.map((t) => t.key) as [string, ...string[]];

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { data } = await sb.from("email_templates").select("*");
    const overrides = new Map((data ?? []).map((r: any) => [r.template_key, r]));
    return EMAIL_TEMPLATE_DEFS.map((def) => {
      const row = overrides.get(def.key);
      return {
        key: def.key,
        module_slug: def.module_slug,
        module_label: def.module_label,
        label: def.label,
        variables: def.variables,
        mode: row?.mode ?? "default",
        custom_html: row?.custom_html ?? null,
      };
    });
  });

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        template_key: z.enum(TEMPLATE_KEYS),
        mode: z.enum(["default", "custom"]),
        custom_html: z.string().max(100000).optional().nullable(),
        updated_by: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { error } = await sb.from("email_templates").upsert(
      {
        template_key: data.template_key,
        mode: data.mode,
        custom_html: data.custom_html ?? null,
        updated_by: data.updated_by ?? null,
      },
      { onConflict: "template_key" },
    );

    await logAudit({
      userId: context.userId,
      modulo: "smtp",
      acao: "update_template",
      descricao: `Alterou o template de e-mail "${data.template_key}" para modo "${data.mode === "custom" ? "personalizado" : "padrão"}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { template_key: data.template_key, mode: data.mode },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface EmailTemplateOverride {
  mode: string;
  custom_html: string | null;
}

/** Fetches the stored override (if any) for a template key. Returns null if no row exists (= default). */
export async function getEmailTemplateOverride(sb: SupabaseClient, key: string): Promise<EmailTemplateOverride | null> {
  const { data } = await sb.from("email_templates").select("mode, custom_html").eq("template_key", key).maybeSingle();
  return data ? { mode: (data as any).mode, custom_html: (data as any).custom_html } : null;
}

/**
 * Renders the e-mail HTML for a given template key: if a custom override is active,
 * substitutes {{token}} placeholders with the provided values (escaping non-raw vars);
 * otherwise returns the default HTML produced by the caller.
 */
export function applyEmailTemplate(
  key: string,
  override: EmailTemplateOverride | null,
  vars: Record<string, string>,
  defaultHtml: string,
): string {
  if (!override || override.mode !== "custom" || !override.custom_html) return defaultHtml;
  const def = EMAIL_TEMPLATE_DEFS.find((t) => t.key === key);
  let html = override.custom_html;
  for (const v of def?.variables ?? []) {
    const value = vars[v.token] ?? "";
    const rendered = v.raw ? value : escapeHtml(value);
    html = html.split(`{{${v.token}}}`).join(rendered);
  }
  return html;
}
