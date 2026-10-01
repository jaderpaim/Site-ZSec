import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { recordCronRun } from "@/lib/cron-tracking.server";
import type { Database } from "@/integrations/supabase/types";

type SupabaseAny = ReturnType<typeof makeSupabase>;

// Cliente Supabase priorizando service_role (bypassa RLS server-side).
// `fallback` é o context.supabase do middleware requireSupabaseAuth — já
// autenticado com o token do usuário, então não há necessidade de ler o
// header da requisição de novo aqui (isso exigiria importar getRequest do
// @tanstack/react-start/server, que o bundler do client não consegue
// remover quando o helper fica fora do .handler()).
function makeSupabase(fallback: SupabaseClient<Database>) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient<Database>(process.env.SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return fallback;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type PolicyRow = {
  id: string;
  name: string | null;
  policy_type: string | null;
  assigned_count: number | null;
  raw?: unknown;
};

// Mesmas 4 categorias do painel "Status de atividade do computador" da
// Sophos Central: Ativo (<14 dias), Inativo 2+ Semanas (14-59 dias),
// Inativo 2+ Meses (60+ dias), Não Protegido (health_overall unknown/null).
export type DeviceBreakdown = {
  total: number;
  active: number;
  inactive2w: number;
  inactive2m: number;
  notProtected: number;
};

export type SophosEncryptionBreakdown = {
  endpoints: { encrypted: number; unencrypted: number; rate: number };
  servers: { encrypted: number; unencrypted: number; rate: number };
  total: { encrypted: number; unencrypted: number; rate: number };
  // Sem cripto (endpoints, exclui servidor), por classe de equipamento —
  // classificado via convenção de hostname (NB/NL/NMTD = notebook).
  unencryptedByDeviceClass: { desktop: number; notebook: number };
  // Licença "Central Device Encryption" (product.code = "CDE"): contratado
  // x em uso, direto da Licensing API da Sophos. null se não sincronizado.
  license: { quantity: number; used: number } | null;
};

// Dados rápidos (uma única RPC de agregação) — alimentam KPIs, evolutivo,
// tipos, dispositivos, criptografia e top usuários. Carregam juntos pois
// vêm da mesma chamada ao banco; políticas e detecções (mais pesadas) ficam
// em funções separadas para não bloquear o resto do dashboard.
export type SophosCore = {
  ok: true;
  tenantId: string;
  lastSyncAt: string | null;
  totals: {
    threatsTotal: number;
    threatsEndpoints: number;
    threatsServers: number;
    alertsTotal: number;
    alertsRed: number;
    alertsYellow: number;
    endpoints: number;
    servers: number;
    encryptionRate: number;
    encryptedDevices: number;
    unencryptedDevices: number;
  };
  endpoints: DeviceBreakdown;
  servers: DeviceBreakdown;
  encryption: SophosEncryptionBreakdown;
  detectionTypes: Array<{ name: string; value: number }>;
  topUsers: Array<{ user: string; count: number }>;
  series: Array<{ d: string; blocked: number; detected: number }>;
};

export type SophosPolicies = {
  ok: true;
  policies: Array<{ id: string; name: string; policy_type: string; assigned_count: number }>;
  endpointPolicies: number;
  serverPolicies: number;
};

export type SophosDetections = {
  ok: true;
  recentDetections: Array<{
    ts: string;
    host: string;
    user: string;
    type: string;
    threat: string;
    action: string;
    severity: "low" | "medium" | "high";
  }>;
};

export type SophosAuditEvents = {
  ok: true;
  auditEvents: Array<{
    id: string;
    occurredAt: string;
    modifiedBy: string;
    description: string;
    itemType: string | null;
    itemModified: string | null;
    modifierType: string | null;
    originIpAddress: string | null;
  }>;
};

export type SophosNotProtected = {
  ok: true;
  notProtectedEndpoints: Array<{ hostname: string }>;
  notProtectedServers: Array<{ hostname: string }>;
};

export type SophosEncryptionDetail = {
  ok: true;
  encryption: SophosEncryptionBreakdown;
  unencryptedList: Array<{ hostname: string; type: string | null }>;
};

export type SophosError = { ok: false; error: string };

function asDate(value?: string | null, fallback?: Date) {
  if (!value) return fallback ?? null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (fallback ?? null) : d;
}

// "Todos os períodos" manda from = 1970-01-01 — clampamos para a janela real
// dos dados antes de chamar RPCs/queries com filtro de data.
async function resolveDateRange(supabase: SupabaseAny, from?: string, to?: string) {
  let toDate = asDate(to, new Date()) ?? new Date();
  let fromDate = asDate(from, new Date(toDate.getTime() - 30 * DAY_MS)) ?? new Date(toDate.getTime() - 30 * DAY_MS);

  try {
    if (fromDate.getFullYear() < 2010) {
      const [{ data: ar }, { data: ev }] = await Promise.all([
        supabase
          .from("sophos_alerts")
          .select("raised_at")
          .order("raised_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("sophos_events").select("event_at").order("event_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      const candidates: Date[] = [];
      if (ar?.raised_at) candidates.push(new Date(ar.raised_at));
      if (ev?.event_at) candidates.push(new Date(ev.event_at));
      fromDate =
        candidates.length > 0
          ? new Date(Math.min(...candidates.map((d) => d.getTime())))
          : new Date(toDate.getTime() - 365 * DAY_MS);
    }
    if (toDate.getTime() > Date.now() + 60_000) toDate = new Date();
  } catch {
    /* keep original bounds on failure */
  }

  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

// Agrega criptografia direto no banco — evita limite de 1000 rows do Supabase
async function fetchEncryptionBreakdown(supabase: SupabaseAny): Promise<SophosEncryptionBreakdown> {
  const [{ data }, { data: deviceClassData }, { data: licenseRow }] = await Promise.all([
    supabase.rpc("sophos_encryption_summary"),
    supabase.rpc("sophos_unencrypted_device_class" as any),
    supabase.from("sophos_licenses" as any).select("quantity, usage_count").eq("product_code", "CDE").maybeSingle(),
  ]);
  const encRows = (data ?? []) as Array<{
    category: string;
    encrypted: boolean | null;
    assigned: boolean | null;
    total: number;
  }>;
  // packages.encryption.status (assigned/unassigned/unsupported) é sobre
  // licenciamento/aplicabilidade da política — não é o sinal que a Sophos
  // usa no painel "Status da criptografia". Lá, qualquer overallStatus
  // diferente de "encrypted" (não gerenciado, não disponível, sem dado)
  // conta como "pode estar criptografado", então contamos do mesmo jeito
  // aqui: todo dispositivo entra no total, só quem está com encrypted=true
  // sai do lado "sem cripto".
  const sumWhere = (cat: string, pred: (enc: boolean | null) => boolean) =>
    encRows.filter((r) => r.category === cat && pred(r.encrypted)).reduce((s, r) => s + r.total, 0);

  // Endpoints
  const epEncrypted = sumWhere("endpoint", (enc) => enc === true);
  const epUnencrypted = sumWhere("endpoint", (enc) => enc !== true);
  const epTotal = epEncrypted + epUnencrypted;
  const epRate = epTotal > 0 ? Math.round((epEncrypted / epTotal) * 100) : 0;

  // Servidores
  const svEncrypted = sumWhere("server", (enc) => enc === true);
  const svUnencrypted = sumWhere("server", (enc) => enc !== true);
  const svTotal = svEncrypted + svUnencrypted;
  const svRate = svTotal > 0 ? Math.round((svEncrypted / svTotal) * 100) : 0;

  // Total
  const totEncrypted = epEncrypted + svEncrypted;
  const totUnencrypted = epUnencrypted + svUnencrypted;
  const totTotal = totEncrypted + totUnencrypted;
  const totRate = totTotal > 0 ? Math.round((totEncrypted / totTotal) * 100) : 0;

  const classRows = (deviceClassData ?? []) as unknown as Array<{ device_class: string; total: number }>;
  const desktopUnencrypted = classRows.find((r) => r.device_class === "desktop")?.total ?? 0;
  const notebookUnencrypted = classRows.find((r) => r.device_class === "notebook")?.total ?? 0;

  const licenseData = licenseRow as unknown as { quantity: number | null; usage_count: number | null } | null;
  const license = licenseData ? { quantity: licenseData.quantity ?? 0, used: licenseData.usage_count ?? 0 } : null;

  return {
    endpoints: { encrypted: epEncrypted, unencrypted: epUnencrypted, rate: epRate },
    servers: { encrypted: svEncrypted, unencrypted: svUnencrypted, rate: svRate },
    total: { encrypted: totEncrypted, unencrypted: totUnencrypted, rate: totRate },
    unencryptedByDeviceClass: { desktop: desktopUnencrypted, notebook: notebookUnencrypted },
    license,
  };
}

function inferPolicyType(
  raw: Record<string, unknown> | null | undefined,
  rawType: string | undefined,
  storedType: string | null | undefined,
): "endpoint" | "server" {
  if (rawType?.startsWith("server-")) return "server";
  if (storedType === "server") return "server";
  const at = (raw?.appliesTo ?? {}) as Record<string, unknown>;
  if (raw?.appliesToAllServers === true) return "server";
  if (
    Array.isArray((at as Record<string, unknown[]>).serverGroups) &&
    ((at as Record<string, unknown[]>).serverGroups?.length ?? 0) > 0
  )
    return "server";
  if (
    Array.isArray((at as Record<string, unknown[]>).servers) &&
    ((at as Record<string, unknown[]>).servers?.length ?? 0) > 0
  )
    return "server";
  return "endpoint";
}

function inferredAssignedCount(raw: Record<string, unknown> | null | undefined, fallback: number | null | undefined) {
  const appliesTo = (raw?.appliesTo ?? {}) as Record<string, unknown[]>;
  const keys = ["endpoints", "users", "userGroups", "computerGroups", "serverGroups"] as const;
  const fromRaw = keys.reduce((sum, key) => sum + (Array.isArray(appliesTo[key]) ? appliesTo[key].length : 0), 0);
  return Math.max(fallback ?? 0, fromRaw);
}

const SUBKIND_PT: Record<string, string> = {
  "threat-protection": "Proteção contra Ameaças",
  "server-threat-protection": "Proteção contra Ameaças",
  "web-control": "Controle da Web",
  "server-web-control": "Controle da Web",
  "application-control": "Controle de Aplicativos",
  "server-application-control": "Controle de Aplicativos",
  "peripheral-control": "Controle de Periféricos",
  "server-peripheral-control": "Controle de Periféricos",
  "device-encryption": "Criptografia de Dispositivo",
  "server-lockdown": "Lockdown",
  "agent-updating": "Atualização de Agentes",
  "server-agent-updating": "Atualização de Agentes",
  "data-collection-and-investigation": "Coleta e Investigação",
  "server-data-collection-and-investigation": "Coleta e Investigação",
  "server-file-integrity-monitoring": "Monitoramento de Integridade de Arquivos",
  "server-linux-runtime-detection": "Detecção de Runtime Linux",
  "windows-firewall": "Firewall Windows",
  "server-windows-firewall": "Firewall Windows",
};

function cleanPolicy(rawName: string | null, rawType: string | undefined, kind: "endpoint" | "server") {
  const base = (rawName ?? "Base Policy").replace(/\s+/g, " ").replace(/::.*$/, "").trim();
  const subtype = (rawType ?? "").trim().toLowerCase();
  const isBase = /base policy/i.test(base);
  const kindSuffix = isBase ? (kind === "server" ? " · Servidor" : " · Endpoint") : "";
  if (!subtype) return (base || "Base Policy") + kindSuffix;
  return `${base || "Base Policy"} — ${
    SUBKIND_PT[subtype] ??
    subtype
      .replace(/^server-/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }${kindSuffix}`;
}

export const syncSophosData = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { fullResync?: boolean } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isAnalista } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "analista",
    });
    if (!isAdmin && !isAnalista) throw new Error("Forbidden");
    const { runSophosSync } = await import("./sophos.server");
    const started = Date.now();
    const result = await runSophosSync({ fullResync: data.fullResync });
    await recordCronRun("sophos-sync", "manual", {
      ok: result.ok,
      error: result.ok ? null : result.error,
      durationMs: Date.now() - started,
    });
    return result;
  });

