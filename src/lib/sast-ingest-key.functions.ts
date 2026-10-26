import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";

// Gestão da chave de ingestão SAST (card SAST → aba Azure DevOps). Mesmo gate
// de Integração API: admin ou super admin global. A chave em texto só existe
// na resposta de rotateSastIngestKey -- o banco guarda só o hash.
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

export const getSastIngestKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertIntegrationsAdmin(context);
    const { getStoredIngestKeys } = await import("@/lib/sast-ingest-key.server");
    const keys = await getStoredIngestKeys();
    return { keys: keys.map((k) => ({ hint: k.hint, createdAt: k.created_at })) };
  });

export const rotateSastIngestKey = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertIntegrationsAdmin(context);
    const { rotateIngestKey } = await import("@/lib/sast-ingest-key.server");
    try {
      const { key, hint } = await rotateIngestKey(context.userId);
      await logAudit({
        userId: context.userId,
        modulo: "sast",
        acao: "rotate_ingest_key",
        descricao: `Gerou nova chave de ingestão SAST (${hint}…); a anterior continua válida até ser revogada`,
        detalhes: { hint },
      });
      return { key, hint };
    } catch (e) {
      await logAudit({
        userId: context.userId,
        modulo: "sast",
        acao: "rotate_ingest_key",
        descricao: "Falha ao gerar nova chave de ingestão SAST",
        status: "error",
        mensagemErro: (e as Error).message,
      });
      throw e;
    }
  });

export const revokePreviousSastIngestKey = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertIntegrationsAdmin(context);
    const { revokePreviousIngestKey } = await import("@/lib/sast-ingest-key.server");
    const revoked = await revokePreviousIngestKey();
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "revoke_ingest_key",
      descricao: revoked
        ? "Revogou a chave de ingestão SAST anterior"
        : "Tentou revogar chave de ingestão SAST anterior, mas não havia nenhuma",
    });
    return { revoked };
  });

export const revokeAllSastIngestKeys = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertIntegrationsAdmin(context);
    const { revokeAllIngestKeys } = await import("@/lib/sast-ingest-key.server");
    const revoked = await revokeAllIngestKeys();
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "revoke_all_ingest_keys",
      descricao: revoked
        ? `Desativou a chave legada de ingestão SAST (${revoked} chave(s)); só chaves por fonte confiável valem agora`
        : "Tentou desativar a chave legada de ingestão SAST, mas não havia nenhuma",
    });
    return { revoked };
  });
