// Cloudflare WAF — solicitações de exclusão de DNS, alertas de auditoria e
// backups de DNS (telas: aba Solicitações, Histórico › Alertas de auditoria,
// Ações › Backups de DNS). A lógica pesada fica em cloudflare.guard.server.ts.
//
// Regras do fluxo de exclusão (aplicadas AQUI, no servidor):
//   - não existe "excluir DNS" solto: só approveDeleteRequest apaga, e recebe o
//     id do pedido, nunca o registro (exceção: deleteWithException, que só
//     funciona dentro de uma janela liberada por outro admin — ver abaixo);
//   - quatro olhos: quem pediu não confirma;
//   - confirmar exige manage_aprovar_exclusao_dns + perfil admin/super admin;
//   - o registro precisa estar igual ao do pedido; um por vez; limite por hora.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { hasPermission, requireGlobalAdminRole, requirePermission } from "@/lib/authz";

// Só alfanumérico: o id entra em filtro .or(...) do PostgREST (vírgula ou
// parêntese abririam brecha de injeção no filtro). Ids da Cloudflare são hex.
const zoneIdSchema = z.string().regex(/^[a-zA-Z0-9]{1,64}$/, "Zona inválida");

async function ctxEmail(context: any): Promise<string | null> {
  const { resolveUserEmail } = await import("@/lib/cloudflare.server");
  return resolveUserEmail(context.userId, context.claims?.email ?? null);
}

// Perfil global admin ou super admin (não é permissão de módulo). Só eles veem
// os pedidos de exclusão de todo mundo; os demais veem só os que abriram.
async function isGlobalAdmin(sb: any, userId: string): Promise<boolean> {
  const [a, s] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  return a.data === true || s.data === true;
}

async function zoneName(zoneId: string): Promise<string> {
  const { resolveZoneName } = await import("@/lib/cloudflare.server");
  const name = await resolveZoneName(zoneId);
  if (!name) throw new Error("Zona não sincronizada.");
  return name;
}

// ─── Status pros balões (aba Solicitações / aba Histórico) ──────────────────
export type GuardStatus = {
  pendingRequests: number | null;
  criticalOpen: number | null;
  watch: { lastOkAt: string | null; lastError: string | null } | null;
};

export const getGuardStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) => z.object({ zoneId: zoneIdSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuardStatus> => {
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const db = guardDb();
    const [canViewReq, canRequest, canHistory, admin] = await Promise.all([
      hasPermission(context.supabase, context.userId, "cloudflare-waf", "view_solicitacoes"),
      hasPermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_solicitar_exclusao_dns",
      ),
      hasPermission(context.supabase, context.userId, "cloudflare-waf", "view_history"),
      isGlobalAdmin(context.supabase, context.userId),
    ]);
    let pendingRequests: number | null = null;
    if (canViewReq || canRequest) {
      let q = db
        .from("cloudflare_dns_delete_requests")
        .select("id", { count: "exact", head: true })
        .eq("zone_id", data.zoneId)
        .eq("status", "pending");
      // Balão: admin/super admin conta todos os pendentes; os demais, só os seus.
      if (!admin) q = q.eq("requested_by", context.userId);
      const { count } = await q;
      pendingRequests = count ?? 0;
    }
    let criticalOpen: number | null = null;
    let watch: GuardStatus["watch"] = null;
    if (canHistory) {
      const { count } = await db
        .from("cloudflare_audit_alerts")
        .select("id", { count: "exact", head: true })
        .eq("severity", "critical")
        .is("acknowledged_at", null)
        .or(`zone_id.eq.${data.zoneId},zone_id.is.null`);
      criticalOpen = count ?? 0;
      const { data: st } = await db
        .from("cloudflare_audit_watch_state")
        .select("last_ok_at, last_error")
        .order("last_run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      watch = st
        ? { lastOkAt: st.last_ok_at, lastError: st.last_error }
        : { lastOkAt: null, lastError: null };
    }
    return { pendingRequests, criticalOpen, watch };
  });

// ─── Solicitações de exclusão ───────────────────────────────────────────────
export type DeleteRequest = {
  id: string;
  zoneId: string;
  zoneName: string | null;
  recordId: string;
  record: {
    type: string;
    name: string;
    content: string;
    proxied: boolean | null;
    ttl: number | null;
  };
  justification: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "failed";
  requestedBy: string | null;
  requestedByEmail: string | null;
  decidedByEmail: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  error: string | null;
  createdAt: string;
  mine: boolean;
  // Excluído na hora por janela de exceção (sem pedido de aprovação).
  byException: boolean;
  // Restaurado a partir da cópia de antes da exclusão (migration
  // 20261105130000; sem ela fica sempre null).
  restoredAt: string | null;
  restoredByEmail: string | null;
};

// Liga o pedido à cópia feita antes da exclusão. Tolerante: sem a migration
// 20261105130000 a coluna não existe e o vínculo cai na busca por horário.
async function linkRequestSnapshot(db: any, requestId: string, snapshotId: string) {
  const { error } = await db
    .from("cloudflare_dns_delete_requests")
    .update({ snapshot_id: snapshotId })
    .eq("id", requestId);
  if (error) console.warn("[dns-restore] snapshot_id não gravado:", error.message);
}

function mapRequest(r: any, userId: string): DeleteRequest {
  const s = r.record_snapshot ?? {};
  return {
    id: r.id,
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    recordId: r.record_id,
    record: {
      type: s.type ?? "",
      name: s.name ?? "",
      content: s.content ?? "",
      proxied: s.proxied ?? null,
      ttl: s.ttl ?? null,
    },
    justification: r.justification,
    status: r.status,
    requestedBy: r.requested_by,
    requestedByEmail: r.requested_by_email,
    decidedByEmail: r.decided_by_email,
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    error: r.error,
    createdAt: r.created_at,
    mine: r.requested_by === userId,
    byException: !!r.exception_id,
    restoredAt: r.restored_at ?? null,
    restoredByEmail: r.restored_by_email ?? null,
  };
}

export const listDeleteRequests = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; status?: string }) =>
    z
      .object({
        zoneId: zoneIdSchema,
        status: z
          .enum(["pending", "approved", "rejected", "cancelled", "failed", "all"])
          .default("all"),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ requests: DeleteRequest[]; canViewAll: boolean }> => {
      const [canViewTab, canRequest, canViewAll] = await Promise.all([
        hasPermission(context.supabase, context.userId, "cloudflare-waf", "view_solicitacoes"),
        hasPermission(
          context.supabase,
          context.userId,
          "cloudflare-waf",
          "manage_solicitar_exclusao_dns",
        ),
        // Ver os pedidos de todos: só perfil global admin/super admin.
        isGlobalAdmin(context.supabase, context.userId),
      ]);
      if (!canViewTab && !canRequest && !canViewAll)
        throw new Error("Acesso negado: você não tem permissão para ver solicitações.");
      const { guardDb } = await import("@/lib/cloudflare.guard.server");
      let q = guardDb()
        .from("cloudflare_dns_delete_requests")
        .select("*")
        .eq("zone_id", data.zoneId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (data.status !== "all") q = q.eq("status", data.status);
      // Quem não é admin/super admin só acompanha os pedidos que abriu.
      if (!canViewAll) q = q.eq("requested_by", context.userId);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return { requests: (rows ?? []).map((r: any) => mapRequest(r, context.userId)), canViewAll };
    },
  );

export const createDeleteRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; recordId: string; justification: string }) =>
    z
      .object({
        zoneId: zoneIdSchema,
        recordId: z.string().min(1).max(64),
        justification: z
          .string()
          .trim()
          .min(20, "A justificativa precisa ter pelo menos 20 caracteres.")
          .max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_solicitar_exclusao_dns",
    );
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const email = await ctxEmail(context);
    const zName = await zoneName(data.zoneId);
    // Sem limite por hora para pedir: nada sai da Cloudflare sem outra pessoa
    // (admin) confirmar, e a confirmação tem limite próprio (approve_dns_delete).

    const token = await g.getCfToken();
    const cur = await g.cf(token, `/zones/${data.zoneId}/dns_records/${data.recordId}`);
    if (!cur.ok)
      return { ok: false as const, error: `Registro não encontrado na Cloudflare: ${cur.error}` };
    const snap = g.snapRecord(cur.json.result);

    const { data: row, error } = await g
      .guardDb()
      .from("cloudflare_dns_delete_requests")
      .insert({
        zone_id: data.zoneId,
        zone_name: zName,
        record_id: data.recordId,
        record_snapshot: snap,
        justification: data.justification,
        requested_by: context.userId,
        requested_by_email: email,
      })
      .select("id")
      .single();
    if (error) {
      if (String(error.code) === "23505")
        return {
          ok: false as const,
          error: "Já existe um pedido de exclusão pendente para este registro.",
        };
      return { ok: false as const, error: error.message };
    }
    const desc = `${snap.type} ${snap.name}`;
    await Promise.all([
      logCloudflareAudit({
        action: "request_dns_delete",
        status: "success",
        zoneId: data.zoneId,
        zoneName: zName,
        userEmail: email,
        details: {
          request_id: row.id,
          type: snap.type,
          name: snap.name,
          content: snap.content,
          justification: data.justification,
        },
        message: `Exclusão de ${desc} solicitada em ${zName}`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_dns_delete_request",
        severity: "warning",
        title: "Exclusão de DNS solicitada",
        zoneName: zName,
        category: "Aguardando aprovação",
        description: desc,
        facts: [
          { name: "Aponta para", value: snap.content },
          { name: "Justificativa", value: data.justification },
          {
            name: "Situação",
            value:
              "O registro ainda NÃO foi removido. Só sai da Cloudflare quando um aprovador confirmar na aba Solicitações.",
          },
        ],
        actor: email,
        actorLabel: "Solicitado por",
        vars: { conteudo: snap.content, justificativa: data.justification },
      }),
    ]);
    return { ok: true as const, id: String(row.id) };
  });