// Sincronização de auditoria independente da de cima (credencial e cron
// próprios) — disparada junto pelo mesmo botão "Sincronizar Agora", mas sem
// travar o resultado da sincronização principal se essa falhar.
export const syncSophosAuditData = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isAnalista } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "analista",
    });
    if (!isAdmin && !isAnalista) throw new Error("Forbidden");
    const { runSophosAuditSync } = await import("./sophos.server");
    const started = Date.now();
    const result = await runSophosAuditSync();
    await recordCronRun("sophos-audit-sync", "manual", {
      ok: result.ok,
      error: result.ok ? null : result.error,
      durationMs: Date.now() - started,
    });
    return result;
  });

type RpcOverview = {
  totals: {
    threatsEndpoints: number;
    threatsServers: number;
    threatsTotal: number;
    alertsTotal: number;
    alertsRed: number;
    alertsYellow: number;
    endpoints: number;
    servers: number;
    encryptedDevices: number;
    unencryptedDevices: number;
    encryptionRate: number;
  };
  endpoints: DeviceBreakdown;
  servers: DeviceBreakdown;
  detectionTypes: Array<{ name: string; value: number }>;
  topUsers: Array<{ user: string; count: number }>;
  series: Array<{ d: string; blocked: number; detected: number }>;
  bucketUnit: "day" | "week" | "month";
};

