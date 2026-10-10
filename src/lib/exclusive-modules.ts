// Módulos "exclusivos": dados restritos onde nem admin tem bypass automático
// — só super_admin enxerga/opera por padrão, e só super_admin pode conceder
// ou revogar acesso (module_admins / user_module_permissions) pra qualquer
// outro usuário, inclusive pra quem tem papel Admin.
//
// "painel-executivo" é um caso com histórico: quem já tinha `view` concedido
// antes de virar exclusivo (visualizador/analista/personalizado) manteve o
// acesso — só o bypass automático de admin foi fechado, e só usuários NOVOS
// desses papéis deixaram de receber `view` por padrão (ver
// migration 20260827120000_painel_executivo_exclusive.sql). Já "benchmark"
// nunca teve default nenhum, pra ninguém.
//
// Precisa ficar em sincronia manual com a exclusão equivalente em
// is_module_admin/has_module_permission/apply_role_defaults no banco (ver
// migrations 20260826120000_exclusive_modules_rbac.sql e
// 20260827120000_painel_executivo_exclusive.sql) — não há uma fonte única
// compartilhada entre TS e SQL.
export const EXCLUSIVE_MODULE_SLUGS = new Set<string>(["benchmark", "painel-executivo"]);

export function isExclusiveModule(moduleSlug: string): boolean {
  return EXCLUSIVE_MODULE_SLUGS.has(moduleSlug);
}