export const cancelDeleteRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const { data: r } = await guardDb()
      .from("cloudflare_dns_delete_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) return { ok: false as const, error: "Pedido não encontrado." };
    if (r.requested_by !== context.userId)
      return { ok: false as const, error: "Só quem abriu o pedido pode cancelá-lo." };
    if (r.status !== "pending")
      return { ok: false as const, error: "Este pedido já foi decidido." };
    await guardDb()
      .from("cloudflare_dns_delete_requests")
      .update({
        status: "cancelled",
        decided_by: context.userId,
        decided_by_email: await ctxEmail(context),
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending");
    return { ok: true as const };
  });

export const rejectDeleteRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string; reason: string }) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(10, "Informe o motivo (pelo menos 10 caracteres).").max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_aprovar_exclusao_dns",
    );
    // Só admin/super admin vê os pedidos de outras pessoas — e só ele decide.
    await requireGlobalAdminRole(context.supabase, context.userId);
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const db = g.guardDb();
    const { data: r } = await db
      .from("cloudflare_dns_delete_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) return { ok: false as const, error: "Pedido não encontrado." };
    if (r.status !== "pending")
      return { ok: false as const, error: "Este pedido já foi decidido." };
    const email = await ctxEmail(context);
    const { error } = await db
      .from("cloudflare_dns_delete_requests")
      .update({
        status: "rejected",
        decided_by: context.userId,
        decided_by_email: email,
        decided_at: new Date().toISOString(),
        decision_reason: data.reason,
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) return { ok: false as const, error: error.message };
    const s = r.record_snapshot ?? {};
    const desc = `${s.type} ${s.name}`;
    await Promise.all([
      logCloudflareAudit({
        action: "reject_dns_delete",
        status: "success",
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        userEmail: email,
        details: {
          request_id: r.id,
          type: s.type,
          name: s.name,
          reason: data.reason,
          requested_by: r.requested_by_email,
        },
        message: `Pedido de exclusão de ${desc} recusado`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_dns_delete_request",
        severity: "info",
        title: "Pedido de exclusão de DNS recusado",
        zoneName: r.zone_name ?? r.zone_id,
        category: "Recusado",
        description: desc,
        facts: [
          { name: "Pedido por", value: r.requested_by_email ?? "—" },
          { name: "Motivo da recusa", value: data.reason },
        ],
        actor: email,
        actorLabel: "Recusado por",
        vars: { conteudo: s.content ?? "", justificativa: r.justification },
      }),
    ]);
    return { ok: true as const };
  });

export const approveDeleteRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string; confirmName: string }) =>
    z
      .object({ id: z.string().uuid(), confirmName: z.string().trim().min(1).max(255) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_aprovar_exclusao_dns",
    );
    // Excluir é destrutivo: perfil global admin/super admin além da permissão.
    await requireGlobalAdminRole(context.supabase, context.userId);
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const db = g.guardDb();
    const { data: r } = await db
      .from("cloudflare_dns_delete_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) return { ok: false as const, error: "Pedido não encontrado." };
    if (r.status !== "pending")
      return { ok: false as const, error: "Este pedido já foi decidido." };
    if (r.requested_by === context.userId)
      return {
        ok: false as const,
        error: "Quem abriu o pedido não pode confirmar: outro aprovador precisa confirmar.",
      };
    const snap = r.record_snapshot as ReturnType<typeof g.snapRecord>;
    if (data.confirmName.toLowerCase() !== String(snap.name).toLowerCase()) {
      return { ok: false as const, error: "O nome digitado não confere com o registro." };
    }
    const email = await ctxEmail(context);
    await g.enforceRateLimit(context.userId, "approve_dns_delete", email);

    const token = await g.getCfToken();
    const cur = await g.cf(token, `/zones/${r.zone_id}/dns_records/${r.record_id}`);
    if (!cur.ok) {
      await db
        .from("cloudflare_dns_delete_requests")
        .update({
          status: "failed",
          error: `Registro não encontrado na Cloudflare: ${cur.error}`,
          decided_by: context.userId,
          decided_by_email: email,
          decided_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      return {
        ok: false as const,
        error:
          "O registro já não existe na Cloudflare (pode ter sido apagado por fora). O pedido foi marcado como falho e o caso merece revisão no Histórico.",
      };
    }
    const current = g.snapRecord(cur.json.result);
    if (g.recordKey(current) !== g.recordKey(snap)) {
      return {
        ok: false as const,
        error:
          "O registro mudou desde o pedido (conteúdo, proxy ou TTL). Recuse este pedido e abra outro com o estado atual.",
      };
    }
    // Cópia do registro antes de apagar (Backups › "Antes da exclusão" e botão
    // Restaurar no pedido / Histórico).
    const snapshotId = await g.saveSnapshot({
      zoneId: r.zone_id,
      zoneName: r.zone_name,
      kind: "pre_delete",
      records: [current],
      createdBy: context.userId,
    });
    await linkRequestSnapshot(db, r.id, snapshotId);
    // Marca como aprovado ANTES da chamada: o monitor do log de auditoria casa a
    // exclusão com este pedido pelo decided_at.
    const decidedAt = new Date().toISOString();
    const { error: upErr } = await db
      .from("cloudflare_dns_delete_requests")
      .update({
        status: "approved",
        decided_by: context.userId,
        decided_by_email: email,
        decided_at: decidedAt,
      })
      .eq("id", r.id)
      .eq("status", "pending");
    if (upErr) return { ok: false as const, error: upErr.message };
    const del = await g.cf(token, `/zones/${r.zone_id}/dns_records/${r.record_id}`, {
      method: "DELETE",
    });
    const desc = `${snap.type} ${snap.name}`;
    if (!del.ok) {
      await db
        .from("cloudflare_dns_delete_requests")
        .update({ status: "failed", error: del.error })
        .eq("id", r.id);
      await logCloudflareAudit({
        action: "delete_dns",
        status: "error",
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        userEmail: email,
        details: { request_id: r.id, type: snap.type, name: snap.name },
        message: del.error,
      });
      return { ok: false as const, error: `A Cloudflare recusou a exclusão: ${del.error}` };
    }
    await db.from("cloudflare_dns_records").delete().eq("id", r.record_id);
    await Promise.all([
      logCloudflareAudit({
        action: "delete_dns",
        status: "success",
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        userEmail: email,
        details: {
          request_id: r.id,
          type: snap.type,
          name: snap.name,
          content: snap.content,
          proxied: snap.proxied,
          ttl: snap.ttl,
          justification: r.justification,
          requested_by: r.requested_by_email,
        },
        message: `${desc} excluído em ${r.zone_name ?? r.zone_id} (pedido de ${r.requested_by_email ?? "—"})`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_dns_delete_request",
        severity: "critical",
        title: "Registro DNS excluído (pedido aprovado)",
        zoneName: r.zone_name ?? r.zone_id,
        category: "Excluído",
        description: desc,
        facts: [
          { name: "Apontava para", value: snap.content },
          { name: "Pedido por", value: r.requested_by_email ?? "—" },
          { name: "Justificativa", value: r.justification },
        ],
        actor: email,
        actorLabel: "Confirmado por",
        vars: { conteudo: snap.content, justificativa: r.justification },
      }),
    ]);
    return { ok: true as const };
  });

// ─── Exceção de aprovação (janela temporária) ───────────────────────────────
// Admin/super admin com manage_liberar_excecao_dns libera para OUTRO usuário
// (que tenha "Solicitar exclusão de DNS") um período em que a lixeira apaga na
// hora, nas zonas escolhidas, até um limite. Os quatro olhos ficam na
// liberação; cada exclusão guarda cópia, entra no Histórico e alerta.
export type DeleteException = {
  id: string;
  userId: string;
  userEmail: string | null;
  zoneIds: string[];
  zoneNames: string[];
  maxDeletes: number;
  used: number;
  startsAt: string;
  expiresAt: string;
  ticket: string | null;
  justification: string;
  grantedByEmail: string | null;
  closedAt: string | null;
  closeReason: "expired" | "limit" | "revoked" | null;
  closedByEmail: string | null;
  active: boolean;
  deletions: Array<{ type: string; name: string; content: string; zoneName: string | null; at: string | null }>;
};

function mapException(r: any, deletions: DeleteException["deletions"] = []): DeleteException {
  const active =
    !r.closed_at && new Date(r.expires_at).getTime() > Date.now() && r.used_count < r.max_deletes;
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    zoneIds: r.zone_ids ?? [],
    zoneNames: r.zone_names?.length ? r.zone_names : (r.zone_ids ?? []),
    maxDeletes: r.max_deletes,
    used: r.used_count,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    ticket: r.ticket,
    justification: r.justification,
    grantedByEmail: r.granted_by_email,
    closedAt: r.closed_at,
    // Vencida mas ainda não varrida pelo monitor: já mostra como expirada.
    closeReason: r.close_reason ?? (active ? null : r.used_count >= r.max_deletes ? "limit" : "expired"),
    closedByEmail: r.closed_by_email,
    active,
    deletions,
  };
}

async function requireExceptionManager(context: any) {
  await requirePermission(
    context.supabase,
    context.userId,
    "cloudflare-waf",
    "manage_liberar_excecao_dns",
  );
  await requireGlobalAdminRole(context.supabase, context.userId);
}

// Janela ativa do próprio usuário (banner + lixeira roxa em Registros DNS).
export const getMyDeleteException = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<DeleteException | null> => {
    const ok = await hasPermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_solicitar_exclusao_dns",
    );
    if (!ok) return null;
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const { data } = await guardDb()
      .from("cloudflare_dns_delete_exceptions")
      .select("*")
      .eq("user_id", context.userId)
      .is("closed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return null;
    const ex = mapException(data);
    return ex.active ? ex : null;
  });

