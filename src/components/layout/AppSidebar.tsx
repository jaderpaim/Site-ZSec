import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GROUP_META, MODULE_GROUPS, useVisibleModules } from "@/lib/use-visible-modules";
import type { ModuleDef, ModuleGroup } from "@/lib/modules";
import { useShellState } from "@/components/layout/shell-state";
import {
  useNavIndicators,
  type NavIndicator,
  type NavIndicatorTone,
} from "@/lib/use-nav-indicators";
import { usePinnedModules } from "@/lib/use-user-settings";
import { useTheme, type Theme } from "@/lib/use-theme";
import { APP_NAME } from "@/lib/brand";
import {
  SEGMENT_BASE,
  SEGMENT_OFF,
  SEGMENT_ON,
  THEME_OPTIONS,
} from "@/components/layout/ThemeSwitch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "fixados" é a categoria extra, montada a partir de user_settings.pinned_modules */
type CategoryKey = ModuleGroup | "fixados";
type Indicators = Record<string, NavIndicator | undefined>;

const MENU_ITEM =
  "gap-2 h-8 px-2 rounded-md text-[13px] text-v2-fg-2 cursor-pointer data-[highlighted]:bg-v2-hover data-[highlighted]:text-v2-fg";

const TONE_CLASS: Record<NavIndicatorTone, string> = {
  crit: "bg-v2-crit/15 text-v2-crit",
  warn: "bg-v2-med/15 text-v2-med",
  info: "bg-v2-accent/15 text-v2-accent",
};

const DOT_CLASS: Record<NavIndicatorTone, string> = {
  crit: "bg-v2-crit",
  warn: "bg-v2-med",
  info: "bg-v2-accent",
};

// Cada categoria expõe sua cor em --cat; os filhos usam bg-(--cat), text-(--cat) etc.
function catStyle(key: CategoryKey): React.CSSProperties {
  const tone = key === "fixados" ? "pin" : GROUP_META[key].tone;
  return { "--cat": `var(--v2-cat-${tone})` } as React.CSSProperties;
}

type GroupTotal = NavIndicator & { crit: number };

function sumIndicators(mods: ModuleDef[], indicators: Indicators): GroupTotal | null {
  const inds = mods.map((m) => indicators[m.slug]).filter((i): i is NavIndicator => !!i);
  if (!inds.length) return null;
  const count = inds.reduce((sum, i) => sum + i.count, 0);
  const crit = inds.filter((i) => i.tone === "crit").reduce((sum, i) => sum + i.count, 0);
  const tone: NavIndicatorTone = crit
    ? "crit"
    : inds.some((i) => i.tone === "warn")
      ? "warn"
      : "info";
  return { count, crit, tone, label: `${count} pendências` };
}

