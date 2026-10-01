// Server-only Gophish sync. Toda a computação pesada acontece aqui, no momento
// do sync — as funções de leitura apenas buscam o JSON pré-computado do banco.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await (supabaseAdmin as any).from("api_logs").insert({
      provider: "gophish",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* ignore */
  }
}

export type GophishSyncResult = {
  ok: boolean;
  counts?: { campaigns: number; groups: number; users: number; templates: number };
  error?: string;
};

// ─── Helpers (mesma lógica que estava em phishing.functions.ts) ───────────────

const STATUS_RANK: Record<string, number> = {
  "Email Sent": 1,
  "Email Opened": 2,
  "Clicked Link": 3,
  "Submitted Data": 4,
  "Email Reported": 1,
};

function classifyHierarchy(cargo: string | null | undefined): string {
  const c = (cargo || "").toLowerCase();
  if (!c) return "Outros";
  if (/diretor/.test(c)) return "Diretor";
  if (/gerente/.test(c)) return "Gerente";
  if (/coordenador/.test(c)) return "Coordenador";
  if (/supervisor/.test(c)) return "Supervisor";
  if (/lider|líder/.test(c)) return "Líder";
  if (/analista/.test(c)) return "Analista";
  if (/tecnic|técnic/.test(c)) return "Técnico";
  if (/assistente|auxiliar|estagi/.test(c)) return "Assistente";
  return "Outros";
}

function cleanCampaignName(name: string): string {
  return name.split("-")[0].trim();
}

// Remove todos os espaços (incluindo Unicode invisíveis) e normaliza para minúsculas
function normalizeEmail(raw: string): string {
  return raw.replace(/\s/g, "").toLowerCase();
}

// Busca todos os colaboradores com paginação — evita o limite padrão de 1000 rows do PostgREST
async function fetchAllColaboradores(): Promise<any[]> {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabaseAdmin as any)
      .from("colaboradores")
      .select("email, cargo, department_id")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Computação do overview ───────────────────────────────────────────────────

function buildOverview(
  campaigns: any[],
  templates: any[],
  colabs: any[] | null,
  depts: any[] | null,
  syncedAt: string,
) {
  const deptMap = new Map<string, string>((depts ?? []).map((d: any) => [d.id, d.name]));
  const colabMap = new Map<string, { cargo: string | null; dept: string }>();
  for (const c of colabs ?? []) {
    const email = normalizeEmail(String((c as any).email || ""));
    if (!email) continue;
    const deptName = (c as any).department_id
      ? (deptMap.get((c as any).department_id) ?? "Sem cadastro")
      : "Sem cadastro";
    colabMap.set(email, { cargo: (c as any).cargo ?? null, dept: deptName });
  }

  let sent = 0,
    opened = 0,
    clicked = 0,
    submitted = 0;
  const deptClicks = new Map<string, number>();
  const deptSubmit = new Map<string, number>();
  const hierarchy = new Map<string, number>();
  const templatesUsedMap = new Map<number, string>();
  let ativas = 0,
    arquivadas = 0;
  const details: any[] = [];

  for (const camp of campaigns) {
    const status = String(camp.status || "");
    if (/in progress|queued/i.test(status)) ativas++;
    else arquivadas++;
    if (camp.template?.id) templatesUsedMap.set(camp.template.id, camp.template.name);

    const results: any[] = Array.isArray(camp.results) ? camp.results : [];
    const perUser = new Map<string, { status: string; rank: number; submitted: boolean; clicked: boolean }>();
    for (const r of results) {
      const email = normalizeEmail(String(r.email || ""));
      if (!email) continue;
      const st = String(r.status || "");
      const rank = STATUS_RANK[st] ?? 0;
      const prev = perUser.get(email);
      if (!prev || rank > prev.rank) {
        perUser.set(email, {
          status: st,
          rank,
          submitted: st === "Submitted Data",
          clicked: st === "Clicked Link" || st === "Submitted Data",
        });
      } else {
        if (st === "Submitted Data") prev.submitted = true;
        if (st === "Clicked Link" || st === "Submitted Data") prev.clicked = true;
      }
    }

    for (const [email, info] of perUser) {
      const colab = colabMap.get(email);
      const cargo = colab?.cargo ?? "—";
      const dept = colab?.dept ?? "Sem cadastro";
      const nivel = classifyHierarchy(colab?.cargo);
      sent++;
      if (info.rank >= 2) opened++;
      if (info.clicked) {
        clicked++;
        deptClicks.set(dept, (deptClicks.get(dept) ?? 0) + 1);
      }
      if (info.submitted) {
        submitted++;
        deptSubmit.set(dept, (deptSubmit.get(dept) ?? 0) + 1);
      }
      hierarchy.set(nivel, (hierarchy.get(nivel) ?? 0) + 1);
      details.push({
        email,
        status: info.status,
        action: info.submitted
          ? "Dados Submetidos"
          : info.clicked
            ? "Clicou no Link"
            : info.rank >= 2
              ? "Abriu o E-mail"
              : "E-mail Enviado",
        cargo,
        departamento: dept,
        nivel,
        campanha: cleanCampaignName(String(camp.name || "")),
        template_id: camp.template?.id ?? null,
        launch_date: String(camp.launch_date || ""),
        opened: info.rank >= 2,
        clicked: info.clicked,
        submitted: info.submitted,
      });
    }
  }

  return {
    syncedAt,
    kpis: {
      sent,
      opened,
      clicked,
      submitted,
      openedPct: sent ? Math.round((opened / sent) * 1000) / 10 : 0,
      clickedPct: sent ? Math.round((clicked / sent) * 1000) / 10 : 0,
      compromisePct: sent ? Math.round((submitted / sent) * 1000) / 10 : 0,
    },
    byDepartmentClicks: [...deptClicks.entries()]
      .map(([dept, total]) => ({ dept, total }))
      .sort((a, b) => b.total - a.total),
    byDepartmentSubmitted: [...deptSubmit.entries()]
      .map(([dept, total]) => ({ dept, total }))
      .sort((a, b) => b.total - a.total),
    byHierarchy: [...hierarchy.entries()].map(([nivel, total]) => ({ nivel, total })).sort((a, b) => b.total - a.total),
    campaignsStatus: { ativas, arquivadas },
    templatesUsed: [...templatesUsedMap.entries()].map(([id, name]) => ({ id, name })),
    templatesTotal: Array.isArray(templates) ? templates.length : 0,
    details,
  };
}