export const listDeleteExceptions = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<DeleteException[]> => {
    await requireExceptionManager(context);
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const db = guardDb();
    const { data, error } = await db
      .from("cloudflare_dns_delete_exceptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const ids = rows.map((r) => r.id);
    const byEx = new Map<string, DeleteException["deletions"]>();
    if (ids.length) {
      const { data: dels } = await db
        .from("cloudflare_dns_delete_requests")
        .select("exception_id, zone_name, record_snapshot, decided_at")
        .in("exception_id", ids)
        .eq("status", "approved")
        .order("decided_at", { ascending: true });
      for (const d of (dels ?? []) as any[]) {
        const list = byEx.get(d.exception_id) ?? [];
        list.push({
          type: d.record_snapshot?.type ?? "",
          name: d.record_snapshot?.name ?? "",
          content: d.record_snapshot?.content ?? "",
          zoneName: d.zone_name,
          at: d.decided_at,
        });
        byEx.set(d.exception_id, list);
      }
    }
    return rows.map((r) => mapException(r, byEx.get(r.id) ?? []));
  });

// Quem pode receber (tem "Solicitar exclusão de DNS"; nunca o próprio admin) e
// as zonas sincronizadas — alimenta o diálogo "Liberar exceção".
export const getDeleteExceptionOptions = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(
    async ({
      context,
    }): Promise<{
      users: Array<{ id: string; email: string }>;
      zones: Array<{ id: string; name: string }>;
    }> => {
      await requireExceptionManager(context);
      const { guardDb } = await import("@/lib/cloudflare.guard.server");
      const db = guardDb();
      const [{ data: profs }, { data: zs }] = await Promise.all([
        db.from("profiles").select("id, email").not("email", "is", null).limit(1000),
        db
          .from("cloudflare_zones")
          .select("id, name")
          .or("status.is.null,status.neq.removed")
          .order("name"),
      ]);
      const cands = ((profs ?? []) as Array<{ id: string; email: string }>).filter(
        (p) => p.id !== context.userId && p.email,
      );
      const users: Array<{ id: string; email: string }> = [];
      for (let i = 0; i < cands.length; i += 25) {
        const chunk = cands.slice(i, i + 25);
        const oks = await Promise.all(
          chunk.map((p) =>
            hasPermission(db, p.id, "cloudflare-waf", "manage_solicitar_exclusao_dns"),
          ),
        );
        chunk.forEach((p, j) => oks[j] && users.push({ id: p.id, email: p.email }));
      }
      users.sort((a, b) => a.email.localeCompare(b.email));
      return {
        users,
        zones: ((zs ?? []) as Array<{ id: string; name: string }>).map((z) => ({
          id: String(z.id),
          name: String(z.name),
        })),
      };
    },
  );

export const grantDeleteException = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      userId: string;
      zoneIds: string[];
      hours: number;
      maxDeletes: number;
      ticket?: string | null;
      justification: string;
    }) =>
      z
        .object({
          userId: z.string().uuid(),
          zoneIds: z.array(zoneIdSchema).min(1, "Escolha pelo menos uma zona.").max(100),
          hours: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(24)]),
          maxDeletes: z.number().int().min(1).max(200, "No máximo 200 exclusões."),
          ticket: z.string().trim().max(120).optional().nullable(),
          justification: z
            .string()
            .trim()
            .min(20, "A justificativa precisa ter pelo menos 20 caracteres.")
            .max(2000),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireExceptionManager(context);
    if (data.userId === context.userId)
      return { ok: false as const, error: "Você não pode liberar exceção para si mesmo." };
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const db = g.guardDb();
    const canReceive = await hasPermission(
      db,
      data.userId,
      "cloudflare-waf",
      "manage_solicitar_exclusao_dns",
    );
    if (!canReceive)
      return {
        ok: false as const,
        error: 'O usuário precisa ter a permissão "Solicitar exclusão de DNS".',
      };
    const zoneIds = [...new Set(data.zoneIds)];
    const { data: zs } = await db
      .from("cloudflare_zones")
      .select("id, name")
      .in("id", zoneIds)
      .or("status.is.null,status.neq.removed");
    const zoneMap = new Map(((zs ?? []) as any[]).map((z) => [String(z.id), String(z.name)]));
    if (zoneIds.some((id) => !zoneMap.has(id)))
      return { ok: false as const, error: "Zona não sincronizada." };
    const zoneNames = zoneIds.map((id) => zoneMap.get(id)!);
    const { data: prof } = await db
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    const userEmail: string | null = (prof as any)?.email ?? null;
    const email = await ctxEmail(context);
    // Janela anterior vencida e ainda aberta: fecha (com resumo) antes.
    await g.closeExpiredDeleteExceptions(data.userId);
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + data.hours * 3600_000);
    const ticket = data.ticket?.trim() || null;
    const { data: row, error } = await db
      .from("cloudflare_dns_delete_exceptions")
      .insert({
        user_id: data.userId,
        user_email: userEmail,
        zone_ids: zoneIds,
        zone_names: zoneNames,
        max_deletes: data.maxDeletes,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        ticket,
        justification: data.justification,
        granted_by: context.userId,
        granted_by_email: email,
      })
      .select("id")
      .single();
    if (error) {
      if (String(error.code) === "23505")
        return {
          ok: false as const,
          error: "Este usuário já tem uma janela de exceção aberta. Encerre a atual antes.",
        };
      return { ok: false as const, error: error.message };
    }
    const until = expiresAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    await Promise.all([
      ...zoneIds.map((zid, i) =>
        logCloudflareAudit({
          action: "grant_dns_exception",
          status: "success",
          zoneId: zid,
          zoneName: zoneNames[i],
          userEmail: email,
          details: {
            exception_id: row.id,
            user_email: userEmail,
            zones: zoneNames,
            hours: data.hours,
            max: data.maxDeletes,
            expires_at: expiresAt.toISOString(),
            ticket,
            justification: data.justification,
          },
          message: `Exceção de aprovação liberada para ${userEmail ?? data.userId}: ${data.hours} h, até ${data.maxDeletes} exclusões`,
        }),
      ),
      g.sendGuardAlert({
        key: "cloudflare_dns_delete_request",
        severity: "critical",
        title: "Exceção de aprovação liberada",
        zoneName: zoneNames.join(", "),
        category: "Exclusão sem aprovação liberada",
        description: `${userEmail ?? "—"} pode excluir DNS sem pedido`,
        facts: [
          { name: "Para", value: userEmail ?? "—" },
          {
            name: "Validade",
            value: `${data.hours} h (até ${until}) · até ${data.maxDeletes} exclusões`,
          },
          ...(ticket ? [{ name: "Chamado/GMUD", value: ticket }] : []),
          { name: "Justificativa", value: data.justification },
        ],
        actor: email,
        actorLabel: "Liberado por",
        vars: { conteudo: zoneNames.join(", "), justificativa: data.justification },
      }),
    ]);
    return { ok: true as const, id: String(row.id) };
  });

