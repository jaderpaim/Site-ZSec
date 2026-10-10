// Helper de auditoria — chamado a partir dos handlers de mutação em Configurações
// (src/lib/*.functions.ts), nunca diretamente do client. Best-effort: uma falha ao
// gravar o log NUNCA deve derrubar a ação administrativa que está sendo auditada.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditModule =
  | "excecao-sophos"
  | "smtp"
  | "dados-organizacao"
  | "sso-ldap"
  | "usuarios"
  | "integracoes"
  | "alertas"
  | "cron-jobs"
  | "dast-scanner"
  | "shadow-it"
  | "sast"
  | "disponibilidade"
  | "dominios-ssl";

type LogAuditParams = {
  userId: string;
  modulo: AuditModule;
  acao: string;
  descricao: string;
  status?: "success" | "error";
  mensagemErro?: string | null;
  detalhes?: Record<string, unknown> | null;
};

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", params.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("system_audit_log").insert({
      user_id: params.userId,
      usuario_email: profile?.email ?? null,
      usuario_nome: profile?.full_name ?? null,
      modulo: params.modulo,
      acao: params.acao,
      descricao: params.descricao,
      status: params.status ?? "success",
      mensagem_erro: params.mensagemErro ?? null,
      detalhes: (params.detalhes ?? null) as never,
    });
    if (error) console.error("[audit-log] falha ao gravar system_audit_log:", error.message);
  } catch (e) {
    console.error("[audit-log] falha ao gravar system_audit_log:", e);
  }
}
