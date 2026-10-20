import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Globe,
  History,
  Search,
  Server,
  Settings2,
} from "lucide-react";
import { SyncActions } from "@/components/layout/SyncActions";
import { listCloudflareZones, syncCloudflareZone } from "@/lib/cloudflare.functions";
import { AnalyticsTab } from "@/components/dashboard/cloudflare/AnalyticsTab";
import { SharedZoneContext } from "@/components/dashboard/cloudflare/shared-zone";
import {
  ZoneConfigPanel,
  type ZoneConfigView,
} from "@/components/dashboard/cloudflare/OperationsTab";
import { HostsView, type OpenConfig } from "@/components/dashboard/cloudflare/HostsView";
import { HistoryView } from "@/components/dashboard/cloudflare/HistoryView";
import {
  LoadBalancingConfigView,
  ManagedRulesView,
} from "@/components/dashboard/cloudflare/ConfigViews";
import { CfNavContext } from "@/components/dashboard/cloudflare/shared-zone";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/use-permissions";
import { useOrganizacao } from "@/lib/use-organizacao";
import { pickDefaultZone } from "@/lib/cloudflare-zones";

// Visões do módulo: as 3 abas fixas + as telas abertas pelo menu Ações
type TabView = "hosts" | "analytics" | "history";
type ExtraView = "managed" | "lb";
type ConfigKey = ZoneConfigView | ExtraView;
type View = TabView | ConfigKey;
type ConfigOpts = Parameters<OpenConfig>[1];

const CONFIG_TITLE: Record<ConfigKey, string> = {
  managed: "Managed rules",
  lb: "Load Balancing",
  dns: "Registros DNS",
  export: "Exportar DNS",
  "create-dns": "Adicionar registro DNS",
  rules: "Regras",
  waf: "Custom rules (WAF)",
  pagerules: "Page Rules",
  cache: "Desempenho de cache",
  purge: "Limpar cache",
};

const CSS = `
.cf-root { font-family:var(--font-ui); color:var(--v2-fg); font-size:14px; }
.cf-root * { box-sizing:border-box; }
.cf-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
.cf-stack { display:flex; flex-direction:column; gap:16px; min-width:0; }
.cf-top { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:14px; align-items:center; }
.cf-top h1 { margin:0; font-size:24px; font-weight:600; letter-spacing:-0.02em; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.cf-zone { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 8px 0 10px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font:500 13px var(--font-data); color:var(--v2-fg); cursor:pointer; max-width:280px; }
.cf-zone span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cf-search { display:flex; align-items:center; gap:8px; height:36px; padding:0 12px; border:1px solid var(--v2-line); border-radius:10px; background:var(--v2-surface); color:var(--v2-fg-3); max-width:520px; width:100%; justify-self:center; }
.cf-search input { border:0; outline:0; background:transparent; flex:1; min-width:0; color:var(--v2-fg); font:13.5px var(--font-ui); }
.cf-right { display:flex; gap:8px; align-items:center; }
@media (max-width:1000px) { .cf-top { grid-template-columns:minmax(0,1fr) auto; } .cf-search { grid-column:1 / -1; grid-row:2; max-width:none; } }
@media (max-width:560px) { .cf-top { grid-template-columns:minmax(0,1fr); } .cf-right { flex-wrap:wrap; } }
.cf-tabs2 { display:flex; align-items:center; gap:2px; border-bottom:1px solid var(--v2-line); overflow-x:auto; scrollbar-width:none; }
.cf-tabs2::-webkit-scrollbar { display:none; }
.cf-tabs2 > button { display:inline-flex; align-items:center; gap:7px; height:40px; padding:0 12px; border:0; background:transparent; color:var(--v2-fg-2); font:500 13.5px var(--font-ui); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
.cf-tabs2 > button:hover { color:var(--v2-fg); }
.cf-tabs2 > button[aria-current="true"] { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
.cf-tabs2 .cf-period { margin-left:auto; padding-bottom:4px; }
.cf-seg { display:inline-flex; padding:2px; gap:2px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; }
.cf-seg button { border:0; background:transparent; height:28px; padding:0 10px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-2); cursor:pointer; white-space:nowrap; }
.cf-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
.cf-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font:500 13px var(--font-ui); color:var(--v2-fg); cursor:pointer; white-space:nowrap; }
.cf-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
.cf-btn:disabled { opacity:.45; cursor:not-allowed; }
.cf-btn.sm { height:30px; padding:0 10px; font-size:12.5px; }
.cf-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
.cf-crumb { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--v2-fg-3); flex-wrap:wrap; }
.cf-crumb button { border:0; background:none; padding:0; color:var(--v2-accent); cursor:pointer; font:500 13px var(--font-ui); }
.cf-crumb b { color:var(--v2-fg); font-weight:500; }
.cf-subtabs { display:flex; gap:4px; border-bottom:1px solid var(--v2-line); overflow-x:auto; scrollbar-width:none; }
.cf-subtabs::-webkit-scrollbar { display:none; }
.cf-subtabs button { height:40px; padding:0 10px; border:0; background:transparent; color:var(--v2-fg-2); font:500 13.5px var(--font-ui); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
.cf-subtabs button[aria-selected="true"] { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
.cf-denied { padding:28px 16px; text-align:center; color:var(--v2-fg-3); border:1px dashed var(--v2-line-strong); border-radius:12px; font-size:13px; }
`;

