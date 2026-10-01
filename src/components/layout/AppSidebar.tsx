import { Link, useRouterState } from "@tanstack/react-router";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { LogOut } from "lucide-react";

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, role, signOut } = useAuth();
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
  const canSeePainelCLevel = can("painel-c-level", "view");

  const groups = ["Executivo", "Monitoramento", "Governança", "Operações", "Cadastros", "Configurações"] as const;

  // Regras de visibilidade da sidebar (instantâneas via role):
  // - Grupo "Configurações": somente admin global
  // - "usuarios": admin global ou admin de qualquer módulo
  // - Demais módulos: visíveis para todos; o acesso é gated na rota/backend
  //   pela permissão de view (RBAC).
  const visibleModules = MODULES.filter((m) => {
    if (m.slug === "dast-scanner" || m.slug === "shadow-it") return isDastAllowed; // admin + depto Segurança da Informação -- Shadow IT reaproveita o mesmo gate do DAST
    if (m.slug === "benchmark") return canSeeBenchmark; // exige flag explícita, mesmo pra admin
    if (m.slug === "painel-executivo") return canSeePainelExecutivo; // idem
    if (m.slug === "painel-c-level") return canSeePainelCLevel; // idem
    if (m.group === "Configurações") return globalAdmin;
    if (m.slug === "usuarios") return globalAdmin; // somente admin global
    if (m.slug === "sso-ldap") return globalAdmin; // somente admin global
    return true;
  });

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="shrink-0 flex items-center justify-center">
          <svg width="32" height="36" viewBox="0 0 48 54" fill="none">
            <path d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z" fill="oklch(0.78 0.13 220)" />
            <path d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z" fill="url(#sShine)" />
            <path
              d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z"
              stroke="oklch(0.88 0.13 220)"
              strokeWidth="0.8"
              fill="none"
            />
            <path
              d="M24 27 C24 27 20 21 15 21 C10 21 7 23.5 7 27 C7 30.5 10 33 15 33 C20 33 24 27 24 27 C24 27 28 21 33 21 C38 21 41 23.5 41 27 C41 30.5 38 33 33 33 C28 33 24 27 24 27 Z"
              stroke="oklch(0.16 0.03 250)"
              strokeWidth="2.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.9"
            />
            <defs>
              <linearGradient id="sShine" x1="12" y1="2" x2="12" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="white" stopOpacity="0.18" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <div className="font-semibold tracking-tight text-foreground text-sm">B-Security</div>
          <div className="text-mono-xs text-muted-foreground">Bernoulli Security Suite</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((g) => {
          const groupModules = visibleModules
            .filter((m) => m.group === g)
            .sort((a, b) => a.short.localeCompare(b.short, "pt-BR"));
          if (groupModules.length === 0) return null;
          return (
            <div key={g}>
              <div className="text-mono-xs text-muted-foreground px-3 mb-2 font-semibold">{g}</div>
              <div className="space-y-0.5">
                {groupModules.map((m) => {
                  const active = pathname.startsWith(`/app/${m.slug}`);
                  const Icon = m.icon;
                  return (
                    <Link
                      key={m.slug}
                      to="/app/$module"
                      params={{ module: m.slug }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-primary/15 text-primary border-l-2 border-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{m.short}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-foreground">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate">{user?.email}</div>
            <div className="text-mono-xs text-muted-foreground">{role ?? "—"}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-accent transition-colors"
            title="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
