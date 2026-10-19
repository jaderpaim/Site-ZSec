import { MODULES, type ModuleDef, type ModuleGroup } from "@/lib/modules";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import {
  Eye,
  Landmark,
  LayoutDashboard,
  Library,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  "Executivo",
  "Monitoramento",
  "Governança",
  "Operações",
  "Cadastros",
  "Configurações",
] as const;

export type GroupTone = "exec" | "mon" | "gov" | "ops" | "cad" | "cfg";

/** Ícone e cor (token --v2-cat-*) de cada categoria no trilho da sidebar */
export const GROUP_META: Record<ModuleGroup, { icon: LucideIcon; tone: GroupTone }> = {
  Executivo: { icon: LayoutDashboard, tone: "exec" },
  Monitoramento: { icon: Eye, tone: "mon" },
  Governança: { icon: Landmark, tone: "gov" },
  Operações: { icon: Wrench, tone: "ops" },
  Cadastros: { icon: Library, tone: "cad" },
  Configurações: { icon: Settings2, tone: "cfg" },
};

/**
 * Módulos que o usuário atual enxerga na navegação (sidebar e busca ⌘K).
 * É só visibilidade: o acesso de fato é gated na rota/backend pelo RBAC.
 */
export function useVisibleModules(): ModuleDef[] {
  const { role } = useAuth();
  const { isAdmin, isDastAllowed, can } = usePermissions();

  // role vem do useAuth — disponível imediatamente sem delay de query
  const globalAdmin = role === "admin" || role === "super_admin" || isAdmin;

  // Benchmark e Painel Executivo são módulos exclusivos (ver
  // src/lib/exclusive-modules.ts): só super_admin tem bypass automático —
  // admin (e demais) exige concessão explícita em module_admins/
  // user_module_permissions. Painel Executivo tem um detalhe a mais: quem já
  // tinha `view` concedido antes de virar exclusivo manteve o acesso (ver
  // migration 20260827120000_painel_executivo_exclusive.sql) — só passou a
  // faltar bypass automático pra admin e default novo pra papéis recém-criados.
  const canSeeBenchmark = can("benchmark", "view") || can("benchmark", "manage");
  const canSeePainelExecutivo = can("painel-executivo", "view");

  // Regras de visibilidade (instantâneas via role):
  // - Grupo "Configurações": somente admin global
  // - "usuarios": admin global ou admin de qualquer módulo
  // - Demais módulos: visíveis para todos; o acesso é gated na rota/backend
  //   pela permissão de view (RBAC).
  return MODULES.filter((m) => {
    if (m.hidden) return false;
    if (m.slug === "dast-scanner" || m.slug === "shadow-it") return isDastAllowed; // admin + depto Segurança da Informação -- Shadow IT reaproveita o mesmo gate do DAST
    if (m.slug === "benchmark") return canSeeBenchmark; // exige flag explícita, mesmo pra admin
    if (m.slug === "painel-executivo") return canSeePainelExecutivo; // idem
    if (m.group === "Configurações") return globalAdmin;
    if (m.slug === "usuarios") return globalAdmin; // somente admin global
    if (m.slug === "sso-ldap") return globalAdmin; // somente admin global
    return true;
  });
}
