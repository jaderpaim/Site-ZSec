import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit-log.functions";

// Fontes confiáveis da ingestão SAST (card SAST → aba Fontes confiáveis). Mesmo
// gate da chave de ingestão: admin ou super admin global. A chave em texto só
// existe na resposta de rotateSastTrustSourceKey — o banco guarda só o hash.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertIntegrationsAdmin(context: any) {
  const [adminRes, superRes] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (adminRes.error) throw new Error(`Permissão indisponível: ${adminRes.error.message}`);
  if (adminRes.data !== true && superRes.data !== true)
    throw new Error("Acesso negado: requer perfil admin");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora dos tipos gerados
const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export type TrustSourceView = {
  id: string;
  provider: "gitea" | "github" | "azure_devops";
  owner: string;
  repo_pattern: string;
  department_id: string | null;
  label: string | null;
  enabled: boolean;
  keys: { hint: string; createdAt: string }[];
};

export const listSastTrustSources = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<TrustSourceView[]> => {
    await assertIntegrationsAdmin(context);
    const { listTrustSources } = await import("@/lib/sast-trust-sources.server");
    const sources = await listTrustSources();
    return sources.map((s) => ({
      id: s.id,
      provider: s.provider,
      owner: s.owner,
      repo_pattern: s.repo_pattern,
      department_id: s.department_id,
      label: s.label,
      enabled: s.enabled,
      keys: s.keys.map((k) => ({ hint: k.hint, createdAt: k.created_at })),
    }));
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  // GitHub entra na etapa B (OIDC); até lá só Gitea e Azure DevOps.
  provider: z.enum(["gitea", "azure_devops"]),
  owner: z
    .string()
    .trim()
    .min(1, "Informe a organização / projeto")
    .max(200)
    .regex(/^[^/\s][^/]*$/, "Use só o nome da organização ou projeto, sem barra"),
  repo_pattern: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_.*-]{1,200}$/,
      "Use * (todos), um prefixo como pagamentos-* ou o nome exato",
    )
    .refine((p) => !p.slice(0, -1).includes("*"), "O * só pode vir no fim"),
  department_id: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(120).nullable().optional(),
  enabled: z.boolean(),
});

export const upsertSastTrustSource = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertIntegrationsAdmin(context);
    const row = {
      provider: data.provider,
      owner: data.owner,
      repo_pattern: data.repo_pattern,
      department_id: data.department_id ?? null,
      label: data.label || null,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await adminDb.from("sast_trust_sources").update(row).eq("id", data.id)
      : await adminDb.from("sast_trust_sources").insert({ ...row, created_by: context.userId });
    const escopo = `${data.provider} ${data.owner}/${data.repo_pattern}`;
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: data.id ? "update_trust_source" : "create_trust_source",
      descricao: `${data.id ? "Editou" : "Criou"} a fonte confiável SAST ${escopo} (${data.enabled ? "ativa" : "inativa"})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { ...row },
    });
    if (error) {
      if (/duplicate key|unique/i.test(error.message))
        throw new Error(
          "Já existe uma fonte com esse provedor, organização e filtro de repositórios.",
        );
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSastTrustSource = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertIntegrationsAdmin(context);
    const { error } = await adminDb.from("sast_trust_sources").delete().eq("id", data.id);
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "delete_trust_source",
      descricao: "Excluiu uma fonte confiável SAST (as chaves dela deixam de valer)",
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { id: data.id },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateSastTrustSourceKey = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertIntegrationsAdmin(context);
    const { rotateTrustSourceKey } = await import("@/lib/sast-trust-sources.server");
    const { key, hint } = await rotateTrustSourceKey(data.id, context.userId);
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "rotate_trust_source_key",
      descricao: `Gerou nova chave (${hint}…) para uma fonte confiável SAST; a anterior continua válida até ser revogada`,
      detalhes: { id: data.id, hint },
    });
    return { key, hint };
  });

export const revokePreviousSastTrustSourceKey = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertIntegrationsAdmin(context);
    const { revokePreviousTrustSourceKey } = await import("@/lib/sast-trust-sources.server");
    const revoked = await revokePreviousTrustSourceKey(data.id);
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "revoke_trust_source_key",
      descricao: revoked
        ? "Revogou a chave anterior de uma fonte confiável SAST"
        : "Tentou revogar a chave anterior de uma fonte confiável SAST, mas não havia",
      detalhes: { id: data.id },
    });
    return { revoked };
  });
