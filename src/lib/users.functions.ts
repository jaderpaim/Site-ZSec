import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildUserInviteHtml } from "./email-templates.defaults";
import { logAudit } from "@/lib/audit-log.functions";
import { isExclusiveModule } from "@/lib/exclusive-modules";
import { APP_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/mailer.server";

async function targetProfileLabel(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return (data as any)?.full_name || (data as any)?.email || userId;
}

const ROLE_LABELS: Record<"admin" | "analista" | "visualizador" | "personalizado" | "super_admin", string> = {
  admin: "Administrador",
  super_admin: "Super Admin",
  analista: "Analista",
  visualizador: "Visualizador",
  personalizado: "Personalizado",
};

// Janela de tolerância: usuário é considerado "conectado" se houve heartbeat
// de atividade dentro deste intervalo (ver auth-context.tsx).
const ACTIVITY_ONLINE_WINDOW_MS = 3 * 60 * 1000;

async function assertCanManageUsers(supabase: any, userId: string) {
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  // super_admin é a hierarquia mais alta: acesso irrestrito, inclusive conceder
  // permissão de módulo/admin de módulo, convidar, excluir e atribuir o próprio
  // papel super_admin.
  if (roleRow?.role === "super_admin")
    return { isGlobalAdmin: true, canEditBasics: true, isAdminRole: false, moduleAdmins: new Set<string>() };
  // admin pode VER a tela de Gestão de Usuários e editar papel (exceto atribuir
  // super_admin), senha, departamento e método de autenticação de outros usuários
  // (canEditBasics) — e agora também pode conceder permissão granular (não "Admin
  // do módulo") em qualquer módulo NÃO exclusivo, já que ele mesmo já tem bypass
  // total nesses módulos (isAdminRole, ver setUserPermission — só vale pra quem já
  // passou pela checagem de módulo exclusivo). Convidar, excluir, ativar/desativar,
  // "Admin do módulo", permissão em módulo exclusivo e perfis de permissão
  // continuam exclusivos de super_admin.
  if (roleRow?.role === "admin")
    return { isGlobalAdmin: false, canEditBasics: true, isAdminRole: true, moduleAdmins: new Set<string>() };
  const { data: admins } = await supabase.from("module_admins").select("module_slug").eq("user_id", userId);
  const set = new Set<string>((admins ?? []).map((r: any) => r.module_slug));
  if (set.size === 0) throw new Error("Forbidden: requer super admin, admin ou admin de módulo");
  return { isGlobalAdmin: false, canEditBasics: false, isAdminRole: false, moduleAdmins: set };
}

// admin (canEditBasics) não pode alterar papel/senha/departamento de um usuário
// que já é super_admin — só super_admin mexe em outro super_admin.
async function assertTargetIsNotSuperAdmin(targetUserId: string) {
  const { data: targetRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if ((targetRole as any)?.role === "super_admin") {
    throw new Error("Forbidden: apenas super admin pode alterar outro super admin");
  }
}

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManageUsers(context.supabase, context.userId);

    const [
      { data: profiles },
      { data: roles },
      { data: admins },
      { data: perms },
      { data: departments },
      { data: profileTemplates },
      authList,
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at, department_id, last_active_at, auth_method, permission_profile_id"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("module_admins").select("user_id, module_slug"),
      supabaseAdmin.from("user_module_permissions").select("user_id, module_slug, action"),
      supabaseAdmin.from("departments").select("id, name"),
      supabaseAdmin.from("permission_profiles").select("id, name"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const roleByUser = new Map<string, string>((roles ?? []).map((r: any) => [r.user_id, r.role]));
    const departmentById = new Map<string, string>((departments ?? []).map((d: any) => [d.id, d.name]));
    const profileNameById = new Map<string, string>((profileTemplates ?? []).map((p: any) => [p.id, p.name]));
    const authByUser = new Map<string, { confirmed: boolean; last_sign_in_at: string | null; banned: boolean }>();
    for (const u of (authList?.data?.users ?? []) as any[]) {
      const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0;
      authByUser.set(u.id, {
        confirmed: Boolean(u.email_confirmed_at || u.confirmed_at),
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned: bannedUntil > Date.now(),
      });
    }
    const adminsByUser = new Map<string, string[]>();
    for (const a of admins ?? []) {
      const arr = adminsByUser.get((a as any).user_id) ?? [];
      arr.push((a as any).module_slug);
      adminsByUser.set((a as any).user_id, arr);
    }
    const permCountByUser = new Map<string, number>();
    for (const p of perms ?? []) {
      permCountByUser.set((p as any).user_id, (permCountByUser.get((p as any).user_id) ?? 0) + 1);
    }

    return {
      users: (profiles ?? [])
        .map((p: any) => {
          const a = authByUser.get(p.id);
          return {
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            created_at: p.created_at,
            department_id: p.department_id,
            department_name: p.department_id ? (departmentById.get(p.department_id) ?? null) : null,
            auth_method: ((p as any).auth_method ?? "sso") as "sso" | "email" | "ambos",
            permission_profile_id: (p as any).permission_profile_id ?? null,
            permission_profile_name: (p as any).permission_profile_id
              ? (profileNameById.get((p as any).permission_profile_id) ?? null)
              : null,
            role: roleByUser.get(p.id) ?? "visualizador",
            moduleAdmins: adminsByUser.get(p.id) ?? [],
            permissionCount: permCountByUser.get(p.id) ?? 0,
            status: a?.banned ? "disabled" : a?.confirmed ? "active" : "pending",
            last_sign_in_at: a?.last_sign_in_at ?? null,
            last_active_at: p.last_active_at ?? null,
            online: p.last_active_at
              ? Date.now() - new Date(p.last_active_at).getTime() <= ACTIVITY_ONLINE_WINDOW_MS
              : false,
          };
        })
        .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pt-BR")),
    };
  });

export const listModulePermissionsCatalog = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("module_permissions")
      .select("*")
      .order("module_slug")
      .order("sort_order");
    return { catalog: data ?? [] };
  });

