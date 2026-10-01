// Server-side authorization helpers for createServerFn handlers.
// Use these whenever a handler reads/writes via the service-role admin
// client (which bypasses RLS) to enforce the same role/module checks
// that the corresponding RLS policies would enforce.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ModuleAction =
  | "view"
  | "edit"
  | "create"
  | "delete"
  | "approve"
  | "execute"
  | "manage"
  | "manage_buscar_dns"
  | "manage_purge_cache"
  | "manage_cache_performance"
  | "manage_adicionar_dns"
  | "manage_editar_dns"
  | "manage_custom_rules"
  | "manage_rules"
  | "manage_rules_overview"
  | "manage_rules_page_rules"
  | "manage_rules_overview_url_rewrite"
  | "manage_rules_overview_redirect"
  | "manage_rules_overview_origin"
  | "manage_rules_overview_cache"
  | "manage_rules_overview_cache_response"
  | "manage_rules_overview_request_header_transform"
  | "manage_rules_overview_response_header_transform"
  | "manage_rules_overview_custom_error"
  | "manage_rules_overview_configuration"
  | "view_analytics_http"
  | "view_analytics_security"
  | "view_analytics_web"
  | "view_analytics_loadbalancing";

/**
 * Require the calling user to have `_action` on `_module`, otherwise throw.
 * Uses the user-scoped supabase client from `requireSupabaseAuth.context.supabase`
 * to call the SECURITY DEFINER RPC `has_module_permission`.
 *
 * Admins and module admins are granted via the same RPC (see public.has_module_permission).
 */
export async function requirePermission(
  sb: SupabaseClient,
  userId: string,
  moduleSlug: string,
  action: ModuleAction,
): Promise<void> {
  const { data, error } = await sb.rpc("has_module_permission", {
    _user_id: userId,
    _module: moduleSlug,
    _action: action,
  });
  if (error) throw new Error(`Permissão indisponível: ${error.message}`);
  if (data !== true) throw new Error("Acesso negado: você não tem permissão para esta ação");
}

/**
 * Like requirePermission but returns a boolean instead of throwing.
 * Use when the caller should fall back to a narrower scope (e.g. only their
 * own records) rather than be denied outright.
 */
export async function hasPermission(
  sb: SupabaseClient,
  userId: string,
  moduleSlug: string,
  action: ModuleAction,
): Promise<boolean> {
  const { data, error } = await sb.rpc("has_module_permission", {
    _user_id: userId,
    _module: moduleSlug,
    _action: action,
  });
  if (error) return false;
  return data === true;
}

/** Require either app-wide admin (ou super_admin) ou analista. Used for system-wide maintenance handlers. */
export async function requireAdminOrAnalista(sb: SupabaseClient, userId: string): Promise<void> {
  const [adminRes, superAdminRes, analistaRes] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" as any }),
    sb.rpc("has_role", { _user_id: userId, _role: "analista" as any }),
  ]);
  if (adminRes.error) throw new Error(`Permissão indisponível: ${adminRes.error.message}`);
  if (adminRes.data === true || superAdminRes.data === true || analistaRes.data === true) return;
  throw new Error("Acesso negado: requer perfil admin ou analista");
}

/**
 * Require app-wide admin ou super_admin (papel global, não permissão de módulo).
 * Usado como piso extra em ações destrutivas onde a permissão granular do
 * módulo (ex.: manage_rules_overview_<categoria>) não é suficiente sozinha —
 * ex.: excluir uma regra de Cloudflare Rules exige isso além da permissão.
 */
export async function requireGlobalAdminRole(sb: SupabaseClient, userId: string): Promise<void> {
  const [adminRes, superAdminRes] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" as any }),
  ]);
  if (adminRes.error) throw new Error(`Permissão indisponível: ${adminRes.error.message}`);
  if (adminRes.data === true || superAdminRes.data === true) return;
  throw new Error("Acesso negado: excluir regras requer perfil admin ou super admin.");
}