// Núcleo rápido do dashboard: uma única RPC de agregação no banco
// (sophos_overview) + resumo de criptografia. Não inclui listas de
// linhas (políticas, detecções, hosts sem proteção) — isso fica em
// funções próprias para o front poder carregar cada bloco de forma
// independente, sem travar a tela inteira numa resposta gigante.
export const getSophosCore = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { from?: string; to?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }): Promise<SophosCore | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      const { fromIso, toIso } = await resolveDateRange(supabase, data.from, data.to);

      const [rpcRes, syncStateRes, encryption] = await Promise.all([
        supabase.rpc("sophos_overview", { from_ts: fromIso, to_ts: toIso }),
        supabase.from("sophos_sync_state").select("tenant_id, last_full_sync_at").limit(1).maybeSingle(),
        fetchEncryptionBreakdown(supabase),
      ]);

      if (rpcRes.error) return { ok: false, error: rpcRes.error.message };
      if (syncStateRes.error) return { ok: false, error: syncStateRes.error.message };

      const overview = rpcRes.data as RpcOverview;

      return {
        ok: true,
        tenantId: syncStateRes.data?.tenant_id ?? "—",
        lastSyncAt: syncStateRes.data?.last_full_sync_at ?? null,
        totals: {
          threatsTotal: overview.totals.threatsTotal,
          threatsEndpoints: overview.totals.threatsEndpoints,
          threatsServers: overview.totals.threatsServers,
          alertsTotal: overview.totals.alertsTotal,
          alertsRed: overview.totals.alertsRed,
          alertsYellow: overview.totals.alertsYellow,
          endpoints: overview.endpoints.total,
          servers: overview.servers.total,
          encryptionRate: overview.totals.encryptionRate,
          encryptedDevices: overview.totals.encryptedDevices,
          unencryptedDevices: overview.totals.unencryptedDevices,
        },
        endpoints: overview.endpoints,
        servers: overview.servers,
        encryption,
        detectionTypes: overview.detectionTypes,
        topUsers: overview.topUsers,
        series: overview.series,
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Lista de políticas — independente do filtro de período, então o front
// pode cachear por mais tempo e não precisa refazer essa busca (que inclui
// parsing do campo raw) a cada troca de data.
export const getSophosPolicies = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<SophosPolicies | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      // Total real de dispositivos (não filtrado por criptografia) — usado só
      // como fallback de "Base Policy" abaixo. count:"exact",head:true não
      // sofre o limite padrão de 1000 linhas do PostgREST.
      const [policiesRes, endpointCountRes, serverCountRes] = await Promise.all([
        supabase
          .from("sophos_policies")
          .select("id, name, policy_type, assigned_count, raw")
          .order("name", { ascending: true }),
        supabase.from("sophos_endpoints").select("*", { count: "exact", head: true }).neq("type", "server"),
        supabase.from("sophos_endpoints").select("*", { count: "exact", head: true }).eq("type", "server"),
      ]);

      if (policiesRes.error) return { ok: false, error: policiesRes.error.message };

      const policies = (policiesRes.data ?? []) as PolicyRow[];
      const totalEndpointCount = endpointCountRes.count ?? 0;
      const totalServerCount = serverCountRes.count ?? 0;

      const policiesOut = policies
        .map((policy) => {
          const raw = (policy.raw ?? {}) as Record<string, unknown>;
          const rawType = typeof raw.type === "string" ? raw.type : undefined;
          const inferredType = inferPolicyType(raw, rawType, policy.policy_type);
          // Base Policy applies to all devices when no explicit appliesTo entries
          const at = (raw.appliesTo ?? {}) as Record<string, unknown[]>;
          const explicit = inferredAssignedCount(raw, policy.assigned_count);
          const isBase =
            /base policy/i.test(policy.name ?? "") ||
            raw.appliesToAllEndpoints === true ||
            raw.appliesToAllServers === true;
          const noExplicitTargets =
            (!Array.isArray(at.endpoints) || at.endpoints.length === 0) &&
            (!Array.isArray(at.users) || at.users.length === 0) &&
            (!Array.isArray(at.computerGroups) || at.computerGroups.length === 0) &&
            (!Array.isArray(at.serverGroups) || at.serverGroups.length === 0);
          const fallback = inferredType === "server" ? totalServerCount : totalEndpointCount;
          const assigned = isBase && noExplicitTargets ? Math.max(explicit, fallback) : explicit;
          return {
            id: policy.id,
            name: cleanPolicy(policy.name, rawType, inferredType),
            policy_type: inferredType,
            assigned_count: assigned,
          };
        })
        .sort((a, b) => b.assigned_count - a.assigned_count || a.name.localeCompare(b.name));

      return {
        ok: true,
        policies: policiesOut,
        endpointPolicies: policiesOut.filter((policy) => policy.policy_type === "endpoint").length,
        serverPolicies: policiesOut.filter((policy) => policy.policy_type === "server").length,
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Detecções recentes (até 500 linhas) — a busca mais pesada do módulo;
// fica isolada para não travar KPIs/gráficos enquanto carrega.
export const getSophosDetections = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { from?: string; to?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }): Promise<SophosDetections | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      const { fromIso, toIso } = await resolveDateRange(supabase, data.from, data.to);

      const recentRes = await supabase
        .from("sophos_alerts")
        .select("raised_at, severity, category, type, description, managed_agent_name, person_name")
        .gte("raised_at", fromIso)
        .lte("raised_at", toIso)
        .order("raised_at", { ascending: false })
        .limit(500);

      if (recentRes.error) return { ok: false, error: recentRes.error.message };

      const recentDetections = (recentRes.data ?? []).map((item) => {
        const sev = (item.severity ?? "").toLowerCase();
        const severity: "low" | "medium" | "high" =
          sev === "high" || sev === "critical" ? "high" : sev === "medium" ? "medium" : "low";
        return {
          ts: item.raised_at ?? "",
          host: item.managed_agent_name ?? "—",
          user: item.person_name ?? "—",
          type: item.category ?? item.type ?? "—",
          threat: item.description ?? item.type ?? "—",
          action: severity === "high" ? "Bloqueado" : "Detectado",
          severity,
        };
      });

      return { ok: true, recentDetections };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Detalhamento das ameaças de UM usuário (drill-down do Top 10 Usuários com
// Ameaças). Lê sophos_events por user_normalized dentro do período.
type SophosThreatRow = {
  ts: string;
  name: string;
  type: string;
  category: string;
  severity: string;
  host: string;
};

export const getSophosThreatsByUser = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { user: string; from?: string; to?: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true; user: string; threats: SophosThreatRow[] } | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      const { fromIso, toIso } = await resolveDateRange(supabase, data.from, data.to);

      // Exceções: nomes de evento que não são ameaças (exato/contém) — excluídos.
      // Só as de target="event" — as de target="user" tiram o usuário
      // inteiro do Top 10 (aplicado na RPC get_sophos_top_users_threats),
      // não fazem sentido aqui filtrando por nome de evento.
      // Tabela nova (fora do types.ts gerado) → cast no client tipado.
      const { data: exData } = await (supabase as unknown as { from: (t: string) => any })
        .from("sophos_excecoes")
        .select("event_name, match_type")
        .eq("target", "event");
      const exRows = (exData ?? []) as Array<{ event_name: string | null; match_type: string }>;
      const exExact = new Set(
        exRows.filter((x) => x.match_type === "exact").map((x) => (x.event_name ?? "").toLowerCase().trim()),
      );
      const exContains = exRows
        .filter((x) => x.match_type === "contains")
        .map((x) => (x.event_name ?? "").toLowerCase().trim())
        .filter(Boolean);
      const isExcecao = (name: string) => {
        const n = (name ?? "").toString().toLowerCase().trim();
        if (exExact.has(n)) return true;
        return exContains.some((p) => n.includes(p));
      };

      // Busca mais que 300 porque parte é filtrada pelas exceções antes de cortar.
      const res = await supabase
        .from("sophos_events")
        .select("event_at, name, type, detection_category, severity, endpoint_name")
        .eq("user_normalized", data.user)
        .gte("event_at", fromIso)
        .lte("event_at", toIso)
        .order("event_at", { ascending: false })
        .limit(3000);
      if (res.error) return { ok: false, error: res.error.message };
      const threats: SophosThreatRow[] = (res.data ?? [])
        .filter((e) => !isExcecao(e.name ?? ""))
        .slice(0, 300)
        .map((e) => ({
          ts: e.event_at ?? "",
          name: e.name ?? "—",
          type: e.type ?? "—",
          category: e.detection_category ?? "—",
          severity: (e.severity ?? "").toString(),
          host: e.endpoint_name ?? "—",
        }));
      return { ok: true, user: data.user, threats };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Top 10 usuários com ameaças (sophos_events) já EXCLUINDO as exceções configuradas
// — de evento (nome da ameaça) e de usuário (contas de sistema/serviço como
// "SISTEMA"/"n/a"/"autologon_*") — via RPC get_sophos_top_users_threats.
// Base do ranking + contagem do Top 10.
export const getSophosTopUsers = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { from?: string; to?: string } | undefined) => data ?? {})
  .handler(
    async ({ data, context }): Promise<{ ok: true; users: Array<{ user: string; count: number }> } | SophosError> => {
      await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
      const supabase = makeSupabase(context.supabase);
      try {
        const { fromIso, toIso } = await resolveDateRange(supabase, data.from, data.to);
        const { data: rows, error } = await supabase.rpc(
          "get_sophos_top_users_threats" as never,
          {
            from_ts: fromIso,
            to_ts: toIso,
          } as never,
        );
        if (error) return { ok: false, error: error.message };
        const users = ((rows ?? []) as Array<{ user_normalized: string; cnt: number | string }>).map((r) => ({
          user: r.user_normalized,
          count: Number(r.cnt ?? 0),
        }));
        return { ok: true, users };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  );

// Audit Log (ações administrativas: login, mudança de política, criação de
// service principal, etc.) — sincronizado por runSophosAuditSync usando uma
// credencial separada (role "Service Principal Audit Log" no Sophos Central).
export const getSophosAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { from?: string; to?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }): Promise<SophosAuditEvents | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      const { fromIso, toIso } = await resolveDateRange(supabase, data.from, data.to);

      const auditRes = await supabase
        .from("sophos_audit_events")
        .select("id, occurred_at, modified_by, description, item_type, item_modified, modifier_type, origin_ip_address")
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso)
        .order("occurred_at", { ascending: false })
        .limit(500);

      if (auditRes.error) return { ok: false, error: auditRes.error.message };

      const auditEvents = (auditRes.data ?? []).map((item) => ({
        id: item.id,
        occurredAt: item.occurred_at ?? "",
        modifiedBy: item.modified_by ?? "—",
        description: item.description ?? "—",
        itemType: item.item_type,
        itemModified: item.item_modified,
        modifierType: item.modifier_type,
        originIpAddress: item.origin_ip_address,
      }));

      return { ok: true, auditEvents };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Hosts sem proteção (até 1000 por categoria) — usado só no tooltip de