// ─── Perfis de permissão ────────────────────────────────────────────────────
// Conjuntos nomeados e reutilizáveis de permissões granulares, aplicáveis
// manualmente a um usuário Personalizado (cópia única — não é um vínculo
// vivo, editar o perfil depois não afeta quem já usou).

export const listPermissionProfiles = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManageUsers(context.supabase, context.userId);
    const [{ data: profiles }, { data: items }] = await Promise.all([
      supabaseAdmin.from("permission_profiles").select("*").order("name"),
      supabaseAdmin.from("permission_profile_items").select("profile_id, module_slug, action"),
    ]);
    const itemsByProfile = new Map<string, Array<{ module_slug: string; action: string }>>();
    for (const it of items ?? []) {
      const arr = itemsByProfile.get(it.profile_id) ?? [];
      arr.push({ module_slug: it.module_slug, action: it.action });
      itemsByProfile.set(it.profile_id, arr);
    }
    return {
      profiles: (profiles ?? []).map((p: any) => ({ ...p, items: itemsByProfile.get(p.id) ?? [] })),
    };
  });

// Perfil nunca pode carregar permissão de módulo exclusivo (ex.: benchmark) —
// vale pra qualquer criador, inclusive super_admin. Módulo exclusivo só se
// concede no quadro "Permissões Exclusivas", nunca em lote via perfil.
function assertNoExclusiveModuleItems(items: Array<{ module: string; action: string }>) {
  const bad = items.find((it) => isExclusiveModule(it.module));
  if (bad) throw new Error(`Forbidden: perfil não pode incluir o módulo exclusivo "${bad.module}"`);
}

export const createPermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional().nullable(),
        items: z.array(z.object({ module: z.string().min(1).max(64), action: z.string().min(1).max(64) })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");
    assertNoExclusiveModuleItems(data.items);

    const { data: profile, error: e1 } = await supabaseAdmin
      .from("permission_profiles")
      .insert({ name: data.name, description: data.description ?? null, created_by: context.userId })
      .select()
      .single();
    if (e1) throw new Error(e1.message);

    if (data.items.length > 0) {
      const { error: e2 } = await supabaseAdmin
        .from("permission_profile_items")
        .insert(data.items.map((it) => ({ profile_id: profile.id, module_slug: it.module, action: it.action })));
      if (e2) throw new Error(e2.message);
    }

    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "create_permission_profile",
      descricao: `Criou o perfil de permissão "${data.name}" (${data.items.length} permissões)`,
      status: "success",
      detalhes: { profileId: profile.id, name: data.name, items: data.items },
    });

    return { ok: true, id: profile.id as string };
  });