// ─── Computação das operações ─────────────────────────────────────────────────

function buildOperations(campaigns: any[], groupsRaw: any[], usersRaw: any[], syncedAt: string) {
  const groups = groupsRaw.map((g: any) => ({
    id: g.id,
    name: g.name,
    targets: Array.isArray(g.targets) ? g.targets.length : 0,
    modified_date: g.modified_date,
    members: (Array.isArray(g.targets) ? g.targets : []).map((t: any) => ({
      email: t.email ?? "",
      first_name: t.first_name ?? "",
      last_name: t.last_name ?? "",
      position: t.position ?? "",
    })),
  }));

  const users = usersRaw.map((u: any) => ({
    id: u.id,
    username: u.username ?? u.email ?? String(u.id),
    role: u.role?.name ?? u.role ?? undefined,
  }));

  const runningCampaigns = campaigns
    .filter((c: any) => /in progress|queued/i.test(String(c.status || "")))
    .map((c: any) => {
      const results: any[] = Array.isArray(c.results) ? c.results : [];
      const counters = { sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 };
      const perUser = new Map<string, number>();
      for (const r of results) {
        const email = String(r.email || "").toLowerCase();
        const rank = STATUS_RANK[String(r.status || "")] ?? 0;
        if ((perUser.get(email) ?? 0) < rank) perUser.set(email, rank);
        if (r.reported || r.status === "Email Reported") counters.reported++;
      }
      for (const rank of perUser.values()) {
        counters.sent++;
        if (rank >= 2) counters.opened++;
        if (rank >= 3) counters.clicked++;
        if (rank >= 4) counters.submitted++;
      }
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        launch_date: c.launch_date,
        template: c.template?.name,
        counters,
      };
    });

  return { syncedAt, users, groups, runningCampaigns };
}

// ─── Sync principal ───────────────────────────────────────────────────────────

export async function runGophishSync(): Promise<GophishSyncResult> {
  const t0 = Date.now();
  const { getGophishCreds, gophishFetch } = await import("@/lib/gophish.server");
  const creds = await getGophishCreds();
  if (!creds) {
    await logApi("error", null, "Integração Gophish não configurada ou desativada.", Date.now() - t0);
    return { ok: false, error: "Integração Gophish não configurada ou desativada." };
  }

  const now = new Date().toISOString();

  try {
    // Busca paralela: Gophish + Supabase (colab/dept para enriquecimento)
    // fetchAllColaboradores pagina em lotes de 1000 para não perder registros
    const [[campaigns, templates, groups], colabs, { data: depts }] = await Promise.all([
      Promise.all([
        gophishFetch<any[]>(creds, "/api/campaigns/"),
        gophishFetch<any[]>(creds, "/api/templates/"),
        gophishFetch<any[]>(creds, "/api/groups/"),
      ]),
      fetchAllColaboradores(),
      (supabaseAdmin as any).from("departments").select("id, name"),
    ]);

    const users: any[] = await gophishFetch<any[]>(creds, "/api/users/").catch(() => []);

    const overview = buildOverview(campaigns ?? [], templates ?? [], colabs, depts ?? [], now);
    const operations = buildOperations(campaigns ?? [], groups ?? [], users, now);

    await (supabaseAdmin as any).from("gophish_cache").upsert(
      [
        { key: "campaigns", data: campaigns ?? [], synced_at: now, error: null },
        { key: "templates", data: templates ?? [], synced_at: now, error: null },
        { key: "groups", data: groups ?? [], synced_at: now, error: null },
        { key: "users", data: users, synced_at: now, error: null },
        { key: "overview", data: overview, synced_at: now, error: null },
        { key: "operations", data: operations, synced_at: now, error: null },
      ],
      { onConflict: "key" },
    );

    const counts = {
      campaigns: (campaigns ?? []).length,
      templates: (templates ?? []).length,
      groups: (groups ?? []).length,
      users: users.length,
    };
    await logApi(
      "success",
      200,
      `sync: ${counts.campaigns} campanhas / ${counts.templates} templates / ${counts.groups} grupos / ${counts.users} users`,
      Date.now() - t0,
    );
    return { ok: true, counts };
  } catch (e: any) {
    const cause = e?.cause?.message ?? e?.cause?.code ?? "";
    const msg = cause ? `${e?.message ?? "fetch failed"} — ${cause}` : (e?.message ?? "Erro ao sincronizar.");
    await logApi("error", null, msg, Date.now() - t0);
    await (supabaseAdmin as any)
      .from("gophish_cache")
      .upsert([{ key: "campaigns", synced_at: now, error: msg }], { onConflict: "key" })
      .catch(() => {});
    return { ok: false, error: msg };
  }
}
