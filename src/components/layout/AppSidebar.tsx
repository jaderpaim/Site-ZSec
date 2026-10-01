import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { MODULE_GROUPS, useVisibleModules } from "@/lib/use-visible-modules";
import { useShellState } from "@/components/layout/shell-state";
import {
  useNavIndicators,
  type NavIndicator,
  type NavIndicatorTone,
} from "@/lib/use-nav-indicators";
import { ChevronDown, LogOut } from "lucide-react";

const COLLAPSED_KEY = "bsec.sidebar.collapsed";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  analista: "Analista",
  visualizador: "Visualizador",
  personalizado: "Personalizado",
};

const TONE_CLASS: Record<NavIndicatorTone, string> = {
  crit: "bg-v2-crit/15 text-v2-crit",
  warn: "bg-v2-med/15 text-v2-med",
  info: "bg-v2-accent/15 text-v2-accent",
};

function IndicatorBadge({ ind }: { ind: NavIndicator }) {
  return (
    <span
      className={`ml-auto shrink-0 min-w-[20px] h-[18px] px-1.5 rounded-full grid place-items-center font-data text-[11px] font-medium tabular-nums ${TONE_CLASS[ind.tone]}`}
      title={ind.label}
    >
      <span aria-hidden="true">{ind.count > 99 ? "99+" : ind.count}</span>
      <span className="sr-only">{ind.label}</span>
    </span>
  );
}

function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 54" className={className} aria-hidden="true">
      <path
        d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z"
        fill="var(--v2-accent)"
      />
      <path
        d="M24 27s-4-6-9-6-8 2.5-8 6 3 6 8 6 9-6 9-6 4-6 9-6 8 2.5 8 6-3 6-8 6-9-6-9-6Z"
        stroke="var(--v2-accent-ink)"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, role, signOut } = useAuth();
  const visibleModules = useVisibleModules();
  const indicators = useNavIndicators(visibleModules);
  const { navOpen, setNavOpen } = useShellState();

  // Grupos recolhidos ficam salvos por navegador
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  React.useEffect(() => setCollapsed(readCollapsed()), []);
  const toggleGroup = (g: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* storage indisponível: só não persiste */
      }
      return next;
    });
  };

  // Fecha o menu do mobile ao navegar
  React.useEffect(() => setNavOpen(false), [pathname, setNavOpen]);

  const email = user?.email ?? "";
  const displayName = email.split("@")[0].replace(/[._]/g, " ");

  return (
    <>
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`font-ui w-[248px] shrink-0 bg-v2-surface border-r border-v2-line flex flex-col h-screen
          fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0
          ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
        aria-label="Navegação principal"
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
          <BrandMark className="w-7 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-v2-fg">B-Security</div>
            <div className="text-[11px] text-v2-fg-3">Segurança da Informação</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {MODULE_GROUPS.map((g) => {
            const groupModules = visibleModules
              .filter((m) => m.group === g)
              .sort((a, b) => a.short.localeCompare(b.short, "pt-BR"));
            if (groupModules.length === 0) return null;
            const isCollapsed = collapsed.includes(g);
            const hasActive = groupModules.some((m) => pathname.startsWith(`/app/${m.slug}`));
            // Grupo recolhido: mostra o total de pendências dos módulos dele, no tom mais grave
            const groupInds = groupModules
              .map((m) => indicators[m.slug])
              .filter(Boolean) as NavIndicator[];
            const groupTotal: NavIndicator | null = groupInds.length
              ? {
                  count: groupInds.reduce((sum, i) => sum + i.count, 0),
                  tone: groupInds.some((i) => i.tone === "crit") ? "crit" : groupInds[0].tone,
                  label: groupInds.map((i) => i.label).join(" · "),
                }
              : null;
            return (
              <div key={g} className="mt-2.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(g)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-[5px] text-[11px] font-semibold uppercase tracking-[0.08em] text-v2-fg-3 hover:text-v2-fg-2"
                >
                  <span className="flex items-center gap-2">
                    {g}
                    {isCollapsed && hasActive && (
                      <span className="size-1.5 rounded-full bg-v2-accent" />
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {isCollapsed && groupTotal && <IndicatorBadge ind={groupTotal} />}
                    <ChevronDown
                      className={`size-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="grid gap-px">
                    {groupModules.map((m) => {
                      const active = pathname.startsWith(`/app/${m.slug}`);
                      const Icon = m.icon;
                      return (
                        <li key={m.slug}>
                          <Link
                            to="/app/$module"
                            params={{ module: m.slug }}
                            aria-current={active ? "page" : undefined}
                            className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-[5px] text-[13.5px] transition-colors ${
                              active
                                ? "bg-v2-accent/15 text-v2-fg font-medium"
                                : "text-v2-fg-2 hover:bg-v2-hover hover:text-v2-fg"
                            }`}
                          >
                            <Icon
                              className={`size-4 shrink-0 ${active ? "text-v2-accent" : "text-v2-fg-3 group-hover:text-v2-fg-2"}`}
                            />
                            <span className="truncate">{m.short}</span>
                            {indicators[m.slug] && <IndicatorBadge ind={indicators[m.slug]} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 px-4 py-3 border-t border-v2-line">
          <div className="size-[30px] shrink-0 rounded-full grid place-items-center bg-v2-surface-2 border border-v2-line text-xs font-semibold text-v2-fg">
            {email[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium text-v2-fg truncate capitalize" title={email}>
              {displayName || "—"}
            </div>
            <div className="text-[11px] text-v2-fg-3">
              {role ? (ROLE_LABEL[role] ?? role) : "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="size-8 grid place-items-center rounded-lg text-v2-fg-3 hover:text-v2-fg hover:bg-v2-hover transition-colors"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