export const updatePermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional().nullable(),
        items: z.array(z.object({ module: z.string().min(1).max(64), action: z.string().min(1).max(64) })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");
    assertNoExclusiveModuleItems(data.items);

    const { error: e1 } = await supabaseAdmin
      .from("permission_profiles")
      .update({ name: data.name, description: data.description ?? null })
      .eq("id", data.id);
    if (e1) throw new Error(e1.message);

    // Substitui os itens (mesmo padrão "cópia única" do resto do sistema — não
    // altera quem já aplicou este perfil antes, só o conteúdo pra próximas aplicações).
    await supabaseAdmin.from("permission_profile_items").delete().eq("profile_id", data.id);
    if (data.items.length > 0) {
      const { error: e2 } = await supabaseAdmin
        .from("permission_profile_items")
        .insert(data.items.map((it) => ({ profile_id: data.id, module_slug: it.module, action: it.action })));
      if (e2) throw new Error(e2.message);
    }

    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "update_permission_profile",
      descricao: `Editou o perfil de permissão "${data.name}" (${data.items.length} permissões)`,
      status: "success",
      detalhes: { profileId: data.id, name: data.name, items: data.items },
    });

    return { ok: true };
  });

export const deletePermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");

    const { data: profile } = await supabaseAdmin
      .from("permission_profiles")
      .select("name")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("permission_profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "delete_permission_profile",
      descricao: `Excluiu o perfil de permissão "${profile?.name ?? data.id}"`,
      status: "success",
      detalhes: { profileId: data.id },
    });

    return { ok: true };
  });

// Núcleo compartilhado entre applyPermissionProfile (usuário já existente) e o
// cadastro de um usuário Personalizado (inviteUser) — cópia única das
// permissões do perfil pro usuário-alvo; editar o perfil depois não afeta quem
// já recebeu essa cópia.
async function applyPermissionProfileCore(userId: string, profileId: string, grantedBy: string) {
  const [{ data: profile }, { data: items }] = await Promise.all([
    supabaseAdmin.from("permission_profiles").select("name").eq("id", profileId).maybeSingle(),
    supabaseAdmin.from("permission_profile_items").select("module_slug, action").eq("profile_id", profileId),
  ]);
  if (!profile) throw new Error("Perfil de permissão não encontrado");

  await supabaseAdmin.from("user_module_permissions").delete().eq("user_id", userId);
  if ((items ?? []).length > 0) {
    const { error } = await supabaseAdmin.from("user_module_permissions").insert(
      (items ?? []).map((it) => ({
        user_id: userId,
        module_slug: it.module_slug,
        action: it.action,
        granted_by: grantedBy,
      })),
    );
    if (error) throw new Error(error.message);
  }

  // Só pra exibição na tela de Usuários ("Perfil: X") — não é um vínculo
  // vivo, é só o rótulo da última cópia aplicada.
  await supabaseAdmin.from("profiles").update({ permission_profile_id: profileId }).eq("id", userId);
  return profile.name as string;
}

/** Aplica um perfil a um usuário Personalizado: cópia única — substitui as
 * permissões granulares atuais do usuário pelas do perfil. Editar o perfil
 * depois não afeta quem já recebeu essa cópia. */
export const applyPermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");

    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (targetRole?.role !== "personalizado") {
      throw new Error("Perfis de permissão só podem ser aplicados a usuários com papel Personalizado");
    }

    const profileName = await applyPermissionProfileCore(data.userId, data.profileId, context.userId);

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "apply_permission_profile",
      descricao: `Aplicou o perfil de permissão "${profileName}" a ${targetLabel}`,
      status: "success",
      detalhes: { targetUserId: data.userId, profileId: data.profileId },
    });

    return { ok: true };
  });

export const getUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageUsers(context.supabase, context.userId);
    const [{ data: admins }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("module_admins").select("module_slug").eq("user_id", data.userId),
      supabaseAdmin.from("user_module_permissions").select("module_slug, action").eq("user_id", data.userId),
    ]);
    return {
      moduleAdmins: (admins ?? []).map((r: any) => r.module_slug),
      permissions: (perms ?? []).map((r: any) => ({ module: r.module_slug, action: r.action })),
    };
  });