export const revokeDeleteException = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireExceptionManager(context);
    const g = await import("@/lib/cloudflare.guard.server");
    const closed = await g.closeDeleteException(data.id, "revoked", {
      userId: context.userId,
      email: await ctxEmail(context),
    });
    if (!closed) return { ok: false as const, error: "Esta janela já estava encerrada." };
    return { ok: true as const };
  });

// Exclusão na hora dentro da janela. Não aceita "excluir" fora dela: sem
// janela válida pra zona, devolve erro e a tela cai no pedido normal.
export const deleteWithException = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; recordId: string; reason?: string | null }) =>
    z
      .object({
        zoneId: zoneIdSchema,
        recordId: z.string().min(1).max(64),
        reason: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_solicitar_exclusao_dns",
    );
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const db = g.guardDb();
    const { data: ex } = await db
      .from("cloudflare_dns_delete_exceptions")
      .select("*")
      .eq("user_id", context.userId)
      .is("closed_at", null)
      .maybeSingle();
    if (!ex || !(ex.zone_ids as string[]).includes(data.zoneId))
      return {
        ok: false as const,
        error: "Sem janela de exceção ativa para esta zona. Use o pedido de exclusão normal.",
      };
    const email = await ctxEmail(context);
    const zName = await zoneName(data.zoneId);
    const token = await g.getCfToken();
    const cur = await g.cf(token, `/zones/${data.zoneId}/dns_records/${data.recordId}`);
    if (!cur.ok)
      return { ok: false as const, error: `Registro não encontrado na Cloudflare: ${cur.error}` };
    const snap = g.snapRecord(cur.json.result);

    // Reserva uma exclusão da janela (atômico; nega se venceu/acabou o saldo).
    const { data: n, error: consErr } = await db.rpc("cloudflare_dns_exception_consume", {
      _id: ex.id,
      _user_id: context.userId,
      _zone_id: data.zoneId,
    });
    if (consErr) return { ok: false as const, error: consErr.message };
    const num = typeof n === "number" ? n : null;
    if (num === null) {
      await g.closeExpiredDeleteExceptions(context.userId);
      return {
        ok: false as const,
        error: "A janela de exceção venceu ou o limite acabou. Use o pedido de exclusão normal.",
      };
    }
    const refund = () => db.rpc("cloudflare_dns_exception_refund", { _id: ex.id });

    const snapshotId = await g.saveSnapshot({
      zoneId: data.zoneId,
      zoneName: zName,
      kind: "pre_delete",
      records: [snap],
      createdBy: context.userId,
    });
    const reason = data.reason?.trim() || null;
    const justification = `Exceção de aprovação (liberada por ${ex.granted_by_email ?? "—"}${ex.ticket ? ` · ${ex.ticket}` : ""}): ${reason ?? ex.justification}`;
    // Registra como pedido já aprovado ANTES da chamada: o monitor casa a
    // exclusão com ele pelo decided_at (igual ao fluxo normal).
    const decidedAt = new Date().toISOString();
    const { data: req, error: reqErr } = await db
      .from("cloudflare_dns_delete_requests")
      .insert({
        zone_id: data.zoneId,
        zone_name: zName,
        record_id: data.recordId,
        record_snapshot: snap,
        justification,
        status: "approved",
        requested_by: context.userId,
        requested_by_email: email,
        decided_by: context.userId,
        decided_by_email: email,
        decided_at: decidedAt,
        exception_id: ex.id,
      })
      .select("id")
      .single();
    if (reqErr) {
      await refund();
      return { ok: false as const, error: reqErr.message };
    }
    await linkRequestSnapshot(db, req.id, snapshotId);
    const del = await g.cf(token, `/zones/${data.zoneId}/dns_records/${data.recordId}`, {
      method: "DELETE",
    });
    const desc = `${snap.type} ${snap.name}`;
    if (!del.ok) {
      await Promise.all([
        refund(),
        db
          .from("cloudflare_dns_delete_requests")
          .update({ status: "failed", error: del.error })
          .eq("id", req.id),
        logCloudflareAudit({
          action: "delete_dns_exception",
          status: "error",
          zoneId: data.zoneId,
          zoneName: zName,
          userEmail: email,
          details: { exception_id: ex.id, type: snap.type, name: snap.name },
          message: del.error,
        }),
      ]);
      return { ok: false as const, error: `A Cloudflare recusou a exclusão: ${del.error}` };
    }
    await db.from("cloudflare_dns_records").delete().eq("id", data.recordId);
    // Pedido normal pendente pro mesmo registro perde o sentido.
    await db
      .from("cloudflare_dns_delete_requests")
      .update({
        status: "cancelled",
        decided_by: context.userId,
        decided_by_email: email,
        decided_at: decidedAt,
        decision_reason: "Registro excluído por janela de exceção.",
      })
      .eq("zone_id", data.zoneId)
      .eq("record_id", data.recordId)
      .eq("status", "pending");
    await Promise.all([
      logCloudflareAudit({
        action: "delete_dns_exception",
        status: "success",
        zoneId: data.zoneId,
        zoneName: zName,
        userEmail: email,
        details: {
          exception_id: ex.id,
          request_id: req.id,
          type: snap.type,
          name: snap.name,
          content: snap.content,
          proxied: snap.proxied,
          ttl: snap.ttl,
          reason,
          granted_by: ex.granted_by_email,
          ticket: ex.ticket,
          used: num,
          max: ex.max_deletes,
        },
        message: `${desc} excluído em ${zName} por exceção (${num} de ${ex.max_deletes})`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_dns_delete_request",
        severity: "warning",
        title: "Registro DNS excluído (por exceção)",
        zoneName: zName,
        category: "Excluído por exceção",
        description: desc,
        facts: [
          { name: "Apontava para", value: snap.content },
          { name: "Exclusão", value: `${num} de ${ex.max_deletes} da janela` },
          {
            name: "Janela",
            value: `liberada por ${ex.granted_by_email ?? "—"}${ex.ticket ? ` · ${ex.ticket}` : ""}`,
          },
          ...(reason ? [{ name: "Motivo", value: reason }] : []),
        ],
        actor: email,
        actorLabel: "Excluído por",
        vars: { conteudo: snap.content, justificativa: justification },
      }),
    ]);
    if (num >= ex.max_deletes) await g.closeDeleteException(ex.id, "limit");
    return { ok: true as const, used: num, max: ex.max_deletes as number };
  });

// ─── Alertas de auditoria ───────────────────────────────────────────────────
export type AuditAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  rule: string;
  title: string;
  zoneName: string | null;
  details: Record<string, any> | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
};

export const listAuditAlerts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; days?: number }) =>
    z
      .object({ zoneId: zoneIdSchema, days: z.number().int().min(1).max(90).default(7) })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      alerts: AuditAlert[];
      watch: {
        lastOkAt: string | null;
        lastRunAt: string | null;
        lastError: string | null;
        ignoredToday: number;
      };
    }> => {
      await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_history");
      const { guardDb } = await import("@/lib/cloudflare.guard.server");
      const db = guardDb();
      const since = new Date(Date.now() - data.days * 86400_000).toISOString();
      const { data: rows, error } = await db
        .from("cloudflare_audit_alerts")
        .select("*")
        .or(`zone_id.eq.${data.zoneId},zone_id.is.null`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      const { data: st } = await db
        .from("cloudflare_audit_watch_state")
        .select("last_ok_at, last_run_at, last_error")
        .order("last_run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Alterações automáticas de certificado ignoradas hoje (todas as contas).
      const today = new Date().toISOString().slice(0, 10);
      const { data: ign } = await db
        .from("cloudflare_audit_watch_state")
        .select("ignored_count")
        .eq("ignored_day", today);
      const ignoredToday = ((ign ?? []) as any[]).reduce(
        (s, r) => s + Number(r.ignored_count ?? 0),
        0,
      );
      return {
        alerts: (rows ?? []).map((r: any) => ({
          id: r.id,
          severity: r.severity,
          rule: r.rule,
          title: r.title,
          zoneName: r.zone_name,
          details: r.details,
          createdAt: r.created_at,
          acknowledgedAt: r.acknowledged_at,
          acknowledgedByEmail: r.acknowledged_by_email,
        })),
        watch: {
          lastOkAt: st?.last_ok_at ?? null,
          lastRunAt: st?.last_run_at ?? null,
          lastError: st?.last_error ?? null,
          ignoredToday,
        },
      };
    },
  );

export const acknowledgeAuditAlert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_history");
    await requireGlobalAdminRole(context.supabase, context.userId);
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const { error } = await guardDb()
      .from("cloudflare_audit_alerts")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: context.userId,
        acknowledged_by_email: await ctxEmail(context),
      })
      .eq("id", data.id)
      .is("acknowledged_at", null);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// Remove, direto do alerta, um registro que o monitor viu ser criado fora do