function IndicatorBadge({ ind, className = "" }: { ind: NavIndicator; className?: string }) {
  return (
    <span
      className={`ml-auto shrink-0 min-w-[20px] h-[18px] px-1.5 rounded-full grid place-items-center font-data text-[11px] font-medium tabular-nums ${TONE_CLASS[ind.tone]} ${className}`}
      title={ind.label}
    >
      <span aria-hidden="true">{ind.count > 99 ? "99+" : ind.count}</span>
      <span className="sr-only">{ind.label}</span>
    </span>
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 54" className={className} aria-hidden="true">
      <path
        d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z"
        fill="var(--v2-accent)"
      />
      {/* "Z" do Z-Sec */}
      <path
        d="M15.5 19.5H32.5L15.5 35.5H32.5"
        stroke="var(--v2-accent-ink)"
        strokeWidth="3.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const visibleModules = useVisibleModules();
  const indicators: Indicators = useNavIndicators(visibleModules);
  const { navOpen, setNavOpen, setSearchOpen, railMode, setRailMode } = useShellState();
  const { pinned, togglePin } = usePinnedModules();

  // Categoria escolhida no trilho; null = segue a categoria do módulo aberto
  const [selected, setSelected] = React.useState<CategoryKey | null>(null);
  // Painel flutuante do modo recolhido
  const [flyout, setFlyout] = React.useState<CategoryKey | null>(null);

  // Ao navegar: fecha o menu do mobile e o painel flutuante, e volta a seguir o módulo aberto
  React.useEffect(() => {
    setNavOpen(false);
    setFlyout(null);
    setSelected(null);
  }, [pathname, setNavOpen]);

  const byGroup = React.useMemo(() => {
    const map = new Map<ModuleGroup, ModuleDef[]>();
    for (const g of MODULE_GROUPS) {
      const list = visibleModules
        .filter((m) => m.group === g)
        .sort((a, b) => a.short.localeCompare(b.short, "pt-BR"));
      if (list.length) map.set(g, list);
    }
    return map;
  }, [visibleModules]);

  // Só os fixados que o usuário ainda enxerga: se perder a permissão, some do menu mas continua salvo
  const pinnedModules = React.useMemo(
    () =>
      pinned
        .map((slug) => visibleModules.find((m) => m.slug === slug))
        .filter((m): m is ModuleDef => !!m),
    [pinned, visibleModules],
  );

  const activeModule = visibleModules.find((m) => pathname.startsWith(`/app/${m.slug}`));
  const modulesOf = (key: CategoryKey) =>
    key === "fixados" ? pinnedModules : (byGroup.get(key) ?? []);
  const current: CategoryKey =
    selected ??
    activeModule?.group ??
    (pinnedModules.length ? "fixados" : ([...byGroup.keys()][0] ?? "fixados"));

  const pick = (key: CategoryKey) => {
    setSelected(key);
    if (railMode) setFlyout((f) => (f === key ? null : key));
  };
  const isSelected = (key: CategoryKey) => (railMode && flyout ? flyout === key : current === key);
  const panelProps = {
    activeSlug: activeModule?.slug,
    indicators,
    pinned,
    onTogglePin: togglePin,
  };

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
        onMouseLeave={() => setFlyout(null)}
        className={`font-ui shrink-0 bg-v2-surface border-r border-v2-line flex h-screen
          fixed inset-y-0 left-0 z-50 transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:translate-x-0
          ${railMode ? "w-[264px] lg:w-[60px]" : "w-[264px]"}
          ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
        aria-label="Navegação principal"
      >
        <div className="w-[60px] shrink-0 flex flex-col items-center gap-1 py-3.5 bg-v2-surface-2 border-r border-v2-line">
          <BrandMark className="w-[26px] h-[30px] shrink-0 mb-2.5" />
          {railMode && (
            <RailIconButton label="Ir para módulo (⌘K)" onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
            </RailIconButton>
          )}
          <CategoryButton
            category="fixados"
            label="Fixados"
            Icon={Star}
            total={sumIndicators(pinnedModules, indicators)}
            selected={isSelected("fixados")}
            isCurrent={false}
            onSelect={() => pick("fixados")}
            onHover={railMode ? () => setFlyout("fixados") : undefined}
          />
          <span className="w-6 h-px bg-v2-line-strong/60 my-1.5" aria-hidden="true" />
          {[...byGroup].map(([g, mods]) => (
            <CategoryButton
              key={g}
              category={g}
              label={g}
              Icon={GROUP_META[g].icon}
              total={sumIndicators(mods, indicators)}
              selected={isSelected(g)}
              isCurrent={activeModule?.group === g}
              onSelect={() => pick(g)}
              onHover={railMode ? () => setFlyout(g) : undefined}
            />
          ))}
          <span className="flex-1" />
          {railMode && (
            <RailIconButton label="Expandir menu" onClick={() => setRailMode(false)}>
              <PanelLeftOpen className="size-4" />
            </RailIconButton>
          )}
          <AccountMenu />
        </div>

        <ModulePanel
          category={current}
          modules={modulesOf(current)}
          className={railMode ? "lg:hidden" : ""}
          header={
            <PanelHeader
              onCollapse={() => setRailMode(true)}
              onSearch={() => setSearchOpen(true)}
            />
          }
          {...panelProps}
        />

        {railMode && flyout && (
          <ModulePanel
            category={flyout}
            modules={modulesOf(flyout)}
            className="hidden lg:flex absolute left-[60px] top-2 bottom-2 w-[236px] z-10 border border-v2-line rounded-xl shadow-2xl"
            {...panelProps}
          />
        )}
      </aside>
    </>
  );
}

function RailIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="hidden lg:grid size-[34px] place-items-center rounded-lg text-v2-fg-3 hover:text-v2-fg hover:bg-v2-hover transition-colors"
    >
      {children}
    </button>
  );
}

function CategoryButton({
  category,
  label,
  Icon,
  total,
  selected,
  isCurrent,
  onSelect,
  onHover,
}: {
  category: CategoryKey;
  label: string;
  Icon: LucideIcon;
  total: GroupTotal | null;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      style={catStyle(category)}
      onClick={onSelect}
      onMouseEnter={onHover}
      aria-label={total ? `${label}: ${total.label}` : label}
      aria-pressed={selected}
      title={label}
      className={`relative size-[42px] shrink-0 rounded-xl grid place-items-center transition-colors ${
        selected
          ? "bg-(--cat)/15 text-(--cat) ring-1 ring-inset ring-(--cat)/35"
          : "text-v2-fg-3 hover:bg-v2-hover hover:text-(--cat)"
      }`}
    >
      {isCurrent && (
        <span
          className="absolute -left-[9px] top-[11px] bottom-[11px] w-[3px] rounded-r-[3px] bg-(--cat)"
          aria-hidden="true"
        />
      )}
      <Icon className="size-[19px]" />
      {total && (
        <span
          className={`absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-v2-surface-2 ${DOT_CLASS[total.tone]}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function PanelHeader({ onCollapse, onSearch }: { onCollapse: () => void; onSearch: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 pl-4 pr-2.5 pt-3.5 pb-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold tracking-[-0.03em] leading-tight text-v2-fg">
            {APP_NAME}
          </div>
          <div className="font-data text-[10px] uppercase tracking-[0.14em] text-v2-accent">
            Security Suite
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Recolher menu"
          title="Recolher menu"
          className="hidden lg:grid size-[30px] place-items-center rounded-lg text-v2-fg-3 hover:text-v2-fg hover:bg-v2-hover transition-colors"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onSearch}
          className="w-full h-8 flex items-center gap-2 pl-2.5 pr-2 rounded-[7px] border border-v2-line bg-v2-surface-2 text-[13px] text-v2-fg-3 hover:border-v2-line-strong hover:text-v2-fg-2 transition-colors"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Ir para módulo…</span>
          <kbd className="font-data text-[10.5px] px-1.5 rounded border border-v2-line bg-v2-surface">
            ⌘K
          </kbd>
        </button>
      </div>
    </>
  );
}

function ModulePanel({
  category,
  modules,
  activeSlug,
  indicators,
  pinned,
  onTogglePin,
  header,
  className = "",
}: {
  category: CategoryKey;
  modules: ModuleDef[];
  activeSlug?: string;
  indicators: Indicators;
  pinned: string[];
  onTogglePin: (slug: string) => void;
  header?: React.ReactNode;
  className?: string;
}) {
  const isPinnedList = category === "fixados";
  const Icon = isPinnedList ? Star : GROUP_META[category].icon;
  const total = sumIndicators(modules, indicators);
  const meta = [
    `${modules.length} ${modules.length === 1 ? "módulo" : "módulos"}`,
    total?.crit ? `${total.crit} críticas` : null,
    total ? `${total.count} pendências` : "sem pendências",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex-1 min-w-0 flex flex-col bg-v2-surface ${className}`}>
      {header}
      <div
        style={catStyle(category)}
        className={`mx-3 ${header ? "" : "mt-3"} px-3 py-3 rounded-xl flex items-center gap-2.5 bg-linear-to-br from-(--cat)/15 to-(--cat)/5`}
      >
        <span className="size-[34px] shrink-0 rounded-[10px] grid place-items-center bg-(--cat) text-v2-surface">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-v2-fg">
            {isPinnedList ? "Fixados" : category}
          </div>
          <div className="text-[11.5px] text-v2-fg-2 truncate">{meta}</div>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pt-2.5 pb-3 grid gap-0.5 content-start">
        {modules.length === 0 ? (
          <li className="px-3 py-4 text-center text-[12.5px] leading-relaxed text-v2-fg-3">
            Nenhum módulo fixado ainda.
            <br />
            Passe o mouse num módulo e clique na estrela.
          </li>
        ) : (
          modules.map((m) => (
            <ModuleLink
              key={m.slug}
              module={m}
              active={m.slug === activeSlug}
              indicator={indicators[m.slug]}
              pinned={pinned.includes(m.slug)}
              onTogglePin={() => onTogglePin(m.slug)}
              showGroup={isPinnedList}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function ModuleLink({
  module: m,
  active,
  indicator,
  pinned,
  onTogglePin,
  showGroup,
}: {
  module: ModuleDef;
  active: boolean;
  indicator?: NavIndicator;
  pinned: boolean;
  onTogglePin: () => void;
  showGroup: boolean;
}) {
  const Icon = m.icon;
  return (
    <li style={catStyle(m.group)} className="group relative">
      <Link
        to="/app/$module"
        params={{ module: m.slug }}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 h-[38px] pl-1.5 pr-2 rounded-[9px] text-[13.5px] transition-colors ${
          active
            ? "bg-(--cat)/12 text-v2-fg font-medium"
            : "text-v2-fg-2 hover:bg-v2-hover hover:text-v2-fg"
        }`}
      >
        <span
          className={`size-7 shrink-0 rounded-lg grid place-items-center border transition-colors ${
            active
              ? "bg-(--cat) text-v2-surface border-transparent"
              : "bg-v2-surface-2 text-v2-fg-3 border-v2-line group-hover:text-(--cat) group-hover:border-(--cat)/35"
          }`}
        >
          <Icon className="size-[15px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate">{m.short}</span>
          {showGroup && (
            <span className="block truncate text-[10.5px] font-normal text-v2-fg-3">{m.group}</span>
          )}
        </span>
        {indicator && (
          <IndicatorBadge
            ind={indicator}
            className="group-hover:invisible group-focus-within:invisible"
          />
        )}
      </Link>
      {/* Fora do <Link>: botão dentro de link é HTML inválido e o clique navegaria */}
      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={pinned}
        aria-label={`${pinned ? "Desafixar" : "Fixar"} ${m.short}`}
        title={pinned ? "Desafixar" : "Fixar"}
        className={`absolute right-2 top-1/2 -translate-y-1/2 size-[22px] rounded-md place-items-center hidden group-hover:grid group-focus-within:grid hover:bg-v2-surface-2 ${
          pinned ? "text-(--v2-cat-pin)" : "text-v2-fg-3 hover:text-v2-fg"
        }`}
      >
        <Star className={`size-[13px] ${pinned ? "fill-current" : ""}`} />
      </button>
    </li>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const email = user?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Conta e tema"
          title={email}
          className="mt-1 rounded-full p-1 hover:bg-v2-hover data-[state=open]:bg-v2-hover transition-colors"
        >
          <span className="size-[30px] rounded-full grid place-items-center bg-v2-surface border border-v2-line text-xs font-semibold text-v2-fg">
            {email[0]?.toUpperCase() ?? "U"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={10}
        className="w-[232px] p-1.5 font-ui rounded-[10px] bg-v2-surface border-v2-line text-v2-fg shadow-2xl"
      >
        <DropdownMenuLabel className="px-2 pt-1 pb-2 font-data text-[11px] font-normal text-v2-fg-3 break-all">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 mb-1.5 bg-v2-line" />
        <DropdownMenuLabel className="px-2 pt-0.5 pb-1 text-[11px] font-normal text-v2-fg-3">
          Tema
        </DropdownMenuLabel>
        {/* Itens de rádio do Radix estilizados como segmentos: mantém navegação por setas */}
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as Theme)}
          className="mx-1 mb-1.5 grid grid-cols-3 gap-0.5 p-0.5 rounded-[7px] bg-v2-surface-2"
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuPrimitive.RadioItem
              key={value}
              value={value}
              onSelect={(e) => e.preventDefault()}
              className={`${SEGMENT_BASE} cursor-pointer ${theme === value ? SEGMENT_ON : SEGMENT_OFF} data-[highlighted]:text-v2-fg`}
            >
              <Icon className="size-3.5" />
              {label}
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link to="/app/perfil">
            <UserRound className="size-4" /> Meu perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => signOut()}
          className={`${MENU_ITEM} data-[highlighted]:text-v2-crit`}
        >
          <LogOut className="size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