export const setUserPermission = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        module: z.string().min(1).max(64),
        action: z.string().min(1).max(64),
        granted: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    // Módulos exclusivos (ex.: benchmark) não aceitam o fallback de "admin do
    // módulo" — só super_admin concede/revoga, mesmo que o chamador já seja
    // module_admin daquele módulo específico.
    if (isExclusiveModule(data.module) && !auth.isGlobalAdmin) {
      throw new Error("Forbidden: módulo exclusivo — apenas super admin concede permissão");
    }
    // Passado o gate de módulo exclusivo acima, admin pode conceder permissão
    // granular em qualquer módulo (ele já tem bypass total nesses módulos).
    if (!auth.isGlobalAdmin && !auth.isAdminRole && !auth.moduleAdmins.has(data.module)) {
      throw new Error("Forbidden: você não é admin deste módulo");
    }
    let error: { message: string } | null = null;
    if (data.granted) {
      ({ error } = await supabaseAdmin.from("user_module_permissions").upsert(
        {
          user_id: data.userId,
          module_slug: data.module,
          action: data.action,
          granted_by: context.userId,
        },
        { onConflict: "user_id,module_slug,action" },
      ));
    } else {
      ({ error } = await supabaseAdmin
        .from("user_module_permissions")
        .delete()
        .eq("user_id", data.userId)
        .eq("module_slug", data.module)
        .eq("action", data.action));
    }

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: data.granted ? "grant_permission" : "revoke_permission",
      descricao: `${data.granted ? "Concedeu" : "Revogou"} a permissão "${data.action}" no módulo "${data.module}" para ${targetLabel}`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        targetUserId: data.userId,
        module: data.module,
        action: data.action,
        granted: data.granted,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Grava várias permissões de uma vez (botão "Salvar" do painel do usuário).