// sistema. Não passa pelo pedido com quatro olhos (num ataque seria lento),
// mas é destrutivo: permissão de aprovar exclusão + perfil admin/super admin,
// justificativa, nome digitado, cópia antes e log/alerta. Só aceita registros
// listados no próprio alerta.
export const removeRecordFromAlert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { alertId: string; recordId: string; justification: string; confirmName: string }) =>
      z
        .object({
          alertId: z.string().uuid(),
          recordId: z.string().min(1).max(64),
          justification: z
            .string()
            .trim()
            .min(20, "A justificativa precisa ter pelo menos 20 caracteres.")
            .max(2000),
          confirmName: z.string().trim().min(1).max(255),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_aprovar_exclusao_dns",
    );
    await requireGlobalAdminRole(context.supabase, context.userId);
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit, resolveZoneName } = await import("@/lib/cloudflare.server");
    const db = g.guardDb();
    const { data: alert } = await db
      .from("cloudflare_audit_alerts")
      .select("*")
      .eq("id", data.alertId)
      .maybeSingle();
    if (!alert || !g.CREATE_ALERT_RULES.includes(alert.rule))
      return { ok: false as const, error: "Alerta não encontrado ou não é de criação de DNS." };
    const events: any[] = Array.isArray(alert.details?.events) ? alert.details.events : [];
    const ev = events.find((e) => e.record_id === data.recordId);
    if (!ev) return { ok: false as const, error: "Este registro não faz parte do alerta." };
    if (ev.removed_at) return { ok: false as const, error: "Este registro já foi removido." };
    const zoneId = String(ev.zone_id ?? "");
    if (!/^[a-zA-Z0-9]{1,64}$/.test(zoneId))
      return { ok: false as const, error: "Zona do registro não identificada no alerta." };
    const zName = (await resolveZoneName(zoneId)) ?? alert.zone_name ?? zoneId;

    const token = await g.getCfToken();
    const cur = await g.cf(token, `/zones/${zoneId}/dns_records/${data.recordId}`);
    if (!cur.ok)
      return {
        ok: false as const,
        error: `O registro já não existe na Cloudflare: ${cur.error}`,
      };
    const snap = g.snapRecord(cur.json.result);
    if (data.confirmName.toLowerCase() !== snap.name.toLowerCase())
      return { ok: false as const, error: "O nome digitado não confere com o registro." };
    const email = await ctxEmail(context);
    await g.enforceRateLimit(context.userId, "approve_dns_delete", email);
    await g.saveSnapshot({
      zoneId,
      zoneName: zName,
      kind: "pre_delete",
      records: [snap],
      createdBy: context.userId,
    });
    const del = await g.cf(token, `/zones/${zoneId}/dns_records/${data.recordId}`, {
      method: "DELETE",
    });
    const desc = `${snap.type} ${snap.name}`;
    const details = {
      alert_id: alert.id,
      record_id: data.recordId,
      type: snap.type,
      name: snap.name,
      content: snap.content,
      proxied: snap.proxied,
      ttl: snap.ttl,
      justification: data.justification,
      created_by_actor: ev.actor ?? null,
    };
    if (!del.ok) {
      await logCloudflareAudit({
        action: "remove_rogue_dns",
        status: "error",
        zoneId,
        zoneName: zName,
        userEmail: email,
        details,
        message: del.error,
      });
      return { ok: false as const, error: `A Cloudflare recusou a exclusão: ${del.error}` };
    }
    await db.from("cloudflare_dns_records").delete().eq("id", data.recordId);
    const now = new Date().toISOString();
    await db
      .from("cloudflare_audit_alerts")
      .update({
        details: {
          ...alert.details,
          events: events.map((e) =>
            e.record_id === data.recordId ? { ...e, removed_at: now, removed_by: email } : e,
          ),
        },
        ...(alert.acknowledged_at
          ? {}
          : {
              acknowledged_at: now,
              acknowledged_by: context.userId,
              acknowledged_by_email: email,
            }),
      })
      .eq("id", alert.id);
    await Promise.all([
      logCloudflareAudit({
        action: "remove_rogue_dns",
        status: "success",
        zoneId,
        zoneName: zName,
        userEmail: email,
        details,
        message: `${desc} criado fora do fluxo removido em ${zName}`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_audit_alert",
        severity: "critical",
        title: "Registro DNS criado fora do fluxo removido",
        zoneName: zName,
        category: "Removido",
        description: desc,
        facts: [
          { name: "Apontava para", value: snap.content },
          { name: "Criado por", value: String(ev.actor ?? "—") },
          { name: "Justificativa", value: data.justification },
        ],
        actor: email,
        actorLabel: "Removido por",
        vars: { conteudo: snap.content, justificativa: data.justification },
      }),
    ]);
    return { ok: true as const };
  });

export const getGuardSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_history");
    const { getGuardSettings } = await import("@/lib/cloudflare.guard.server");
    return getGuardSettings();
  });

