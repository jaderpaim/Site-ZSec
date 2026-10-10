import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";

// Dados da organização que opera a instância (tabela organizacao_config, uma
// linha por banco). Enquanto não houver linha -- ou a migration ainda não foi
// aplicada neste banco -- o app usa ORG_FALLBACK em vez de quebrar.
// A parte só de servidor fica em organizacao.server.ts e é importada dentro
// dos handlers, para não ir para o bundle do navegador.

export type Organizacao = {
  nome: string;
  nome_curto: string | null;
  dominio_corporativo: string | null;
  configurada: boolean;
};

export const ORG_FALLBACK: Organizacao = {
  nome: "Sua organização",
  nome_curto: null,
  dominio_corporativo: null,
  configurada: false,
};

async function assertAdmin(context: any) {
  const [adminRes, superRes] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (adminRes.data === true || superRes.data === true) return;
  throw new Error("Forbidden: admin role required");
}

export const getOrganizacao = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async () => {
    const S = await import("./organizacao.server");
    return S.loadOrganizacao();
  });

export const upsertOrganizacao = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        nome: z.string().trim().min(1).max(120),
        nome_curto: z.string().trim().max(40).optional().nullable(),
        dominio_corporativo: z
          .string()
          .trim()
          .toLowerCase()
          .max(253)
          .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, "Domínio inválido (ex.: empresa.com.br)")
          .optional()
          .nullable()
          .or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const S = await import("./organizacao.server");
    const payload = {
      id: true,
      nome: data.nome,
      nome_curto: data.nome_curto || null,
      dominio_corporativo: data.dominio_corporativo || null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    const { error } = await S.orgAdminClient()
      .from("organizacao_config")
      .upsert(payload, { onConflict: "id" });
    S.clearOrganizacaoCache();

    await logAudit({
      userId: context.userId,
      modulo: "dados-organizacao",
      acao: "update",
      descricao: `Atualizou os dados da organização (nome: ${data.nome})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        nome: payload.nome,
        nome_curto: payload.nome_curto,
        dominio_corporativo: payload.dominio_corporativo,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