// hover do bloco "Status dos Dispositivos". Independente do período;
// buscado em segundo plano, sem bloquear nenhum bloco.
export const getSophosNotProtected = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<SophosNotProtected | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      // "Não protegido" = sem o produto endpointProtection instalado (ver
      // migration 20260629200000). Total de dispositivos passa de 1000
      // (limite padrão do PostgREST), então paginamos com .range().
      type Row = { hostname: string | null; type: string | null; assignedProducts: unknown };
      const rows: Row[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("sophos_endpoints")
          .select("hostname, type, assignedProducts:raw->assignedProducts")
          .order("hostname", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) return { ok: false, error: error.message };
        rows.push(...((data ?? []) as Row[]));
        if (!data || data.length < pageSize) break;
        offset += pageSize;
      }

      const notProtRows = rows.filter((r) => {
        const products = (r.assignedProducts ?? []) as Array<{ code?: string; status?: string }>;
        return !products.some((p) => p.code === "endpointProtection" && p.status === "installed");
      });
      return {
        ok: true,
        notProtectedEndpoints: notProtRows
          .filter((r) => (r.type ?? "").toLowerCase() !== "server")
          .map((r) => ({ hostname: r.hostname ?? "—" })),
        notProtectedServers: notProtRows
          .filter((r) => (r.type ?? "").toLowerCase() === "server")
          .map((r) => ({ hostname: r.hostname ?? "—" })),
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

// Usado apenas pelo dashboard de Não Conformidade (tiles de criptografia +
// lista de não criptografados). Antes vinha embutido no overview do Sophos
// e era buscado (e descartado) em toda carga do módulo Sophos XDR.
export const getSophosEncryptionDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<SophosEncryptionDetail | SophosError> => {
    await requirePermission(context.supabase, context.userId, "sophos-xdr", "view");
    const supabase = makeSupabase(context.supabase);

    try {
      const [encryption, unencRes] = await Promise.all([
        fetchEncryptionBreakdown(supabase),
        supabase
          .from("sophos_endpoints")
          .select("hostname, type")
          .eq("encrypted", false)
          .neq("type", "server")
          .order("hostname", { ascending: true })
          .limit(1000),
      ]);

      if (unencRes.error) return { ok: false, error: unencRes.error.message };

      const unencryptedList = (unencRes.data ?? [])
        .filter((item) => (item.type ?? "").toLowerCase() !== "server")
        .map((item) => ({ hostname: item.hostname ?? "—", type: item.type }));

      return { ok: true, encryption, unencryptedList };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