export const saveGuardSettings = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      deleteWindowMin: number;
      deleteThreshold: number;
      changeWindowMin: number;
      changeThreshold: number;
      createWindowMin: number;
      createThreshold: number;
      createOutsideFlow: boolean;
      criticalHosts: string[];
    }) =>
      z
        .object({
          deleteWindowMin: z.number().int().min(1).max(1440),
          deleteThreshold: z.number().int().min(1).max(1000),
          changeWindowMin: z.number().int().min(1).max(1440),
          changeThreshold: z.number().int().min(1).max(1000),
          createWindowMin: z.number().int().min(1).max(1440),
          createThreshold: z.number().int().min(1).max(1000),
          createOutsideFlow: z.boolean(),
          criticalHosts: z.array(z.string().trim().min(1).max(255)).max(200),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGlobalAdminRole(context.supabase, context.userId);
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const { error } = await guardDb()
      .from("cloudflare_guard_settings")
      .upsert({
        id: 1,
        delete_window_min: data.deleteWindowMin,
        delete_threshold: data.deleteThreshold,
        change_window_min: data.changeWindowMin,
        change_threshold: data.changeThreshold,
        create_window_min: data.createWindowMin,
        create_threshold: data.createThreshold,
        create_outside_flow: data.createOutsideFlow,
        critical_hosts: data.criticalHosts.map((h) => h.toLowerCase()),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) return { ok: false as const, error: error.message };
    await logCloudflareAudit({
      action: "update_rule",
      status: "success",
      userEmail: await ctxEmail(context),
      details: {
        category: "Alertas de auditoria",
        description: "Configuração do monitor",
        ...data,
      },
      message: "Configuração dos alertas de auditoria alterada",
    });
    return { ok: true as const };
  });

// ─── Backups de DNS ─────────────────────────────────────────────────────────
// Pedido de exclusão por trás de uma cópia "antes da exclusão".
export type SnapshotContext = {
  requestId: string;
  byException: boolean;
  requestedByEmail: string | null;
  decidedByEmail: string | null;
  justification: string | null;
  // "id": ligado pela coluna snapshot_id; "time": achado pelo horário
  // (exclusões de antes da migration 20261105130000).
  linked: "id" | "time";
  restoredAt: string | null;
  restoredByEmail: string | null;
};

export type SnapshotMeta = {
  id: string;
  kind: string;
  takenAt: string;
  recordCount: number;
  hasFile: boolean;
  // Só nas cópias "antes da exclusão" (kind pre_delete).
  record: { type: string; name: string } | null;
  context: SnapshotContext | null;
};

// Janela pra achar pedido ↔ cópia sem a coluna snapshot_id: a cópia é gravada
// logo antes de marcar o pedido como aprovado e apagar.
const LINK_BEFORE_MS = 60_000;
const LINK_AFTER_MS = 10 * 60_000;

function requestMatchesSnapshot(req: any, snap: { id: string; taken_at: string; records: any[] }) {
  if (req.snapshot_id) return req.snapshot_id === snap.id ? "id" : null;
  const recId = snap.records?.[0]?.id;
  if (!recId || req.record_id !== recId || !req.decided_at) return null;
  const d = new Date(req.decided_at).getTime() - new Date(snap.taken_at).getTime();
  return d >= -LINK_BEFORE_MS && d <= LINK_AFTER_MS ? "time" : null;
}

function toContext(req: any, linked: "id" | "time"): SnapshotContext {
  return {
    requestId: req.id,
    byException: !!req.exception_id,
    requestedByEmail: req.requested_by_email ?? null,
    decidedByEmail: req.decided_by_email ?? null,
    justification: req.justification ?? null,
    linked,
    restoredAt: req.restored_at ?? null,
    restoredByEmail: req.restored_by_email ?? null,
  };
}

// Cópia "antes da exclusão" de um pedido aprovado: pela coluna snapshot_id ou,
// sem ela, pela zona + registro + horário da exclusão.
async function findSnapshotForRequest(
  db: any,
  req: any,
): Promise<{ snap: any; linked: "id" | "time" } | null> {
  if (req.snapshot_id) {
    const { data: s } = await db
      .from("cloudflare_dns_snapshots")
      .select("id, kind, zone_id, zone_name, taken_at, records")
      .eq("id", req.snapshot_id)
      .maybeSingle();
    if (s) return { snap: s, linked: "id" };
  }
  if (!req.decided_at) return null;
  const at = new Date(req.decided_at).getTime();
  const { data: rows } = await db
    .from("cloudflare_dns_snapshots")
    .select("id, kind, zone_id, zone_name, taken_at, records")
    .eq("zone_id", req.zone_id)
    .eq("kind", "pre_delete")
    .gte("taken_at", new Date(at - LINK_AFTER_MS).toISOString())
    .lte("taken_at", new Date(at + LINK_BEFORE_MS).toISOString())
    .order("taken_at", { ascending: false })
    .limit(50);
  const hit = ((rows ?? []) as any[])
    .filter((s) => requestMatchesSnapshot({ ...req, snapshot_id: null }, s))
    .sort(
      (a, b) =>
        Math.abs(new Date(a.taken_at).getTime() - at) -
        Math.abs(new Date(b.taken_at).getTime() - at),
    )[0];
  return hit ? { snap: hit, linked: "time" } : null;
}

export const listDnsSnapshots = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) => z.object({ zoneId: zoneIdSchema }).parse(input))
  .handler(async ({ data, context }): Promise<SnapshotMeta[]> => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_backups_dns",
    );
    const { guardDb } = await import("@/lib/cloudflare.guard.server");
    const db = guardDb();
    const [full, pre, reqs] = await Promise.all([
      db
        .from("cloudflare_dns_snapshots")
        .select("id, kind, taken_at, record_count, storage_path")
        .eq("zone_id", data.zoneId)
        .in("kind", ["daily", "manual"])
        .order("taken_at", { ascending: false })
        .limit(120),
      // Cópias "antes da exclusão" têm 1 registro: dá pra trazer o conteúdo.
      db
        .from("cloudflare_dns_snapshots")
        .select("id, kind, taken_at, record_count, storage_path, records")
        .eq("zone_id", data.zoneId)
        .eq("kind", "pre_delete")
        .order("taken_at", { ascending: false })
        .limit(200),
      db
        .from("cloudflare_dns_delete_requests")
        .select("*")
        .eq("zone_id", data.zoneId)
        .eq("status", "approved")
        .order("decided_at", { ascending: false })
        .limit(1000),
    ]);
    if (full.error) throw new Error(full.error.message);
    if (pre.error) throw new Error(pre.error.message);
    const requests = (reqs.data ?? []) as any[];
    const out: SnapshotMeta[] = (full.data ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind,
      takenAt: r.taken_at,
      recordCount: r.record_count,
      hasFile: !!r.storage_path,
      record: null,
      context: null,
    }));
    for (const s of (pre.data ?? []) as any[]) {
      const rec = Array.isArray(s.records) ? s.records[0] : null;
      let ctx: SnapshotContext | null = null;
      for (const q of requests) {
        const how = requestMatchesSnapshot(q, s);
        if (how) {
          ctx = toContext(q, how);
          if (how === "id") break;
        }
      }
      out.push({
        id: s.id,
        kind: s.kind,
        takenAt: s.taken_at,
        recordCount: s.record_count,
        hasFile: !!s.storage_path,
        record: rec ? { type: String(rec.type), name: String(rec.name) } : null,
        context: ctx,
      });
    }
    return out.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  });

export type SnapRec = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean | null;
  ttl: number | null;
};
export type SnapshotDiffRow = {
  kind: "removed" | "changed" | "added";
  id: string;
  before: SnapRec | null;
  now: SnapRec | null;
  // changed: o id sumiu e alguém criou de novo (mesmo tipo + nome, id novo).
  // Restaurar substitui o valor desse registro em vez de criar um segundo.
  recreated?: boolean;
  // removed: há mais de um registro de mesmo tipo + nome criado depois da
  // cópia; a restauração não escolhe sozinha.
  ambiguous?: boolean;
};

const pickRec = (r: any): SnapRec => ({
  id: r.id,
  type: r.type,
  name: r.name,
  content: r.content,
  proxied: r.proxied,
  ttl: r.ttl,
});

// Diferenças entre uma cópia e a Cloudflare agora. Cópia "antes da exclusão"
// compara só o registro dela (sem listar a zona inteira como "novo depois").
function buildSnapshotDiff(
  g: typeof import("@/lib/cloudflare.guard.server"),
  snap: { kind: string; taken_at: string; records: any[] },
  current: ReturnType<typeof g.snapRecord>[],
): SnapshotDiffRow[] {
  const recs = (snap.records ?? []) as ReturnType<typeof g.snapRecord>[];
  const plan = g.planSnapshot(recs, current, snap.taken_at);
  const claimed = new Set<string>();
  const rows: SnapshotDiffRow[] = [];
  for (const r of recs) {
    const m = plan.get(r.id)!;
    if (m.mode === "same") continue;
    if (m.mode === "changed")
      rows.push({ kind: "changed", id: r.id, before: pickRec(r), now: pickRec(m.target) });
    else if (m.mode === "recreated") {
      claimed.add(m.target.id);
      if (!m.equal)
        rows.push({
          kind: "changed",
          id: r.id,
          before: pickRec(r),
          now: pickRec(m.target),
          recreated: true,
        });
    } else
      rows.push({
        kind: "removed",
        id: r.id,
        before: pickRec(r),
        now: null,
        ambiguous: m.mode === "ambiguous",
      });
  }
  if (snap.kind !== "pre_delete") {
    const snapIds = new Set(recs.map((r) => r.id));
    for (const c of current)
      if (!snapIds.has(c.id) && !claimed.has(c.id))
        rows.push({ kind: "added", id: c.id, before: null, now: pickRec(c) });
  }
  rows.sort((a, b) => (a.before ?? a.now)!.name.localeCompare((b.before ?? b.now)!.name));
  return rows;
}

export const getSnapshotDiff = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; snapshotId: string }) =>
    z.object({ zoneId: zoneIdSchema, snapshotId: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; rows: SnapshotDiffRow[]; takenAt: string } | { ok: false; error: string }
    > => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_backups_dns",
      );
      const g = await import("@/lib/cloudflare.guard.server");
      const { data: snap } = await g
        .guardDb()
        .from("cloudflare_dns_snapshots")
        .select("kind, records, taken_at, zone_id")
        .eq("id", data.snapshotId)
        .maybeSingle();
      if (!snap || snap.zone_id !== data.zoneId)
        return { ok: false, error: "Backup não encontrado nesta zona." };
      const token = await g.getCfToken();
      let current: ReturnType<typeof g.snapRecord>[];
      try {
        current = await g.listZoneRecords(token, data.zoneId);
      } catch (e: any) {
        return { ok: false, error: e.message ?? String(e) };
      }
      return { ok: true, rows: buildSnapshotDiff(g, snap, current), takenAt: snap.taken_at };
    },
  );

export const getSnapshotDownload = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { snapshotId: string }) =>
    z.object({ snapshotId: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; url: string | null; records: any[] | null; fileName: string }
      | { ok: false; error: string }
    > => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_backups_dns",
      );
      const { guardDb } = await import("@/lib/cloudflare.guard.server");
      const db = guardDb();
      const { data: s } = await db
        .from("cloudflare_dns_snapshots")
        .select("storage_path, records, zone_name, taken_at")
        .eq("id", data.snapshotId)
        .maybeSingle();
      if (!s) return { ok: false, error: "Backup não encontrado." };
      const base = `${s.zone_name ?? "zona"}-${String(s.taken_at).slice(0, 10)}`;
      if (s.storage_path) {
        const { data: signed } = await db.storage
          .from("dns-backups")
          .createSignedUrl(s.storage_path, 60);
        if (signed?.signedUrl)
          return { ok: true, url: signed.signedUrl, records: null, fileName: `${base}.zone` };
      }
      return { ok: true, url: null, records: s.records, fileName: `${base}.json` };
    },
  );