export function CloudflareDashboardReal() {
  const org = useOrganizacao();
  const qc = useQueryClient();
  const { can, isModuleAdmin, isAdmin, loading: permLoading } = usePermissions();
  const cf = (a: string) => isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", a);
  const canHosts = cf("view");
  const canAnalytics = [
    "view_analytics_http",
    "view_analytics_security",
    "view_analytics_web",
    "view_analytics_loadbalancing",
  ].some(cf);
  const canHistory = cf("view_history");
  const CONFIG_PERM: Record<ConfigKey, boolean> = {
    managed: cf("manage_managed_rules"),
    lb: cf("manage_load_balancing"),
    dns: cf("manage_buscar_dns"),
    export: cf("manage_buscar_dns"),
    "create-dns": cf("manage_adicionar_dns"),
    rules: cf("manage_rules") && cf("manage_rules_overview"),
    waf: cf("manage_custom_rules"),
    pagerules: cf("manage_rules") && cf("manage_rules_page_rules"),
    cache: cf("manage_cache_performance"),
    purge: cf("manage_purge_cache"),
  };

  // ── zona ──
  const fetchZones = useServerFn(listCloudflareZones);
  const { data: zonesData } = useQuery({
    queryKey: ["cloudflare-zones-list"],
    queryFn: () => fetchZones(),
  });
  const zones = React.useMemo(
    () =>
      (
        zonesData as
          | { zones?: Array<{ id: string; name: string; status: string | null }> }
          | undefined
      )?.zones ?? [],
    [zonesData],
  );
  const [zoneId, setZoneId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("cloudflare_selected_zone") || null;
    } catch {
      return null;
    }
  });
  const [zoneOpen, setZoneOpen] = React.useState(false);
  function persistZone(id: string | null) {
    setZoneId(id);
    try {
      if (id) localStorage.setItem("cloudflare_selected_zone", id);
      else localStorage.removeItem("cloudflare_selected_zone");
    } catch {
      /* storage indisponível */
    }
  }
  React.useEffect(() => {
    if (zones.length === 0) return;
    // A zona salva pode ser de outra conta: só vale se o token enxerga ela
    if (zoneId && zones.some((z) => z.id === zoneId)) return;
    persistZone(pickDefaultZone(zones, org.dominio_corporativo)?.id ?? null);
  }, [zones, zoneId, org.dominio_corporativo]);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const syncZoneFn = useServerFn(syncCloudflareZone);
  async function selectZone(id: string) {
    persistZone(id);
    setZoneOpen(false);
    const name = zones.find((z) => z.id === id)?.name ?? id;
    const tid = toast.loading(`Sincronizando ${name}…`);
    try {
      const res = await syncZoneFn({ data: { zoneId: id } });
      if ("ok" in res && res.ok) {
        toast.success(`Sync de ${name}: ${res.dnsRecords} DNS, ${res.firewallEvents} eventos`, {
          id: tid,
        });
        qc.invalidateQueries({ queryKey: ["cf-zone-hosts"] });
      } else
        toast.error("Falha no sync: " + ("error" in res ? String(res.error) : ""), { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    }
  }

  // ── visão atual ──
  const [view, setView] = React.useState<View>(() => {
    try {
      const v = localStorage.getItem("cloudflare_view") as TabView | null;
      return v === "analytics" || v === "history" ? v : "hosts";
    } catch {
      return "hosts";
    }
  });
  const [configOpts, setConfigOpts] = React.useState<ConfigOpts>(undefined);
  const [configKey, setConfigKey] = React.useState(0);
  function go(v: View, opts?: ConfigOpts) {
    setView(v);
    setConfigOpts(opts);
    setConfigKey((k) => k + 1);
    if (v === "hosts" || v === "analytics" || v === "history") {
      try {
        localStorage.setItem("cloudflare_view", v);
      } catch {
        /* storage indisponível */
      }
    }
    window.scrollTo({ top: 0 });
  }
  const openConfig: OpenConfig = (v, opts) => go(v, opts);
  // Sem permissão para a aba salva, cai para a primeira liberada
  React.useEffect(() => {
    if (permLoading) return;
    const ok = (v: View) =>
      v === "hosts"
        ? canHosts
        : v === "analytics"
          ? canAnalytics
          : v === "history"
            ? canHistory
            : CONFIG_PERM[v];
    if (!ok(view)) {
      const first = (["hosts", "analytics", "history"] as TabView[]).find(ok);
      if (first) setView(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, canHosts, canAnalytics, canHistory]);

  const [days, setDays] = React.useState<1 | 3>(1);
  const [query, setQuery] = React.useState("");
  const isConfig = !(view === "hosts" || view === "analytics" || view === "history");

  const configItems: Array<[ConfigKey, string]> = [
    ["dns", "Registros DNS"],
    ["rules", "Regras"],
    ["waf", "Custom rules (WAF)"],
    ["pagerules", "Page Rules"],
    ["managed", "Managed rules"],
    ["lb", "Load Balancing"],
    ["cache", "Desempenho de cache"],
  ];
  const actionItems: Array<[ZoneConfigView, string]> = [
    ["purge", "Limpar cache"],
    ["export", "Exportar DNS"],
  ];
  const visibleConfig = configItems.filter(([v]) => CONFIG_PERM[v]);
  const visibleActions = actionItems.filter(([v]) => CONFIG_PERM[v]);

  return (
    <div className="cf-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SharedZoneContext.Provider value={zoneId}>
        <CfNavContext.Provider value={(v) => go(v)}>
          <div className="cf-stack">
            {/* ── Cabeçalho: título + zona, busca, sincronização e Ações ── */}
            <div className="cf-top">
              <h1>
                Cloudflare WAF
                <Popover open={zoneOpen} onOpenChange={setZoneOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="cf-zone"
                      role="combobox"
                      aria-expanded={zoneOpen}
                      aria-label="Trocar zona"
                    >
                      <Globe size={13} style={{ color: "var(--v2-fg-3)", flex: "none" }} />
                      <span>{zone ? zone.name : "Selecione uma zona"}</span>
                      <ChevronsUpDown size={13} style={{ color: "var(--v2-fg-3)", flex: "none" }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar zona…" />
                      <CommandList>
                        <CommandEmpty>Nenhuma zona encontrada.</CommandEmpty>
                        <CommandGroup>
                          {zones.map((z) => (
                            <CommandItem
                              key={z.id}
                              value={z.name}
                              onSelect={() => selectZone(z.id)}
                            >
                              <Check
                                size={14}
                                style={{ opacity: zoneId === z.id ? 1 : 0, color: "var(--v2-ok)" }}
                              />
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontFamily: "var(--font-data)",
                                  fontSize: 12.5,
                                }}
                              >
                                {z.name}
                              </span>
                              {z.status && (
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: 11.5,
                                    color: "var(--v2-fg-3)",
                                  }}
                                >
                                  {z.status}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </h1>
              {canHosts ? (
                <label className="cf-search">
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (view !== "hosts") go("hosts");
                    }}
                    placeholder="Buscar host ou conteúdo do registro…"
                    aria-label="Buscar host"
                  />
                </label>
              ) : (
                <span />
              )}
              <div className="cf-right">
                <SyncActions moduleSlug="cloudflare-waf" />
                {(visibleConfig.length > 0 || visibleActions.length > 0) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="cf-btn">
                        <Settings2 size={15} /> Ações <ChevronDown size={13} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {visibleConfig.length > 0 && (
                        <DropdownMenuLabel>Configurações da zona</DropdownMenuLabel>
                      )}
                      {visibleConfig.map(([v, l]) => (
                        <DropdownMenuItem key={v} onSelect={() => go(v)}>
                          {l}
                        </DropdownMenuItem>
                      ))}
                      {visibleConfig.length > 0 && visibleActions.length > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      {visibleActions.length > 0 && (
                        <DropdownMenuLabel>Ações na zona</DropdownMenuLabel>
                      )}
                      {visibleActions.map(([v, l]) => (
                        <DropdownMenuItem key={v} onSelect={() => go(v)}>
                          {l}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* ── Abas: Hosts · Analytics · Histórico ── */}
            <nav className="cf-tabs2" aria-label="Seções do módulo">
              {canHosts && (
                <button aria-current={view === "hosts"} onClick={() => go("hosts")}>
                  <Server size={15} /> Hosts
                </button>
              )}
              {canAnalytics && (
                <button aria-current={view === "analytics"} onClick={() => go("analytics")}>
                  <BarChart3 size={15} /> Analytics
                </button>
              )}
              {canHistory && (
                <button aria-current={view === "history"} onClick={() => go("history")}>
                  <History size={15} /> Histórico
                </button>
              )}
              {(view === "hosts" || view === "analytics") && (
                <span className="cf-period">
                  <span className="cf-seg" role="group" aria-label="Período">
                    {([1, 3] as const).map((n) => (
                      <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
                        {n === 1 ? "24 h" : "3 dias"}
                      </button>
                    ))}
                  </span>
                </span>
              )}
            </nav>

            {isConfig && (
              <div className="cf-crumb">
                <button
                  onClick={() => go(canHosts ? "hosts" : canAnalytics ? "analytics" : "history")}
                >
                  ← Voltar
                </button>
                <span>›</span>
                <span>
                  {actionItems.some(([v]) => v === view)
                    ? "Ações na zona"
                    : "Configurações da zona"}
                </span>
                <span>›</span>
                <b>{CONFIG_TITLE[view as ConfigKey]}</b>
              </div>
            )}

            {!zoneId ? (
              <div className="cf-denied">Selecione uma zona para começar.</div>
            ) : view === "hosts" && canHosts ? (
              <HostsView
                zoneId={zoneId}
                zoneName={zone?.name ?? null}
                days={days}
                query={query}
                onOpenConfig={openConfig}
              />
            ) : view === "analytics" && canAnalytics ? (
              <AnalyticsTab zoneId={zoneId} days={days} />
            ) : view === "history" && canHistory ? (
              <HistoryView zoneId={zoneId} zoneName={zone?.name ?? null} />
            ) : view === "managed" && CONFIG_PERM.managed ? (
              <ManagedRulesView zoneId={zoneId} />
            ) : view === "lb" && CONFIG_PERM.lb ? (
              <LoadBalancingConfigView zoneId={zoneId} />
            ) : isConfig && view !== "managed" && view !== "lb" ? (
              <ZoneConfigPanel
                key={`${view}-${configKey}`}
                view={view as ZoneConfigView}
                initialQuery={configOpts?.initialQuery}
                autoEditName={configOpts?.autoEditName}
                initialHosts={configOpts?.initialHosts}
                initialPurgeAll={configOpts?.initialPurgeAll}
                wafDraft={configOpts?.wafDraft}
              />
            ) : (
              <div className="cf-denied">Você não tem permissão para ver esta parte do módulo.</div>
            )}
          </div>
        </CfNavContext.Provider>
      </SharedZoneContext.Provider>
    </div>
  );
}