// Mesmas regras de setUserPermission, mas com uma única checagem de acesso e
// gravações agrupadas — uma linha de auditoria por permissão alterada.
export const setUserPermissionsBatch = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        changes: z
          .array(
            z.object({
              module: z.string().min(1).max(64),
              action: z.string().min(1).max(64),
              granted: z.boolean(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    for (const c of data.changes) {
      if (isExclusiveModule(c.module) && !auth.isGlobalAdmin) {
        throw new Error("Forbidden: módulo exclusivo — apenas super admin concede permissão");
      }
      if (!auth.isGlobalAdmin && !auth.isAdminRole && !auth.moduleAdmins.has(c.module)) {
        throw new Error(`Forbidden: você não é admin do módulo ${c.module}`);
      }
    }

    const grants = data.changes.filter((c) => c.granted);
    const revokes = data.changes.filter((c) => !c.granted);
    const errors: string[] = [];

    if (grants.length) {
      const { error } = await supabaseAdmin.from("user_module_permissions").upsert(
        grants.map((c) => ({
          user_id: data.userId,
          module_slug: c.module,
          action: c.action,
          granted_by: context.userId,
        })),
        { onConflict: "user_id,module_slug,action" },
      );
      if (error) errors.push(error.message);
    }

    // Revogações agrupadas por módulo (uma query por módulo)
    const revokeByModule = new Map<string, string[]>();
    for (const c of revokes) revokeByModule.set(c.module, [...(revokeByModule.get(c.module) ?? []), c.action]);
    for (const [module, actions] of revokeByModule) {
      const { error } = await supabaseAdmin
        .from("user_module_permissions")
        .delete()
        .eq("user_id", data.userId)
        .eq("module_slug", module)
        .in("action", actions);
      if (error) errors.push(error.message);
    }

    const targetLabel = await targetProfileLabel(data.userId);
    const failed = errors.length > 0;
    await Promise.all(
      data.changes.map((c) =>
        logAudit({
          userId: context.userId,
          modulo: "usuarios",
          acao: c.granted ? "grant_permission" : "revoke_permission",
          descricao: `${c.granted ? "Concedeu" : "Revogou"} a permissão "${c.action}" no módulo "${c.module}" para ${targetLabel}`,
          status: failed ? "error" : "success",
          mensagemErro: failed ? errors.join("; ") : null,
          detalhes: {
            targetUserId: data.userId,
            module: c.module,
            action: c.action,
            granted: c.granted,
            batch: true,
          },
        }),
      ),
    );

    if (failed) throw new Error(errors.join("; "));
    return { ok: true, count: data.changes.length };
  });

export const setModuleAdmin = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        module: z.string().min(1).max(64),
        isAdmin: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin) throw new Error("Forbidden: apenas super admin");
    let error: { message: string } | null = null;
    if (data.isAdmin) {
      ({ error } = await supabaseAdmin.from("module_admins").upsert(
        {
          user_id: data.userId,
          module_slug: data.module,
          granted_by: context.userId,
        },
        { onConflict: "user_id,module_slug" },
      ));
    } else {
      ({ error } = await supabaseAdmin
        .from("module_admins")
        .delete()
        .eq("user_id", data.userId)
        .eq("module_slug", data.module));
    }

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: data.isAdmin ? "grant_module_admin" : "revoke_module_admin",
      descricao: `${data.isAdmin ? "Tornou" : "Removeu"} ${targetLabel} ${data.isAdmin ? "administrador" : "de administrador"} do módulo "${data.module}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId, module: data.module, isAdmin: data.isAdmin },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "analista", "visualizador", "personalizado", "super_admin"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.canEditBasics) throw new Error("Forbidden: apenas super admin ou admin");
    if (!auth.isGlobalAdmin) {
      if (data.role === "super_admin") {
        throw new Error("Forbidden: apenas super admin pode atribuir o papel Super Admin");
      }
      await assertTargetIsNotSuperAdmin(data.userId);
    }
    const targetLabel = await targetProfileLabel(data.userId);

    try {
      await resetUserRole(data.userId, data.role);

      await logAudit({
        userId: context.userId,
        modulo: "usuarios",
        acao: "change_role",
        descricao: `Alterou o papel de ${targetLabel} para "${ROLE_LABELS[data.role]}"`,
        status: "success",
        detalhes: { targetUserId: data.userId, role: data.role },
      });
      return { ok: true };
    } catch (e: unknown) {
      await logAudit({
        userId: context.userId,
        modulo: "usuarios",
        acao: "change_role",
        descricao: `Falha ao alterar o papel de ${targetLabel} para "${ROLE_LABELS[data.role]}"`,
        status: "error",
        mensagemErro: e instanceof Error ? e.message : String(e),
        detalhes: { targetUserId: data.userId, role: data.role },
      });
      throw e;
    }
  });

export const setUserDepartment = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        departmentId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.canEditBasics) throw new Error("Forbidden: apenas super admin ou admin");
    if (!auth.isGlobalAdmin) await assertTargetIsNotSuperAdmin(data.userId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ department_id: data.departmentId })
      .eq("id", data.userId);

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "change_department",
      descricao: `Alterou o departamento de ${targetLabel}`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId, departmentId: data.departmentId },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email().max(255),
        fullName: z.string().min(1).max(255),
        role: z.enum(["admin", "analista", "visualizador", "personalizado", "super_admin"]),
        copyFromUserId: z.string().uuid().optional().nullable(),
        departmentId: z.string().uuid().optional().nullable(),
        permissionProfileId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    // Admin agora também pode cadastrar usuários — só não pode atribuir o papel
    // super_admin nem propagar (via cópia) configurações exclusivas de super_admin
    // (ver copyUserConfig).
    if (!auth.isGlobalAdmin && !auth.isAdminRole) {
      throw new Error("Forbidden: apenas super admin ou admin pode cadastrar usuários");
    }
    if (!auth.isGlobalAdmin && data.role === "super_admin") {
      throw new Error("Forbidden: apenas super admin pode atribuir o papel Super Admin");
    }

    let result: { ok: boolean; userId: string | undefined };
    try {
      result = await inviteUserCore(data, context);
    } catch (e: unknown) {
      await logAudit({
        userId: context.userId,
        modulo: "usuarios",
        acao: "invite",
        descricao: `Falha ao convidar o usuário ${data.email}`,
        status: "error",
        mensagemErro: e instanceof Error ? e.message : String(e),
        detalhes: { email: data.email, role: data.role },
      });
      throw e;
    }

    // Departamento é atributo organizacional, independente do papel/permissões —
    // aplica sempre que informado, mesmo se a cópia ou o perfil abaixo falharem.
    if (result.userId && data.departmentId !== undefined) {
      await supabaseAdmin.from("profiles").update({ department_id: data.departmentId }).eq("id", result.userId);
    }

    // Clona as configurações de um usuário existente, se solicitado (após o convite dar certo).
    if (data.copyFromUserId && result.userId) {
      try {
        await copyUserConfig(data.copyFromUserId, result.userId, context.userId, auth.isGlobalAdmin);
      } catch (e: unknown) {
        await logAudit({
          userId: context.userId,
          modulo: "usuarios",
          acao: "copy_permissions",
          descricao: `Usuário ${data.email} criado, mas falha ao copiar as configurações`,
          status: "error",
          mensagemErro: e instanceof Error ? e.message : String(e),
          detalhes: { sourceUserId: data.copyFromUserId, targetUserId: result.userId },
        });
        throw new Error(
          `Usuário criado e convidado, mas falha ao copiar as configurações: ${e instanceof Error ? e.message : String(e)}. Ajuste as permissões manualmente.`,
        );
      }
    } else if (data.role === "personalizado" && data.permissionProfileId && result.userId) {
      // Só faz sentido aplicar perfil quando não veio de cópia (cópia já traz as
      // permissões granulares prontas do usuário-fonte).
      try {
        await applyPermissionProfileCore(result.userId, data.permissionProfileId, context.userId);
      } catch (e: unknown) {
        await logAudit({
          userId: context.userId,
          modulo: "usuarios",
          acao: "apply_permission_profile",
          descricao: `Usuário ${data.email} criado, mas falha ao aplicar o perfil de permissão`,
          status: "error",
          mensagemErro: e instanceof Error ? e.message : String(e),
          detalhes: { targetUserId: result.userId, profileId: data.permissionProfileId },
        });
        throw new Error(
          `Usuário criado e convidado, mas falha ao aplicar o perfil de permissão: ${e instanceof Error ? e.message : String(e)}. Ajuste as permissões manualmente.`,
        );
      }
    }

    return result;
  });

// Troca o papel de um usuário e recria as permissões padrão dele. Usado ao
// alterar o papel e no convite. Só o servidor (service role) define papel:
// o gatilho handle_new_user ignora o que o próprio usuário envia no cadastro.
async function resetUserRole(
  userId: string,
  role: "admin" | "analista" | "visualizador" | "personalizado" | "super_admin",
) {
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  const { error: e2 } = await supabaseAdmin.from("user_roles").insert({
    user_id: userId,
    role: role as any,
  });
  if (e2) throw new Error(e2.message);

  // Wipe existing module admins and granular perms so defaults reflect the new role.
  await supabaseAdmin.from("module_admins").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_module_permissions").delete().eq("user_id", userId);
  // O rótulo "perfil aplicado" só faz sentido enquanto as permissões ainda
  // são exatamente a cópia daquele perfil — a troca de papel acima já
  // zerou tudo, então o rótulo fica sem sentido independente do novo papel.
  await supabaseAdmin.from("profiles").update({ permission_profile_id: null }).eq("id", userId);

  // Re-apply defaults for the new role (admin = todos os módulos + ações).
  const { error: e3 } = await supabaseAdmin.rpc("apply_role_defaults", {
    _user_id: userId,
    _role: role as any,
  });
  if (e3) throw new Error(e3.message);
}

async function inviteUserCore(
  data: {
    email: string;
    fullName: string;
    role: "admin" | "analista" | "visualizador" | "personalizado" | "super_admin";
  },
  context: { userId: string },
) {
  const origin = appUrl();

  // SMTP é pré-requisito: o convite agora é enviado por nós (e-mail branded), não pelo Supabase.
  const { data: cfg } = await supabaseAdmin.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg || !cfg.enabled || !cfg.host) {
    throw new Error("SMTP não configurado. Configure em Configurações → SMTP antes de cadastrar usuários.");
  }

  // Cria o usuário e gera o link de convite SEM disparar o e-mail padrão do Supabase.
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email: data.email,
    options: {
      // Só o nome vai nos metadados do usuário; o papel é definido abaixo.
      data: { full_name: data.fullName },
      redirectTo: `${origin}/login`,
    },
  });
  if (linkErr) throw new Error(linkErr.message);
  const actionLink = linkData.properties?.action_link;
  if (!actionLink) throw new Error("Não foi possível gerar o link de convite.");

  // Armazena a URL real do Supabase em proxy opaco para não expô-la no email.
  const { data: redirect, error: redirectErr } = await (supabaseAdmin as any)
    .from("invite_redirects")
    .insert({
      target_url: actionLink,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (redirectErr) throw new Error("Erro ao preparar link de ativação.");
  const inviteUrl = `${origin}/ativar?t=${redirect.id}`;
  const userId = linkData.user?.id;
  if (!userId) throw new Error("Não foi possível criar o usuário do convite.");
  await resetUserRole(userId, data.role);

  const subject = `Bem-vindo ao ${APP_NAME} — ative seu acesso`;
  const html = buildUserInviteHtml({
    fullName: data.fullName,
    email: data.email,
    roleLabel: ROLE_LABELS[data.role],
    inviteUrl,
  });
  const password = (cfg as any).password || process.env.SMTP_PASSWORD || "";

  try {
    const out = await sendMail({
        host: cfg.host,
        port: cfg.port || 587,
        secure: !!cfg.secure,
        username: cfg.username || null,
        password,
        from: {
          name: cfg.from_name || APP_NAME,
          email: cfg.from_email || cfg.username || "noreply@example.com",
        },
        to: { name: data.fullName, email: data.email },
        subject,
        html,
      });
    await supabaseAdmin.from("email_logs").insert({
      to_email: data.email,
      subject,
      template: "user_invite",
      status: out.ok ? "success" : "error",
      error_message: out.ok ? null : String(out.error ?? "Falha"),
    });
    if (!out.ok) throw new Error(`Usuário criado, mas o e-mail de convite falhou: ${out.error ?? "erro desconhecido"}`);
  } catch (e: any) {
    await supabaseAdmin.from("email_logs").insert({
      to_email: data.email,
      subject,
      template: "user_invite",
      status: "error",
      error_message: e?.message ?? "Erro desconhecido",
    });
    throw new Error(e?.message ?? "Falha ao enviar o e-mail de convite.");
  }

  await logAudit({
    userId: context.userId,
    modulo: "usuarios",
    acao: "invite",
    descricao: `Convidou o usuário ${data.email} (${data.fullName}) com papel "${ROLE_LABELS[data.role]}"`,
    status: "success",
    detalhes: { email: data.email, role: data.role },
  });

  return { ok: true, userId };
}

// Clona as configurações de ACESSO (papel + admin de módulo + permissões granulares)
// de um usuário-fonte para o recém-criado, sobrescrevendo os defaults aplicados pelo
// trigger de criação → clone exato. NÃO copia departamento (atributo organizacional,
// definido à parte). `granted_by` = admin que fez o convite.
// Quando quem convida NÃO é super_admin, a cópia não pode ser um vetor pra escalar
// privilégio: bloqueia clonar de uma fonte super_admin, não propaga "Admin do
// módulo" (exclusivo de super_admin, ver setModuleAdmin) e não propaga permissão
// granular em módulo exclusivo (ver isExclusiveModule/setUserPermission).
async function copyUserConfig(sourceId: string, targetId: string, grantedBy: string, granterIsGlobalAdmin: boolean) {
  const { data: srcRole } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", sourceId).maybeSingle();
  const role = (srcRole as any)?.role as string | undefined;
  if (role === "super_admin" && !granterIsGlobalAdmin) {
    throw new Error("Forbidden: apenas super admin pode copiar as configurações de outro super admin");
  }
  if (role) {
    await supabaseAdmin.from("user_roles").delete().eq("user_id", targetId);
    await supabaseAdmin.from("user_roles").insert({ user_id: targetId, role: role as any });
  }

  // Zera os defaults do target antes de clonar (evita união com os defaults do papel).
  await supabaseAdmin.from("module_admins").delete().eq("user_id", targetId);
  await supabaseAdmin.from("user_module_permissions").delete().eq("user_id", targetId);

  if (granterIsGlobalAdmin) {
    const { data: srcAdmins } = await supabaseAdmin.from("module_admins").select("module_slug").eq("user_id", sourceId);
    if (srcAdmins && srcAdmins.length) {
      await supabaseAdmin
        .from("module_admins")
        .insert(srcAdmins.map((a: any) => ({ user_id: targetId, module_slug: a.module_slug, granted_by: grantedBy })));
    }
  }

  const { data: srcPerms } = await supabaseAdmin
    .from("user_module_permissions")
    .select("module_slug, action")
    .eq("user_id", sourceId);
  const permsToCopy = granterIsGlobalAdmin
    ? (srcPerms ?? [])
    : (srcPerms ?? []).filter((p: any) => !isExclusiveModule(p.module_slug));
  if (permsToCopy.length) {
    await supabaseAdmin.from("user_module_permissions").insert(
      permsToCopy.map((p: any) => ({
        user_id: targetId,
        module_slug: p.module_slug,
        action: p.action,
        granted_by: grantedBy,
      })),
    );
  }

  const sourceLabel = await targetProfileLabel(sourceId);
  const targetLabel = await targetProfileLabel(targetId);
  await logAudit({
    userId: grantedBy,
    modulo: "usuarios",
    acao: "copy_permissions",
    descricao: `Copiou as configurações de ${sourceLabel} para ${targetLabel}`,
    status: "success",
    detalhes: { sourceUserId: sourceId, targetUserId: targetId, role: role ?? null },
  });
}

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    // Admin também pode ativar/desativar — menos um super_admin, que só outro
    // super_admin pode mexer (mesmo padrão de setUserRole/setUserDepartment).
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");
    if (!auth.isGlobalAdmin) await assertTargetIsNotSuperAdmin(data.userId);
    if (data.userId === context.userId) throw new Error("Você não pode desativar a própria conta");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    } as any);

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: data.active ? "activate" : "deactivate",
      descricao: `${data.active ? "Reativou" : "Desativou"} o usuário ${targetLabel}`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId, active: data.active },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserAuthMethod = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        authMethod: z.enum(["sso", "email", "ambos"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.canEditBasics) throw new Error("Forbidden: apenas super admin ou admin");
    if (!auth.isGlobalAdmin) await assertTargetIsNotSuperAdmin(data.userId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ auth_method: data.authMethod } as any)
      .eq("id", data.userId);

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "change_auth_method",
      descricao: `Alterou o método de autenticação de ${targetLabel} para "${data.authMethod}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId, authMethod: data.authMethod },
    });

    if (error) throw new Error(error.message);

    // Ao mudar para SSO-only, seta uma senha aleatória para impedir login por senha.
    if (data.authMethod === "sso") {
      const randomPwd = `locked-${crypto.randomUUID()}-${crypto.randomUUID()}`;
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: randomPwd });
    }

    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    if (!auth.isGlobalAdmin && !auth.canEditBasics) {
      throw new Error("Forbidden: apenas super admin ou admin pode redefinir senhas");
    }
    if (!auth.isGlobalAdmin) await assertTargetIsNotSuperAdmin(data.userId);

    // Verifica se o usuário tem método de autenticação compatível com senha.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("auth_method")
      .eq("id", data.userId)
      .maybeSingle();
    if ((profile as any)?.auth_method === "sso") {
      throw new Error("Este usuário usa autenticação via SSO. Redefinição de senha não é permitida.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });

    const targetLabel = await targetProfileLabel(data.userId);
    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "reset_password",
      descricao: `Redefiniu a senha do usuário ${targetLabel}`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const auth = await assertCanManageUsers(context.supabase, context.userId);
    // Admin também pode excluir — menos um super_admin, que só outro super_admin
    // pode mexer (mesmo padrão de setUserRole/setUserDepartment).
    if (!auth.isGlobalAdmin && !auth.isAdminRole) throw new Error("Forbidden: apenas super admin ou admin");
    if (!auth.isGlobalAdmin) await assertTargetIsNotSuperAdmin(data.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta");
    const targetLabel = await targetProfileLabel(data.userId);
    await supabaseAdmin.from("user_module_permissions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("module_admins").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);

    await logAudit({
      userId: context.userId,
      modulo: "usuarios",
      acao: "delete",
      descricao: `Excluiu o usuário ${targetLabel}`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { targetUserId: data.userId },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