export const runDnsBackupNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) => z.object({ zoneId: zoneIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_backups_dns",
    );
    const g = await import("@/lib/cloudflare.guard.server");
    const name = await zoneName(data.zoneId);
    try {
      const r = await g.backupZone(
        await g.getCfToken(),
        { id: data.zoneId, name },
        "manual",
        context.userId,
      );
      return { ok: true as const, count: r.count };
    } catch (e: any) {
      return { ok: false as const, error: e.message ?? String(e) };
    }
  });

export const restoreDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; snapshotId: string; recordIds: string[] }) =>
    z
      .object({
        zoneId: zoneIdSchema,
        snapshotId: z.string().uuid(),
        recordIds: z.array(z.string().min(1).max(64)).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_backups_dns",
    );
    await requireGlobalAdminRole(context.supabase, context.userId);
    return restoreFromSnapshot(context, data);
  });

// Núcleo da restauração (tela de Backups e botão no pedido / Histórico).
// Registro que sumiu e foi criado de novo (id novo) é SUBSTITUÍDO, nunca
// duplicado; com mais de um candidato a restauração para e explica.
async function restoreFromSnapshot(
  context: any,
  args: { zoneId: string; snapshotId: string; recordIds: string[]; requestId?: string | null },
) {
  const g = await import("@/lib/cloudflare.guard.server");
  const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
  const db = g.guardDb();
  const { data: snap } = await db
    .from("cloudflare_dns_snapshots")
    .select("id, kind, records, taken_at, zone_id, zone_name")
    .eq("id", args.snapshotId)
    .maybeSingle();
  if (!snap || snap.zone_id !== args.zoneId)
    return { ok: false as const, error: "Backup não encontrado nesta zona." };
  const email = await ctxEmail(context);
  const token = await g.getCfToken();
  const current = await g.listZoneRecords(token, args.zoneId);
  const recs = (snap.records ?? []) as ReturnType<typeof g.snapRecord>[];
  const plan = g.planSnapshot(recs, current, snap.taken_at);
  const wanted = recs.filter((r) => args.recordIds.includes(r.id));

  const failed: string[] = [];
  const todo: { rec: (typeof recs)[number]; targetId: string | null; replaced: boolean }[] = [];
  for (const r of wanted) {
    const m = plan.get(r.id)!;
    if (m.mode === "same" || (m.mode === "recreated" && m.equal)) continue;
    if (m.mode === "ambiguous") {
      failed.push(
        `${r.type} ${r.name}: há mais de um registro com esse tipo e nome criado depois da cópia; confira no painel da Cloudflare qual deve ficar`,
      );
      continue;
    }
    todo.push({
      rec: r,
      targetId: m.mode === "gone" ? null : m.target.id,
      replaced: m.mode === "recreated",
    });
  }
  if (todo.length === 0) return { ok: true as const, restored: 0, failed };
  await g.enforceRateLimit(context.userId, "dns_restore", email, todo.length);
  await g.saveSnapshot({
    zoneId: args.zoneId,
    zoneName: snap.zone_name,
    kind: "pre_restore",
    records: current,
    createdBy: context.userId,
  });

  let restored = 0;
  const done: string[] = [];
  for (const { rec: r, targetId, replaced } of todo) {
    const body: Record<string, unknown> = { type: r.type, name: r.name, ttl: r.ttl ?? 1 };
    if (r.data) body.data = r.data;
    else body.content = r.content;
    if (r.proxied != null) body.proxied = r.proxied;
    if (r.priority != null) body.priority = r.priority;
    if (r.comment) body.comment = r.comment;
    if (r.tags) body.tags = r.tags;
    const res = await g.cf(
      token,
      targetId
        ? `/zones/${args.zoneId}/dns_records/${targetId}`
        : `/zones/${args.zoneId}/dns_records`,
      { method: targetId ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    if (res.ok) {
      restored++;
      done.push(`${r.type} ${r.name}${replaced ? " (substituiu o recriado)" : ""}`);
    } else failed.push(`${r.type} ${r.name}: ${res.error}`);
  }

  // Cópia "antes da exclusão": marca o pedido como restaurado (tolerante sem
  // a migration 20261105130000).
  let requestId = args.requestId ?? null;
  if (restored > 0 && snap.kind === "pre_delete") {
    if (!requestId) {
      const { data: reqs } = await db
        .from("cloudflare_dns_delete_requests")
        .select("*")
        .eq("zone_id", args.zoneId)
        .eq("record_id", recs[0]?.id ?? "")
        .eq("status", "approved");
      requestId = ((reqs ?? []) as any[]).find((q) => requestMatchesSnapshot(q, snap))?.id ?? null;
    }
    if (requestId) {
      const { error } = await db
        .from("cloudflare_dns_delete_requests")
        .update({
          restored_at: new Date().toISOString(),
          restored_by: context.userId,
          restored_by_email: email,
        })
        .eq("id", requestId);
      if (error) console.warn("[dns-restore] restored_at não gravado:", error.message);
    }
  }

  const zName = snap.zone_name ?? args.zoneId;
  const from =
    snap.kind === "pre_delete"
      ? `da cópia feita antes da exclusão (${new Date(snap.taken_at).toLocaleString("pt-BR")})`
      : `do backup de ${new Date(snap.taken_at).toLocaleString("pt-BR")}`;
  await Promise.all([
    logCloudflareAudit({
      action: "restore_dns",
      status: failed.length ? "error" : "success",
      zoneId: args.zoneId,
      zoneName: zName,
      userEmail: email,
      details: {
        snapshot_id: args.snapshotId,
        snapshot_kind: snap.kind,
        snapshot_at: snap.taken_at,
        request_id: requestId,
        records: done,
        // O monitor do log de auditoria reconhece a criação/edição como do
        // sistema por details->>name (madeInBSecurity); sem isso a
        // restauração virava alerta de "criação fora do fluxo".
        name: todo.map((t) => t.rec.name).join(" "),
        failed,
      },
      message: `${restored} registro(s) restaurado(s) ${from}${failed.length ? ` · ${failed.length} falha(s)` : ""}`,
    }),
    g.raiseAuditAlert({
      severity: "info",
      rule: "dns_restored",
      title: `${restored} registro(s) DNS restaurado(s) ${snap.kind === "pre_delete" ? "da cópia de antes da exclusão" : "do backup"}`,
      dedupKey: `restore:${args.snapshotId}:${Date.now()}`,
      zoneId: args.zoneId,
      zoneName: zName,
      details: { by: email, records: done, failed, request_id: requestId },
      facts: [
        { name: "Registros", value: done.slice(0, 8).join("; ") || "—" },
        {
          name: snap.kind === "pre_delete" ? "Cópia de" : "Backup de",
          value: new Date(snap.taken_at).toLocaleString("pt-BR"),
        },
        { name: "Por", value: email ?? "—" },
        ...(failed.length ? [{ name: "Falhas", value: failed.slice(0, 3).join("; ") }] : []),
      ],
    }),
  ]);
  return { ok: true as const, restored, failed };
}

// ─── Restaurar direto do pedido / Histórico ─────────────────────────────────
export type RequestRestoreInfo =
  | {
      ok: true;
      zoneId: string;
      snapshotId: string | null;
      takenAt: string | null;
      linked: "id" | "time" | null;
      // no_copy: não achou a cópia; same: já está igual na Cloudflare.
      state: "no_copy" | "same" | "changed" | "recreated" | "ambiguous" | "gone";
      record: SnapRec;
      now: SnapRec | null;
      restoredAt: string | null;
      restoredByEmail: string | null;
    }
  | { ok: false; error: string };

async function loadApprovedRequest(db: any, requestId: string) {
  const { data: r } = await db
    .from("cloudflare_dns_delete_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!r) return { error: "Pedido não encontrado." } as const;
  if (r.status !== "approved")
    return { error: "Só dá pra restaurar um registro de pedido já excluído." } as const;
  return { r } as const;
}

export const getRequestRestoreInfo = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { requestId: string }) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RequestRestoreInfo> => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_backups_dns",
    );
    const g = await import("@/lib/cloudflare.guard.server");
    const db = g.guardDb();
    const loaded = await loadApprovedRequest(db, data.requestId);
    if ("error" in loaded) return { ok: false, error: loaded.error as string };
    const r = loaded.r;
    const base = {
      ok: true as const,
      zoneId: r.zone_id as string,
      record: pickRec({ id: r.record_id, ...(r.record_snapshot ?? {}) }),
      restoredAt: (r.restored_at ?? null) as string | null,
      restoredByEmail: (r.restored_by_email ?? null) as string | null,
    };
    const found = await findSnapshotForRequest(db, r);
    if (!found)
      return { ...base, snapshotId: null, takenAt: null, linked: null, state: "no_copy", now: null };
    let current: ReturnType<typeof g.snapRecord>[];
    try {
      current = await g.listZoneRecords(await g.getCfToken(), r.zone_id);
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
    const rec = (found.snap.records ?? [])[0];
    const m = g.planSnapshot([rec], current, found.snap.taken_at).get(rec.id)!;
    const state =
      m.mode === "recreated" ? (m.equal ? "same" : "recreated") : m.mode;
    return {
      ...base,
      record: pickRec(rec),
      snapshotId: found.snap.id,
      takenAt: found.snap.taken_at,
      linked: found.linked,
      state,
      now:
        m.mode === "same" || m.mode === "changed" || m.mode === "recreated"
          ? pickRec(m.target)
          : null,
    };
  });

export const restoreDeletedRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { requestId: string }) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_backups_dns",
    );
    await requireGlobalAdminRole(context.supabase, context.userId);
    const g = await import("@/lib/cloudflare.guard.server");
    const db = g.guardDb();
    const loaded = await loadApprovedRequest(db, data.requestId);
    if ("error" in loaded) return { ok: false as const, error: loaded.error as string };
    const r = loaded.r;
    const found = await findSnapshotForRequest(db, r);
    if (!found)
      return {
        ok: false as const,
        error:
          "Não achei a cópia feita antes desta exclusão. Use Ações › Backups de DNS e escolha o backup diário anterior.",
      };
    const recId = String((found.snap.records ?? [])[0]?.id ?? r.record_id);
    return restoreFromSnapshot(context, {
      zoneId: r.zone_id,
      snapshotId: found.snap.id,
      recordIds: [recId],
      requestId: r.id,
    });
  });

// ─── Importar registros DNS (arquivo de zona BIND) ──────────────────────────
// Só adiciona (a Cloudflare ignora o que já existe). Sem aprovação de outra
// pessoa (decisão do usuário), mas: permissão própria + perfil admin/super
// admin, justificativa, digitar a zona, limite por hora, cópia completa da
// zona antes e histórico/alerta com a lista. O monitor do log de auditoria
// reconhece o import (audit_logs import_dns) e não acusa "fora do fluxo".
const IMPORT_MAX_BYTES = 256 * 1024;

export type ImportPreviewRow = {
  type: string;
  name: string;
  content: string;
  ttl: number | null;
  priority: number | null;
  // outside = o nome não pertence à zona (arquivo de outro domínio).
  status: "new" | "exists" | "outside";
  sensitive: string | null;
};

// O registro pertence à zona? (raiz ou subdomínio dela.)
function inZone(name: string, zone: string) {
  const n = name.toLowerCase();
  const z = zone.toLowerCase();
  return n === z || n.endsWith(`.${z}`);
}

export const previewDnsImport = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; fileText: string }) =>
    z
      .object({
        zoneId: zoneIdSchema,
        fileText: z.string().min(1, "Arquivo vazio.").max(IMPORT_MAX_BYTES, "Arquivo maior que 256 KB."),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; rows: ImportPreviewRow[]; skipped: string[]; tooMany: boolean }
      | { ok: false; error: string }
    > => {
      await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_importar_dns");
      await requireGlobalAdminRole(context.supabase, context.userId);
      const g = await import("@/lib/cloudflare.guard.server");
      const zName = await zoneName(data.zoneId);
      const { records, skipped } = g.parseBindZone(data.fileText, zName);
      if (!records.length)
        return { ok: false, error: "Nenhum registro válido no arquivo (formato BIND esperado)." };
      let current: Awaited<ReturnType<typeof g.listZoneRecords>>;
      try {
        current = await g.listZoneRecords(await g.getCfToken(), data.zoneId);
      } catch (e: any) {
        return { ok: false, error: `Falha ao ler os registros atuais: ${e.message ?? e}` };
      }
      const settings = await g.getGuardSettings();
      const crit = settings.critical_hosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
      const rows: ImportPreviewRow[] = records.map((r) => {
        return {
          ...r,
          status: !inZone(r.name, zName)
            ? "outside"
            : current.some((c) => g.sameRecord(r, c))
              ? "exists"
              : "new",
          sensitive: inZone(r.name, zName) ? g.sensitiveRecordReason(r, zName, crit) : null,
        };
      });
      return { ok: true, rows, skipped, tooMany: records.length > g.IMPORT_MAX_RECORDS };
    },
  );

export const importDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      fileText: string;
      proxied: boolean;
      justification: string;
      confirmName: string;
    }) =>
      z
        .object({
          zoneId: zoneIdSchema,
          fileText: z.string().min(1).max(IMPORT_MAX_BYTES),
          proxied: z.boolean(),
          justification: z
            .string()
            .trim()
            .min(20, "A justificativa precisa ter pelo menos 20 caracteres.")
            .max(2000),
          confirmName: z.string().trim().min(1).max(255),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_importar_dns");
    // Mudança em massa: perfil global admin/super admin além da permissão.
    await requireGlobalAdminRole(context.supabase, context.userId);
    const g = await import("@/lib/cloudflare.guard.server");
    const { logCloudflareAudit } = await import("@/lib/cloudflare.server");
    const zName = await zoneName(data.zoneId);
    if (data.confirmName.toLowerCase() !== zName.toLowerCase())
      return { ok: false as const, error: "O nome digitado não confere com a zona." };
    const { records } = g.parseBindZone(data.fileText, zName);
    if (!records.length)
      return { ok: false as const, error: "Nenhum registro válido no arquivo (formato BIND esperado)." };
    if (records.length > g.IMPORT_MAX_RECORDS)
      return {
        ok: false as const,
        error: `O arquivo tem ${records.length} registros; o máximo por import é ${g.IMPORT_MAX_RECORDS}.`,
      };
    const outside = records.filter((r) => !inZone(r.name, zName));
    if (outside.length)
      return {
        ok: false as const,
        error: `${outside.length} registro(s) do arquivo não pertencem a ${zName} (ex.: ${outside[0].name}). Confira se o arquivo é desta zona.`,
      };
    const email = await ctxEmail(context);
    await g.enforceRateLimit(context.userId, "dns_import", email);
    const token = await g.getCfToken();

    // Cópia completa da zona antes (restaurável em Backups de DNS).
    let snapshotId: string | null = null;
    try {
      snapshotId = (await g.backupZone(token, { id: data.zoneId, name: zName }, "manual", context.userId)).id;
    } catch (e: any) {
      return {
        ok: false as const,
        error: `Não foi possível fazer a cópia da zona antes do import: ${e.message ?? e}`,
      };
    }

    const res = await g.cfImportZoneFile(token, data.zoneId, data.fileText, data.proxied);
    const list = records.map((r) => `${r.type} ${r.name}`);
    const details = {
      justification: data.justification,
      proxied: data.proxied,
      parsed: records.length,
      added: res.ok ? res.added : 0,
      records: list,
      snapshot_id: snapshotId,
    };
    if (!res.ok) {
      await logCloudflareAudit({
        action: "import_dns",
        status: "error",
        zoneId: data.zoneId,
        zoneName: zName,
        userEmail: email,
        details,
        message: res.error,
      });
      return { ok: false as const, error: `A Cloudflare recusou o import: ${res.error}` };
    }
    await Promise.all([
      logCloudflareAudit({
        action: "import_dns",
        status: "success",
        zoneId: data.zoneId,
        zoneName: zName,
        userEmail: email,
        details,
        message: `${res.added} registro(s) importado(s) em ${zName} (${records.length} no arquivo)`,
      }),
      g.sendGuardAlert({
        key: "cloudflare_audit_alert",
        severity: "warning",
        title: "Registros DNS importados",
        zoneName: zName,
        category: "Importação",
        description: `${res.added} registro(s) adicionado(s) a partir de um arquivo de zona`,
        facts: [
          { name: "Adicionados", value: `${res.added} de ${records.length} no arquivo` },
          {
            name: "Registros",
            value: list.slice(0, 8).join("; ") + (list.length > 8 ? ` (+${list.length - 8})` : ""),
          },
          { name: "Proxy", value: data.proxied ? "Ligado nos A/AAAA/CNAME" : "Desligado" },
          { name: "Justificativa", value: data.justification },
        ],
        actor: email,
        actorLabel: "Importado por",
        vars: { justificativa: data.justification },
      }),
    ]);
    return { ok: true as const, added: res.added, parsed: res.parsed };
  });
