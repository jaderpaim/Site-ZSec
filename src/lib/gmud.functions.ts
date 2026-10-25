import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import {
  buildGmudApprovedHtml,
  buildGmudRejectedHtml,
  buildGmudApprovalRequestHtml,
  fmtDate,
} from "./email-templates.defaults";
import { requirePermission, requireAdminOrAnalista, hasPermission } from "@/lib/authz";
import { APP_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/mailer.server";
import { allowedStatusTransitions, isGerenciaTiName, requiresGerenciaTi } from "@/lib/gmud-rules";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ─── Helper: registra evento no gmud_logs ────────────────────────────────────
async function logGmud(
  sb: ReturnType<typeof admin>,
  opts: {
    gmud_id?: string | null;
    gmud_titulo?: string | null;
    tipo_evento:
      | "criacao"
      | "aprovacao"
      | "rejeicao"
      | "mudanca_status"
      | "exclusao"
      | "email_enviado"
      | "email_erro"
      | "erro";
    descricao: string;
    usuario_email?: string | null;
    usuario_nome?: string | null;
    status: "success" | "error" | "warning" | "info";
    detalhes?: Record<string, unknown> | null;
  },
) {
  try {
    const { error } = await sb.from("gmud_logs").insert({
      gmud_id: opts.gmud_id ?? null,
      gmud_titulo: opts.gmud_titulo ?? null,
      tipo_evento: opts.tipo_evento,
      descricao: opts.descricao,
      usuario_email: opts.usuario_email ?? null,
      usuario_nome: opts.usuario_nome ?? null,
      status: opts.status,
      detalhes: opts.detalhes ?? null,
    });
    if (error) console.error("logGmud insert error", error);
  } catch (e) {
    console.error("logGmud failed", e);
  }
}

const CreateGmudSchema = z.object({
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  justificativa: z.string().max(5000).optional().nullable(),
  tipo: z.enum(["Normal", "Prioritária", "Emergencial"]),
  impacto: z.enum(["Baixo", "Médio", "Alto", "Crítico"]),
  data_inicio: z.string().optional().nullable(),
  data_fim: z.string().optional().nullable(),
  plano_execucao: z.string().max(20000).optional().nullable(),
  plano_rollback: z.string().max(20000).optional().nullable(),
  department_id: z.string().uuid(),
  extra_department_ids: z.array(z.string().uuid()).optional().nullable(),
});

/** Busca nome/e-mail de perfis em lote, indexado por id. */
async function fetchProfilesById(
  sb: ReturnType<typeof admin>,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const map = new Map<string, { full_name: string | null; email: string | null }>();
  if (ids.length === 0) return map;
  const { data } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
  for (const p of data ?? []) map.set(p.id, { full_name: p.full_name, email: p.email });
  return map;
}

/**
 * Quem está agindo, sempre a partir da sessão (nunca do corpo da requisição):
 * é o que vai para o histórico da GMUD.
 */
async function getActor(
  sb: ReturnType<typeof admin>,
  userId: string,
  claims: unknown,
): Promise<{ email: string | null; nome: string | null }> {
  const profile = (await fetchProfilesById(sb, [userId])).get(userId);
  const claimEmail = (claims as { email?: string } | undefined)?.email ?? null;
  return {
    email: (profile?.email ?? claimEmail)?.toLowerCase() ?? null,
    nome: profile?.full_name ?? null,
  };
}

type AprRow = {
  id: string;
  ordem: number;
  papel: string | null;
  status_aprovacao: string;
  department_id?: string | null;
  notificado_em?: string | null;
  lembrado_em?: string | null;
  [key: string]: unknown;
};

/**
 * Agrupa aprovadores em "grupos de decisão": qualquer aprovação dentro do
 * grupo libera o grupo inteiro (os demais membros ficam "Dispensado"). Um
 * grupo é formado SÓ por aprovadores do MESMO departamento com o MESMO papel
 * (ex: Juliana(SI,1,Analista) e Paulo(SI,3,Analista) — o Paulo é backup da
 * Juliana). Papel igual em departamentos diferentes NÃO forma grupo: cada
 * departamento aprova pelo seu escopo, em sequência (ex: SI(1,Analista) e
 * depois Infra(1,Analista)). Linhas antigas sem department_id ficam sozinhas.
 * O número de grupos é o total de decisões REALMENTE necessárias (ex: "2/2"
 * mesmo que existam 3 linhas, se duas formarem um grupo).
 */
function computeDecisionGroups<T extends AprRow>(rows: T[]): T[][] {
  const sorted = [...rows].sort((a, b) => a.ordem - b.ordem);
  const groups = new Map<string, T[]>();
  for (const r of sorted) {
    const key = r.department_id && r.papel ? `${r.department_id}|${r.papel}` : `solo|${r.id}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return [...groups.values()].sort((a, b) => a[0].ordem - b[0].ordem);
}

/** Primeiro grupo de decisão ainda sem aprovação e com alguém pendente. */
function currentDecisionGroup<T extends AprRow>(rows: T[]): T[] | undefined {
  return computeDecisionGroups(rows).find(
    (g) =>
      !g.some((m) => m.status_aprovacao === "Aprovado") &&
      g.some((m) => m.status_aprovacao === "Pendente"),
  );
}

/**
 * IDs dos aprovadores que podem decidir agora: só quem foi notificado (recebeu
 * o e-mail) dentro do grupo da vez. O backup do mesmo departamento+papel só
 * entra quando o escalonamento por inatividade o notifica — e aí quem ficou
 * parado é dispensado, perdendo a vez. Se a notificação inicial falhou
 * (ninguém com notificado_em), o primeiro pendente do grupo fica ativo.
 * Retorna vazio se não há grupo em aberto.
 */
function getActiveWaveIds(rows: AprRow[]): Set<string> {
  const current = currentDecisionGroup(rows);
  if (!current) return new Set();
  const pendentes = current.filter((m) => m.status_aprovacao === "Pendente");
  if (pendentes.length === 0) return new Set();
  const notificados = pendentes.filter((m) => m.notificado_em);
  const ativos = notificados.length
    ? notificados
    : [[...pendentes].sort((a, b) => a.ordem - b.ordem)[0]];
  return new Set(ativos.map((m) => m.id));
}

/**
 * Filtra os aprovadores expostos ao cliente: decisões reais (Aprovado/
 * Rejeitado) sempre aparecem; "Pendente" só aparece se for membro da onda
 * ativa agora. "Cancelado"/"Dispensado" nunca são expostos aqui — ninguém vê
 * quem nunca chegou a ser chamado, nem antes nem depois do desfecho. O
 * histórico completo continua disponível só via Logs/Auditoria (gmud_logs).
 */
/** Admin global ou admin do módulo "gmud" — únicos com visão da cadência completa (oversight/auditoria). */
async function isGmudAdmin(sb: ReturnType<typeof admin>, userId: string): Promise<boolean> {
  const [roleRes, moduleAdminRes] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
    sb
      .from("module_admins")
      .select("user_id")
      .eq("user_id", userId)
      .eq("module_slug", "gmud")
      .maybeSingle(),
  ]);
  return roleRes.data === true || !!moduleAdminRes.data;
}

function visibleAprovadores<T extends AprRow>(
  rows: T[],
  activeIds: Set<string>,
): Array<T & { ativo: boolean }> {
  return rows
    .filter(
      (a) =>
        a.status_aprovacao === "Aprovado" ||
        a.status_aprovacao === "Rejeitado" ||
        activeIds.has(a.id),
    )
    .map((a) => ({ ...a, ativo: activeIds.has(a.id) }));
}

/**
 * Retorna os IDs de GMUD em que `email` é membro da onda ativa no momento —
 * ou seja, foi notificado no grupo da vez (mesmo departamento + papel) que
 * ainda não tem ninguém aprovado. Membros de ondas futuras (ainda não
 * alcançadas) não contam.
 */
async function findActiveApprovalGmudIds(
  sb: ReturnType<typeof admin>,
  email: string,
): Promise<string[]> {
  const { data: pendingRows } = await sb
    .from("gmud_aprovadores")
    .select("gmud_id, email_aprovador")
    .eq("status_aprovacao", "Pendente");
  const candidateIds = [
    ...new Set(
      (pendingRows ?? [])
        .filter((r: any) => (r.email_aprovador ?? "").toLowerCase().trim() === email)
        .map((r: any) => r.gmud_id as string),
    ),
  ];
  if (candidateIds.length === 0) return [];
  // Confirma que a GMUD ainda está em aprovação (senão nenhuma onda conta
  // como ativa) e busca todas as linhas pra montar as ondas de verdade.
  const { data: stillOpen } = await sb
    .from("gmuds")
    .select("id")
    .in("id", candidateIds)
    .eq("status_geral", "Em Aprovação");
  const openIds = (stillOpen ?? []).map((g) => g.id);
  if (openIds.length === 0) return [];

  const { data: allRows } = await sb
    .from("gmud_aprovadores")
    .select(
      "id, gmud_id, ordem, papel, department_id, status_aprovacao, email_aprovador, notificado_em",
    )
    .in("gmud_id", openIds);
  const byGmud = new Map<string, AprRow[]>();
  for (const r of allRows ?? []) {
    if (!byGmud.has(r.gmud_id as string)) byGmud.set(r.gmud_id as string, []);
    byGmud.get(r.gmud_id as string)!.push(r as AprRow);
  }

  const ids: string[] = [];
  for (const [gmudId, rows] of byGmud) {
    const activeIds = getActiveWaveIds(rows);
    const isMine = rows.some(
      (r) => activeIds.has(r.id) && (r.email_aprovador as string)?.toLowerCase().trim() === email,
    );
    if (isMine) ids.push(gmudId);
  }
  return ids;
}

export const listGmuds = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (
      input:
        | { status?: string | null; tipo?: string | null; from?: string | null; to?: string | null }
        | undefined,
    ) => ({
      status: input?.status ?? null,
      tipo: input?.tipo ?? null,
      from: input?.from ?? null,
      to: input?.to ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    // Quem não tem permissão de visualizar o módulo só vê: (1) as GMUDs que criou
    // e (2) as GMUDs em que é o aprovador ativo no momento (próximo a decidir).
    const canViewAll = await hasPermission(context.supabase, context.userId, "gmud", "view");
    const sb = admin();
    let allowedIds: string[] | null = null;
    if (!canViewAll) {
      const ownOrActiveIds = new Set<string>();
      const { data: own } = await sb.from("gmuds").select("id").eq("criado_por", context.userId);
      for (const g of own ?? []) ownOrActiveIds.add(g.id);

      const callerEmail = ((context as any).claims?.email ?? "").toString().toLowerCase();
      if (callerEmail) {
        for (const gmudId of await findActiveApprovalGmudIds(sb, callerEmail))
          ownOrActiveIds.add(gmudId);
      }

      allowedIds = [...ownOrActiveIds];
      if (allowedIds.length === 0) return [];
    }

    let q = sb.from("gmuds").select("*").order("created_at", { ascending: false }).limit(500);
    if (allowedIds !== null) q = q.in("id", allowedIds);
    if (data.status && data.status !== "all") q = q.eq("status_geral", data.status);
    if (data.tipo && data.tipo !== "all") q = q.eq("tipo", data.tipo);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: gmuds, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (gmuds ?? []).map((g) => g.id);
    let approvers: any[] = [];
    if (ids.length > 0) {
      const { data: a } = await sb.from("gmud_aprovadores").select("*").in("gmud_id", ids);
      approvers = a ?? [];
    }
    const byGmud = new Map<string, any[]>();
    for (const a of approvers) {
      if (!byGmud.has(a.gmud_id)) byGmud.set(a.gmud_id, []);
      byGmud.get(a.gmud_id)!.push(a);
    }

    const creatorIds = [
      ...new Set((gmuds ?? []).map((g) => g.criado_por).filter(Boolean)),
    ] as string[];
    const creatorById = await fetchProfilesById(sb, creatorIds);
    // Admin global/do módulo vê a cadência completa (oversight/auditoria);
    // todo mundo mais só vê o que já foi decidido + a onda ativa.
    const fullVisibility = await isGmudAdmin(sb, context.userId);

    return (gmuds ?? []).map((g) => {
      const creator = g.criado_por ? creatorById.get(g.criado_por) : undefined;
      const aprovadoresList = byGmud.get(g.id) ?? [];
      const activeIds =
        g.status_geral === "Em Aprovação" ? getActiveWaveIds(aprovadoresList) : new Set<string>();
      return {
        ...g,
        aprovadores: fullVisibility
          ? aprovadoresList.map((a) => ({ ...a, ativo: activeIds.has(a.id) }))
          : visibleAprovadores(aprovadoresList, activeIds),
        // Quantidade de decisões REALMENTE necessárias (grupos), não de linhas
        // — um grupo com 2 aprovadores backup conta como 1, não 2.
        total_aprovadores: computeDecisionGroups(aprovadoresList).length,
        // Prefere o profile ativo (reflete renomeação); cai para o snapshot
        // gravado na criação quando o profile foi excluído (histórico/auditoria).
        criado_por_nome: creator?.full_name ?? g.criado_por_nome ?? null,
        criado_por_email: creator?.email ?? g.criado_por_email ?? null,
      };
    });
  });

export const getGmud = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: g, error } = await sb.from("gmuds").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!g) return null;
    const { data: a } = await sb
      .from("gmud_aprovadores")
      .select("*")
      .eq("gmud_id", data.id)
      .order("ordem", { ascending: true });
    const aprovadores = a ?? [];
    // Criador e aprovador ativo no momento sempre podem ver a própria GMUD;
    // demais precisam da permissão do módulo.
    const isCreator = g.criado_por === context.userId;
    const callerEmail = ((context as any).claims?.email ?? "").toString().toLowerCase();
    const activeIds =
      g.status_geral === "Em Aprovação" ? getActiveWaveIds(aprovadores) : new Set<string>();
    const isActiveApprover =
      !!callerEmail &&
      aprovadores.some(
        (a) => activeIds.has(a.id) && a.email_aprovador?.toLowerCase() === callerEmail,
      );
    if (!isCreator && !isActiveApprover) {
      await requirePermission(context.supabase, context.userId, "gmud", "view");
    }
    const creator = g.criado_por
      ? (await fetchProfilesById(sb, [g.criado_por])).get(g.criado_por)
      : undefined;
    // Admin global/do módulo vê a cadência completa (oversight/auditoria);
    // todo mundo mais só vê o que já foi decidido + a onda ativa.
    const fullVisibility = await isGmudAdmin(sb, context.userId);
    return {
      ...g,
      aprovadores: fullVisibility
        ? aprovadores.map((a) => ({ ...a, ativo: activeIds.has(a.id) }))
        : visibleAprovadores(aprovadores, activeIds),
      total_aprovadores: computeDecisionGroups(aprovadores).length,
      criado_por_nome: creator?.full_name ?? g.criado_por_nome ?? null,
      criado_por_email: creator?.email ?? g.criado_por_email ?? null,
    };
  });

export const createGmud = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => CreateGmudSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "gmud", "create");
    const sb = admin();

    // Janela de início a 24h ou menos é obrigatoriamente Emergencial — reforça
    // no servidor a mesma regra do formulário, contra bypass do cliente.
    const tipoFinal =
      data.data_inicio && new Date(data.data_inicio).getTime() - Date.now() <= 24 * 60 * 60 * 1000
        ? "Emergencial"
        : data.tipo;

    // Departamentos na ordem recebida: principal primeiro, depois os extras
    // (departamento adicional escolhido pelo usuário, Gerência de TI por
    // último quando obrigatória). Cada departamento busca seus próprios
    // aprovadores ordenados por "ordem".
    const deptOrder = [
      ...new Set([data.department_id, ...(data.extra_department_ids ?? []).filter(Boolean)]),
    ];

    // Emergencial ou impacto Crítico: Gerência de TI entra na cadeia (por último)
    // mesmo que o cliente não tenha mandado — antes essa regra só existia no formulário.
    if (requiresGerenciaTi(tipoFinal, data.impacto)) {
      const { data: depts, error: deptErr } = await sb.from("departments").select("id, name");
      if (deptErr) throw new Error(deptErr.message);
      const gerencia = (depts ?? []).find((d) => isGerenciaTiName(d.name));
      if (!gerencia) {
        throw new Error(
          "GMUD Emergencial ou de impacto Crítico exige a Gerência de TI, mas o departamento 'Gerência de TI' não foi encontrado.",
        );
      }
      if (!deptOrder.includes(gerencia.id)) deptOrder.push(gerencia.id);
    }
    type AprCandidate = {
      nome: string;
      email: string;
      papel: string | null;
      ordem: number;
      department_id: string;
    };
    const aprByDept = new Map<string, AprCandidate[]>();
    for (const deptId of deptOrder) {
      const { data: rows, error: errLookup } = await sb
        .from("aprovadores")
        .select("nome, email, papel, ordem")
        .eq("department_id", deptId)
        .order("ordem", { ascending: true });
      if (errLookup) throw new Error(errLookup.message);
      if (!rows || rows.length === 0) {
        throw new Error("Um dos departamentos selecionados não possui aprovadores cadastrados.");
      }
      for (const r of rows) {
        if (!r.papel || !r.papel.trim()) {
          throw new Error(
            `O aprovador "${r.nome}" não tem papel cadastrado — corrija em Aprovadores antes de criar a GMUD.`,
          );
        }
      }
      aprByDept.set(
        deptId,
        rows.map((r) => ({ ...r, department_id: deptId })),
      );
    }

    // Entrelaça por "ordem" ENTRE departamentos, não em blocos: todos os
    // aprovadores de ordem 1 primeiro (na ordem em que os departamentos foram
    // selecionados), depois todos os de ordem 2, etc. Cada departamento aprova
    // na sua vez, em sequência — ex: SI(1,Analista) → Infra(1,Analista) →
    // SI(2,Coordenador). Só mesmo departamento + papel forma grupo (backup),
    // ver computeDecisionGroups.
    const allOrdens = [
      ...new Set(deptOrder.flatMap((id) => (aprByDept.get(id) ?? []).map((r) => r.ordem))),
    ].sort((a, b) => a - b);
    const interleaved: AprCandidate[] = [];
    for (const ord of allOrdens) {
      for (const deptId of deptOrder) {
        const match = (aprByDept.get(deptId) ?? []).find((r) => r.ordem === ord);
        if (match) interleaved.push(match);
      }
    }

    // Deduplicação por e-mail — primeira ocorrência (departamento/ordem mais
    // prioritário) tem prioridade sobre repetições posteriores.
    const seenEmails = new Set<string>();
    const allAprovadores = interleaved.filter((a) => {
      const key = (a.email ?? "").toLowerCase().trim();
      if (seenEmails.has(key)) return false;
      seenEmails.add(key);
      return true;
    });

    // Snapshot do nome/e-mail do criador no momento da criação — não depende
    // de JOIN com profiles, que é apagado (ON DELETE CASCADE) se a conta do
    // usuário for excluída depois. Preserva o histórico da GMUD.
    // criado_por nunca vem do cliente: esse insert usa o client service-role
    // (bypassa RLS), então a proteção tem que ser aqui -- não dá pra confiar
    // em data.criado_por pra dizer quem abriu a GMUD.
    const creatorProfile = (await fetchProfilesById(sb, [context.userId])).get(context.userId);

    // Segregação de funções: quem abre a GMUD não pode estar na cadeia de aprovação.
    const creatorEmails = new Set(
      [creatorProfile?.email, (context as any).claims?.email]
        .filter(Boolean)
        .map((e) => String(e).toLowerCase().trim()),
    );
    if (allAprovadores.some((a) => creatorEmails.has((a.email ?? "").toLowerCase().trim()))) {
      throw new Error(
        "Você é aprovador de um dos departamentos selecionados — um aprovador não pode aprovar a própria GMUD. Escolha outro departamento ou peça a outra pessoa para abrir a GMUD.",
      );
    }

    const { data: g, error } = await sb
      .from("gmuds")
      .insert({
        titulo: data.titulo,
        descricao: data.descricao,
        justificativa: data.justificativa,
        tipo: tipoFinal,
        impacto: data.impacto,
        data_inicio: data.data_inicio || null,
        data_fim: data.data_fim || null,
        plano_execucao: data.plano_execucao,
        plano_rollback: data.plano_rollback,
        status_geral: "Em Aprovação",
        criado_por: context.userId,
        criado_por_nome: creatorProfile?.full_name ?? null,
        criado_por_email: creatorProfile?.email ?? null,
        department_id: data.department_id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Insere aprovadores com ordem sequencial (1, 2, 3...). Guarda o
    // department_id de origem — necessário pra regra de dispensa por
    // departamento (ver computeDecisionGroups).
    const rows = allAprovadores.map((a, idx) => ({
      gmud_id: g.id,
      nome_aprovador: a.nome,
      email_aprovador: a.email,
      papel: a.papel ?? null,
      ordem: idx + 1,
      department_id: a.department_id,
    }));
    const { error: errA } = await sb.from("gmud_aprovadores").insert(rows);
    if (errA) throw new Error(errA.message);

    // Log criação
    await logGmud(sb, {
      gmud_id: g.id,
      gmud_titulo: g.titulo,
      tipo_evento: "criacao",
      descricao: `GMUD criada: "${g.titulo}" (${g.tipo} / Impacto ${g.impacto})`,
      usuario_email: creatorProfile?.email ?? null,
      status: "success",
      detalhes: { tipo: g.tipo, impacto: g.impacto, aprovadores: allAprovadores.length },
    });

    // Notify ONLY the first approver (hierarchical)
    try {
      await notifyApproverByOrdem(g.id, 1, creatorProfile?.email ?? null);
    } catch (e) {
      console.error("notifyApproverByOrdem failed", e);
    }

    return g;
  });

async function notifyApproverByOrdem(gmudId: string, ordem: number, fromUser: string | null) {
  const sb = admin();
  const { data: g } = await sb.from("gmuds").select("*").eq("id", gmudId).maybeSingle();
  if (!g) return;
  const { data: allRows } = await sb
    .from("gmud_aprovadores")
    .select("*")
    .eq("gmud_id", gmudId)
    .order("ordem", { ascending: true });
  const list = (allRows as AprRow[]) ?? [];
  const a = list.find((r) => r.ordem === ordem) as any;
  if (!a) return;

  // Etapa exibida no e-mail = posição do GRUPO de decisão, não da linha
  // crua — um aprovador "backup" (mesmo departamento+papel de outro) só
  // conta como uma etapa nova se for ele quem efetivamente decidir.
  const groups = computeDecisionGroups(list);
  const myGroupIndex = groups.findIndex((gr) => gr.some((m) => m.id === a.id));
  a.etapa_atual = myGroupIndex >= 0 ? myGroupIndex + 1 : a.ordem;
  a.total_etapas = groups.length;

  // Nome do criador via profiles
  if (g.criado_por) {
    const { data: prof } = await sb
      .from("profiles")
      .select("full_name, email")
      .eq("id", g.criado_por)
      .maybeSingle();
    g.criado_por_nome = prof?.full_name || prof?.email || g.criado_por_email || "—";
  } else {
    g.criado_por_nome = g.criado_por_email || "—";
  }

  await sendApprovalEmailToOne(g, a, fromUser);
  await sb
    .from("gmud_aprovadores")
    .update({ notificado_em: new Date().toISOString() })
    .eq("id", a.id);
}

/**
 * Lembrete diário pro aprovador que já foi notificado e ainda não decidiu —
 * não altera `notificado_em` (que define o relógio dos 5 dias/24h do
 * escalonamento), só `lembrado_em` (controla o intervalo entre lembretes).
 */
async function sendReminderEmail(gmudId: string, ordem: number) {
  const sb = admin();
  const { data: g } = await sb.from("gmuds").select("*").eq("id", gmudId).maybeSingle();
  if (!g) return;
  const { data: allRows } = await sb
    .from("gmud_aprovadores")
    .select("*")
    .eq("gmud_id", gmudId)
    .order("ordem", { ascending: true });
  const list = (allRows as AprRow[]) ?? [];
  const a = list.find((r) => r.ordem === ordem) as any;
  if (!a) return;

  const groups = computeDecisionGroups(list);
  const myGroupIndex = groups.findIndex((gr) => gr.some((m) => m.id === a.id));
  a.etapa_atual = myGroupIndex >= 0 ? myGroupIndex + 1 : a.ordem;
  a.total_etapas = groups.length;

  if (g.criado_por) {
    const { data: prof } = await sb
      .from("profiles")
      .select("full_name, email")
      .eq("id", g.criado_por)
      .maybeSingle();
    g.criado_por_nome = prof?.full_name || prof?.email || g.criado_por_email || "—";
  } else {
    g.criado_por_nome = g.criado_por_email || "—";
  }

  await sendApprovalEmailToOne(g, a, null, { reminder: true });
  await sb
    .from("gmud_aprovadores")
    .update({ lembrado_em: new Date().toISOString() })
    .eq("id", a.id);
}

async function sendApprovedEmail(gmudId: string) {
  const sb = admin();
  const { data: g } = await sb.from("gmuds").select("*").eq("id", gmudId).maybeSingle();
  if (!g || !g.criado_por) return;
  // Busca email do criador via profiles
  const { data: profile } = await sb
    .from("profiles")
    .select("email")
    .eq("id", g.criado_por)
    .maybeSingle();
  const toEmail = profile?.email;
  if (!toEmail) return;

  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  const subject = `[GMUD] Aprovada — ${g.titulo}`;
  if (!cfg || !cfg.enabled || !cfg.host) {
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_approved",
      status: "error",
      error_message: "SMTP não configurado/habilitado",
      related_gmud_id: g.id,
    });
    return;
  }
  const password = (cfg as any).password || process.env.SMTP_PASSWORD || "";
  const approveUrl = `${appUrl()}/app/gmud?gmud=${g.id}`;
  const defaultHtml = buildGmudApprovedHtml(g, approveUrl);
  const approvedOverride = await getEmailTemplateOverride(sb, "gmud_approved");
  const html = applyEmailTemplate(
    "gmud_approved",
    approvedOverride,
    {
      titulo: g.titulo,
      tipo: g.tipo,
      impacto: g.impacto,
      data_inicio: fmtDate(g.data_inicio),
      data_fim: fmtDate(g.data_fim),
      link: approveUrl,
    },
    defaultHtml,
  );
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
        to: { name: toEmail, email: toEmail },
        subject,
        html,
      });
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_approved",
      status: out.ok ? "success" : "error",
      error_message: out.ok ? null : String(out.error ?? "Falha"),
      related_gmud_id: g.id,
    });
  } catch (e: any) {
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_approved",
      status: "error",
      error_message: e?.message ?? "Erro desconhecido",
      related_gmud_id: g.id,
    });
  }
}

async function sendRejectedEmail(gmudId: string, rejectedByName: string, motivo: string | null) {
  const sb = admin();
  const { data: g } = await sb.from("gmuds").select("*").eq("id", gmudId).maybeSingle();
  if (!g || !g.criado_por) return;
  // Busca email do criador via profiles
  const { data: profile } = await sb
    .from("profiles")
    .select("email")
    .eq("id", g.criado_por)
    .maybeSingle();
  const toEmail = profile?.email;
  if (!toEmail) return;

  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  const subject = `[GMUD] Rejeitada — ${g.titulo}`;
  if (!cfg || !cfg.enabled || !cfg.host) {
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_rejected",
      status: "error",
      error_message: "SMTP não configurado/habilitado",
      related_gmud_id: g.id,
    });
    return;
  }
  const password = (cfg as any).password || process.env.SMTP_PASSWORD || "";
  const approveUrl = `${appUrl()}/app/gmud?gmud=${g.id}`;
  const defaultHtml = buildGmudRejectedHtml(g, approveUrl, rejectedByName, motivo);
  const rejectedOverride = await getEmailTemplateOverride(sb, "gmud_rejected");
  const html = applyEmailTemplate(
    "gmud_rejected",
    rejectedOverride,
    {
      titulo: g.titulo,
      tipo: g.tipo,
      impacto: g.impacto,
      data_inicio: fmtDate(g.data_inicio),
      data_fim: fmtDate(g.data_fim),
      rejeitado_por: rejectedByName,
      motivo: motivo ?? "Não informado",
      link: approveUrl,
    },
    defaultHtml,
  );
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
        to: { name: toEmail, email: toEmail },
        subject,
        html,
      });
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_rejected",
      status: out.ok ? "success" : "error",
      error_message: out.ok ? null : String(out.error ?? "Falha"),
      related_gmud_id: g.id,
    });
  } catch (e: any) {
    await sb.from("email_logs").insert({
      to_email: toEmail,
      subject,
      template: "gmud_rejected",
      status: "error",
      error_message: e?.message ?? "Erro desconhecido",
      related_gmud_id: g.id,
    });
  }
}

async function sendApprovalEmailToOne(
  g: any,
  a: any,
  fromUser: string | null,
  opts?: { reminder?: boolean },
) {
  const isReminder = !!opts?.reminder;
  const sb = admin();
  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  const subject = isReminder
    ? `[GMUD] Lembrete — Aprovação pendente — ${g.titulo}`
    : `[GMUD] Solicitação de aprovação — ${g.titulo}`;
  if (!cfg || !cfg.enabled || !cfg.host) {
    await sb.from("email_logs").insert({
      to_email: a.email_aprovador,
      subject,
      template: "gmud_approval_request",
      status: "error",
      error_message: "SMTP não configurado/habilitado",
      related_gmud_id: g.id,
    });
    return;
  }
  const password = (cfg as any).password || process.env.SMTP_PASSWORD || "";
  const approveUrl2 = `${appUrl()}/app/gmud?gmud=${encodeURIComponent(g.id)}`;
  const defaultHtml = buildGmudApprovalRequestHtml(g, a, fromUser, approveUrl2, {
    reminder: isReminder,
  });
  const approvalOverride = await getEmailTemplateOverride(sb, "gmud_approval_request");
  const html = applyEmailTemplate(
    "gmud_approval_request",
    approvalOverride,
    {
      titulo: g.titulo,
      tipo: g.tipo,
      impacto: g.impacto,
      data_inicio: fmtDate(g.data_inicio),
      data_fim: fmtDate(g.data_fim),
      descricao: g.descricao ?? "",
      solicitante: g.criado_por_nome ?? g.criado_por_email ?? "—",
      aprovador: a.nome_aprovador,
      ordem: String(a.etapa_atual ?? a.ordem ?? 1),
      total: String(a.total_etapas ?? a.total_aprovadores ?? "?"),
      link: approveUrl2,
    },
    defaultHtml,
  );
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
        to: { name: a.nome_aprovador, email: a.email_aprovador },
        subject,
        html,
      });
    await sb.from("email_logs").insert({
      to_email: a.email_aprovador,
      subject,
      template: "gmud_approval_request",
      status: out.ok ? "success" : "error",
      error_message: out.ok ? null : String(out.error ?? "Falha desconhecida"),
      related_gmud_id: g.id,
    });
    await logGmud(sb, {
      gmud_id: g.id,
      gmud_titulo: g.titulo,
      tipo_evento: out.ok ? "email_enviado" : "email_erro",
      descricao: out.ok
        ? `${isReminder ? "Lembrete" : "E-mail"} de aprovação enviado para ${a.nome_aprovador} (${a.email_aprovador})`
        : `Falha ao enviar ${isReminder ? "lembrete" : "e-mail"} para ${a.nome_aprovador}: ${out.error ?? "Falha"}`,
      usuario_email: a.email_aprovador,
      usuario_nome: a.nome_aprovador,
      status: out.ok ? "success" : "error",
      detalhes: { subject, ordem: a.ordem, lembrete: isReminder },
    });
  } catch (e: any) {
    await sb.from("email_logs").insert({
      to_email: a.email_aprovador,
      subject,
      template: "gmud_approval_request",
      status: "error",
      error_message: String(e?.message ?? e),
      related_gmud_id: g.id,
    });
    await logGmud(sb, {
      gmud_id: g.id,
      gmud_titulo: g.titulo,
      tipo_evento: "email_erro",
      descricao: `Erro ao enviar e-mail para ${a.nome_aprovador}: ${e?.message ?? "Erro desconhecido"}`,
      usuario_email: a.email_aprovador,
      usuario_nome: a.nome_aprovador,
      status: "error",
      detalhes: { subject, error: e?.message },
    });
  }
}

export const decideGmudApproval = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        gmudId: z.string().uuid(),
        aprovadorId: z.string().uuid(),
        decisao: z.enum(["Aprovado", "Rejeitado"]),
        observacoes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = admin();

    // A GMUD "morre" no primeiro reject: linhas de ordem maior nunca são
    // tocadas (ficam "Pendente" para sempre, já que o fluxo nunca as alcança),
    // então só checar a linha do aprovador não basta — sem isso, alguém com
    // ordem maior que o rejeitador ainda conseguiria decidir depois.
    const { data: gmudRow } = await sb
      .from("gmuds")
      .select("titulo, status_geral, criado_por")
      .eq("id", data.gmudId)
      .maybeSingle();
    if (!gmudRow) throw new Error("GMUD não encontrada");
    if (gmudRow.status_geral !== "Em Aprovação") {
      throw new Error(
        `Esta GMUD já foi encerrada (status atual: "${gmudRow.status_geral}") — não é mais possível decidir.`,
      );
    }

    // Load all approvers ordered
    const { data: aprs } = await sb
      .from("gmud_aprovadores")
      .select("*")
      .eq("gmud_id", data.gmudId)
      .order("ordem", { ascending: true });
    const list = aprs ?? [];
    const target = list.find((a) => a.id === data.aprovadorId);
    if (!target) throw new Error("Aprovador não encontrado");

    const callerUserId = context.userId;
    const actor = await getActor(sb, callerUserId, (context as any).claims);
    const actorLabel = actor.nome ? `${actor.nome} (${actor.email ?? "—"})` : (actor.email ?? "—");

    // Segregação de funções: o criador nunca decide a própria GMUD (ele pode cancelá-la).
    if (gmudRow.criado_por && gmudRow.criado_por === callerUserId) {
      throw new Error("Você criou esta GMUD e não pode decidir a aprovação dela.");
    }

    // Quem decide: o próprio aprovador da linha, ou um admin/super_admin global
    // "em nome de" (férias, ausência) — com justificativa obrigatória e registrado
    // como decisão de quem clicou. has_role('admin') também vale para super_admin.
    const onBehalf = (actor.email ?? "") !== (target.email_aprovador ?? "").toLowerCase();
    if (onBehalf) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: callerUserId,
        _role: "admin" as any,
      });
      if (isAdmin !== true) {
        throw new Error("Acesso negado: você não é este aprovador");
      }
      if (!data.observacoes?.trim()) {
        throw new Error("Informe a justificativa para decidir em nome do aprovador.");
      }
    }
    const onBehalfNote = onBehalf
      ? `[Decidido por ${actorLabel} em nome de ${target.nome_aprovador}] `
      : "";

    // Hierarquia: o aprovador precisa ter sido notificado no grupo da vez
    // (mesmo departamento + papel ainda sem ninguém aprovado).
    const activeIds = getActiveWaveIds(list);
    if (!activeIds.has(target.id)) {
      throw new Error("Não é sua vez de aprovar — aguardando aprovadores anteriores");
    }

    const { error: e1 } = await sb
      .from("gmud_aprovadores")
      .update({
        status_aprovacao: data.decisao,
        data_acao: new Date().toISOString(),
        observacoes: onBehalf ? `${onBehalfNote}${data.observacoes ?? ""}` : (data.observacoes ?? null),
      })
      .eq("id", data.aprovadorId);
    if (e1) throw new Error(e1.message);
    // Reflete em memória pra cálculos abaixo (a query original não muda sozinha).
    target.status_aprovacao = data.decisao;

    // If rejected → cancel the whole GMUD immediately
    if (data.decisao === "Rejeitado") {
      await sb.from("gmuds").update({ status_geral: "Rejeitada" }).eq("id", data.gmudId);
      // Etapas seguintes nunca serão alcançadas — marca como "Cancelado" em
      // vez de deixá-las "Pendente" para sempre.
      await sb
        .from("gmud_aprovadores")
        .update({ status_aprovacao: "Cancelado" })
        .eq("gmud_id", data.gmudId)
        .eq("status_aprovacao", "Pendente");
      await logGmud(sb, {
        gmud_id: data.gmudId,
        gmud_titulo: gmudRow.titulo ?? null,
        tipo_evento: "rejeicao",
        descricao: onBehalf
          ? `GMUD rejeitada por ${actorLabel} em nome de ${target.nome_aprovador} (${target.email_aprovador}): ${data.observacoes}`
          : `GMUD rejeitada por ${target.nome_aprovador} (${target.email_aprovador})${data.observacoes ? `: ${data.observacoes}` : ""}`,
        usuario_email: actor.email,
        usuario_nome: actor.nome,
        status: "error",
        detalhes: {
          aprovador_id: data.aprovadorId,
          observacoes: data.observacoes,
          em_nome_de: onBehalf ? target.email_aprovador : null,
        },
      });
      try {
        await sendRejectedEmail(
          data.gmudId,
          onBehalf ? `${actor.nome ?? actor.email} (em nome de ${target.nome_aprovador})` : target.nome_aprovador,
          data.observacoes ?? null,
        );
      } catch (e) {
        console.error("sendRejectedEmail failed", e);
      }
      return { ok: true, status: "Rejeitada" };
    }

    // Approved → dispensa os demais membros pendentes do mesmo grupo de
    // decisão (onda consecutiva OU mesmo departamento+papel): a aprovação de
    // um já satisfaz o grupo inteiro.
    const groups = computeDecisionGroups(list);
    const myGroup = groups.find((gr) => gr.some((m) => m.id === target.id)) ?? [];
    const peers = myGroup.filter((m) => m.id !== target.id && m.status_aprovacao === "Pendente");
    if (peers.length > 0) {
      await sb
        .from("gmud_aprovadores")
        .update({
          status_aprovacao: "Dispensado",
          data_acao: new Date().toISOString(),
          observacoes: `Dispensado automaticamente — ${target.nome_aprovador} (papel "${target.papel ?? "—"}") já aprovou.`,
        })
        .in(
          "id",
          peers.map((m) => m.id),
        );
      // Reflete na lista em memória para o cálculo de "próximo" abaixo.
      for (const p of peers) p.status_aprovacao = "Dispensado";
    }

    // Approved → log e encontra próximo aprovador
    await logGmud(sb, {
      gmud_id: data.gmudId,
      gmud_titulo: gmudRow.titulo ?? null,
      tipo_evento: "aprovacao",
      descricao: onBehalf
        ? `Aprovado por ${actorLabel} em nome de ${target.nome_aprovador} (${target.email_aprovador}) — etapa ${target.ordem}. Justificativa: ${data.observacoes}`
        : `Aprovado por ${target.nome_aprovador} (${target.email_aprovador}) — etapa ${target.ordem}`,
      usuario_email: actor.email,
      usuario_nome: actor.nome,
      status: "success",
      detalhes: {
        aprovador_id: data.aprovadorId,
        ordem: target.ordem,
        em_nome_de: onBehalf ? target.email_aprovador : null,
      },
    });

    // Próximo = primeiro pendente do próximo grupo em aberto (não "a próxima
    // linha por ordem": se quem aprovou foi um backup, linhas de outros grupos
    // com ordem menor que a dele ainda não foram chamadas).
    const nextGroup = currentDecisionGroup(list);
    const next = nextGroup
      ? [...nextGroup]
          .filter((a) => a.status_aprovacao === "Pendente")
          .sort((a, b) => a.ordem - b.ordem)[0]
      : undefined;
    if (next) {
      try {
        await notifyApproverByOrdem(data.gmudId, next.ordem, null);
      } catch (e) {
        console.error("notifyApproverByOrdem failed", e);
      }
      return { ok: true, status: "Em Aprovação" };
    }

    // No next pending → all approved
    await sb.from("gmuds").update({ status_geral: "Aprovada" }).eq("id", data.gmudId);
    await logGmud(sb, {
      gmud_id: data.gmudId,
      gmud_titulo: gmudRow.titulo ?? null,
      tipo_evento: "aprovacao",
      descricao: `GMUD totalmente aprovada por todos os aprovadores`,
      status: "success",
      detalhes: { total_aprovadores: list.length },
    });
    try {
      await sendApprovedEmail(data.gmudId);
    } catch (e) {
      console.error("sendApprovedEmail failed", e);
    }
    return { ok: true, status: "Aprovada" };
  });

/**
 * Escalonamento por inatividade: NUNCA aprova automaticamente. Para o grupo
 * da vez (mesmo departamento + papel) de cada GMUD "Em Aprovação", se o
 * membro mais recentemente notificado está parado há mais tempo que o prazo
 * (N dias no caso normal, 24h fixas para Emergencial/Crítico), apenas
 * notifica o backup do MESMO grupo (mesmo departamento + papel) e dispensa
 * quem ficou parado, que perde a vez. Sem backup, o grupo é dispensado por
 * inatividade e a GMUD segue para o próximo grupo. O cron roda 1x/dia, então o
 * prazo de 24h de Emergencial/Crítico é, na prática, detectado em até ~48h
 * (a checagem mais próxima do estouro real). Idempotente.
 */
/**
 * Implementação interna do escalonamento. NÃO É um serverFn — só pode ser
 * chamado a partir do endpoint webhook (`/api/public/hooks/gmud-escalate`,
 * protegido por HOOK_SECRET) ou a partir do serverFn autenticado abaixo.
 */
export async function _runEscalateInactiveApprovals(days = 5) {
  const d = Math.min(Math.max(days, 1), 60);
  const sb = admin();
  const cutoffNormal = Date.now() - d * 86400000;
  const cutoffUrgente = Date.now() - 24 * 3600000;
  const reminderCutoff = Date.now() - 24 * 3600000; // no máximo 1 lembrete por dia

  const { data: gmuds } = await sb
    .from("gmuds")
    .select("id, tipo, impacto")
    .eq("status_geral", "Em Aprovação");
  let escalated = 0;
  let reminded = 0;
  for (const g of gmuds ?? []) {
    const isUrgente = g.tipo === "Emergencial" || g.impacto === "Crítico";
    const cutoff = isUrgente ? cutoffUrgente : cutoffNormal;
    const { data: aprs } = await sb
      .from("gmud_aprovadores")
      .select("*")
      .eq("gmud_id", g.id)
      .order("ordem", { ascending: true });
    const list = (aprs as AprRow[]) ?? [];
    const wave = currentDecisionGroup(list);
    if (!wave) continue;
    const pendentes = wave.filter((m) => m.status_aprovacao === "Pendente");
    if (pendentes.length === 0) continue;

    // Quem está "na vez" agora: o último membro pendente já notificado.
    const notificados = pendentes
      .filter((m: any) => m.notificado_em)
      .sort((a: any, b: any) => b.ordem - a.ordem);
    const atual = notificados[0];

    // Notificação inicial não chegou (notificado_em=null para todos): reenvia pro primeiro da onda.
    if (!atual) {
      const primeiro = [...pendentes].sort((a: any, b: any) => a.ordem - b.ordem)[0];
      if (primeiro) {
        try {
          await notifyApproverByOrdem(g.id, (primeiro as any).ordem, null);
          escalated++;
        } catch (e) {
          console.error(e);
        }
      }
      continue;
    }

    const notifiedAt = new Date((atual as any).notificado_em).getTime();

    if (notifiedAt <= cutoff) {
      // Estourou o prazo (5 dias normal / 24h urgente) — escalona pro próximo
      // membro da MESMA onda, ainda não notificado, que entra na mesma regra
      // (lembrete diário próprio, escalando de novo se também ficar inativo).
      const proximo = pendentes.find((m: any) => m.ordem > atual.ordem && !m.notificado_em);
      if (proximo) {
        // Quem ficou parado perde a vez: dispensado por inatividade, o backup
        // (mesmo departamento + papel) passa a ser o único que pode decidir.
        const { error: dispenseAtualError } = await sb
          .from("gmud_aprovadores")
          .update({
            status_aprovacao: "Dispensado",
            data_acao: new Date().toISOString(),
            observacoes: `Dispensado automaticamente por inatividade — prazo de ${isUrgente ? "24h" : `${d} dias`} expirado; repassado para ${(proximo as any).nome_aprovador}.`,
          })
          .eq("id", atual.id)
          .eq("status_aprovacao", "Pendente");
        if (dispenseAtualError) {
          console.error(dispenseAtualError);
          continue;
        }
        await logGmud(sb, {
          gmud_id: g.id,
          gmud_titulo: null,
          tipo_evento: "mudanca_status",
          descricao: `${(atual as any).nome_aprovador} dispensado por inatividade. Aprovação repassada ao backup ${(proximo as any).nome_aprovador}.`,
          status: "info",
          detalhes: {
            dispensado: (atual as any).email_aprovador,
            backup: (proximo as any).email_aprovador,
          },
        });
        try {
          await notifyApproverByOrdem(g.id, (proximo as any).ordem, null);
          escalated++;
        } catch (e) {
          console.error(e);
        }
        continue; // escalação feita — lembrete desnecessário nesta rodada
      }

      // Onda esgotada sem backup no mesmo grupo — escalona pro próximo grupo sequencial.
      // Dispensa os pendentes atuais por inatividade e notifica o primeiro do próximo grupo.
      const nextGroupMember = list.find(
        (m: any) => m.status_aprovacao === "Pendente" && !wave.some((w) => w.id === m.id),
      );
      if (nextGroupMember) {
        const { error: dispenseError } = await sb
          .from("gmud_aprovadores")
          .update({
            status_aprovacao: "Dispensado",
            data_acao: new Date().toISOString(),
            observacoes: `Dispensado automaticamente por inatividade — prazo de ${d} dias expirado.`,
          })
          .in(
            "id",
            pendentes.map((p) => p.id),
          );
        if (!dispenseError) {
          await logGmud(sb, {
            gmud_id: g.id,
            gmud_titulo: null,
            tipo_evento: "mudanca_status",
            descricao: `Aprovadores dispensados por inatividade (${d} dias): ${pendentes.map((p: any) => p.nome_aprovador).join(", ")}. Próximo aprovador: ${(nextGroupMember as any).nome_aprovador}`,
            status: "info",
            detalhes: {
              inatividade_dias: d,
              dispensados: pendentes.map((p: any) => p.email_aprovador),
            },
          });
          try {
            await notifyApproverByOrdem(g.id, (nextGroupMember as any).ordem, null);
            escalated++;
          } catch (e) {
            console.error(e);
          }
        }
        continue;
      }
      // Sem próximo grupo — cai no lembrete para não silenciar o atual.
    }

    // Lembrete diário pro aprovador atual — cobre: (1) dentro do prazo e (2) onda
    // esgotada após prazo (sem backup disponível). O aprovador anterior ao escalonamento
    // permanece em silêncio (não é mais `atual`).
    const lastPing = (atual as any).lembrado_em ?? (atual as any).notificado_em;
    if (new Date(lastPing).getTime() <= reminderCutoff) {
      try {
        await sendReminderEmail(g.id, (atual as any).ordem);
        reminded++;
      } catch (e) {
        console.error(e);
      }
    }
  }
  return { ok: true, escalated, reminded };
}

/**
 * Disparo manual do escalonamento — somente admin/analista autenticado.
 * O cron usa diretamente o endpoint público `/api/public/hooks/gmud-escalate`
 * protegido por HOOK_SECRET, que chama `_runEscalateInactiveApprovals`.
 */
export const escalateInactiveApprovals = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { days?: number } | undefined) => ({
    days: Math.min(Math.max(input?.days ?? 5, 1), 60),
  }))
  .handler(async ({ data, context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    return _runEscalateInactiveApprovals(data.days);
  });

export const gmudMetrics = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { days?: number } | undefined) => ({
    days: Math.min(Math.max(input?.days ?? 30, 1), 365),
  }))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "gmud", "view");
    const sb = admin();
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const { data: all } = await sb
      .from("gmuds")
      .select("id, tipo, status_geral, created_at, updated_at");
    const list = all ?? [];
    const inRange = list.filter((g) => g.created_at >= since);

    const concluidas = inRange.filter((g) => g.status_geral === "Concluída").length;
    const rollback = inRange.filter((g) => g.status_geral === "Rollback").length;
    const rejeitadas = inRange.filter((g) => g.status_geral === "Rejeitada").length;
    const taxaSucesso =
      concluidas + rollback > 0 ? Math.round((concluidas / (concluidas + rollback)) * 100) : 0;
    const emExecucao = list.filter((g) => g.status_geral === "Em Execução").length;

    // distribuição por tipo
    const tipos: Record<string, number> = { Normal: 0, Prioritária: 0, Emergencial: 0 };
    inRange.forEach((g) => {
      tipos[g.tipo] = (tipos[g.tipo] ?? 0) + 1;
    });

    // série por dia (ou semana)
    const bucketDays = data.days > 60 ? 7 : 1;
    const buckets: {
      label: string;
      v: number;
      concluidas: number;
      rollback: number;
      rejeitadas: number;
    }[] = [];
    const now = Date.now();
    const numBuckets = Math.ceil(data.days / bucketDays);
    for (let i = numBuckets - 1; i >= 0; i--) {
      const start = now - (i + 1) * bucketDays * 86400000;
      const end = now - i * bucketDays * 86400000;
      const inBucket = (g: any) => {
        const t = new Date(g.created_at).getTime();
        return t >= start && t < end;
      };
      const count = inRange.filter(inBucket).length;
      const nConcluida = inRange.filter(
        (g) => inBucket(g) && g.status_geral === "Concluída",
      ).length;
      const nRollback = inRange.filter((g) => inBucket(g) && g.status_geral === "Rollback").length;
      const nRejeitada = inRange.filter(
        (g) => inBucket(g) && g.status_geral === "Rejeitada",
      ).length;
      const d = new Date(end);
      buckets.push({
        label:
          bucketDays === 1
            ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
            : `S${Math.ceil(d.getDate() / 7)}`,
        v: count,
        concluidas: nConcluida,
        rollback: nRollback,
        rejeitadas: nRejeitada,
      });
    }

    // média de tempo para aprovação (decididas em range)
    const ids = inRange.map((g) => g.id);
    let mediaAprovHoras = 0;
    let gargalos: { nome: string; email: string; pendentes: number; tempoMedioH: number }[] = [];
    if (ids.length > 0) {
      const { data: aprs } = await sb.from("gmud_aprovadores").select("*").in("gmud_id", ids);
      const aprList = aprs ?? [];
      const decididas = aprList.filter((a) => a.data_acao);
      if (decididas.length > 0) {
        const total = decididas.reduce((acc, a) => {
          const g = inRange.find((x) => x.id === a.gmud_id);
          if (!g) return acc;
          return acc + (new Date(a.data_acao).getTime() - new Date(g.created_at).getTime());
        }, 0);
        mediaAprovHoras = Math.round(total / decididas.length / 3600000);
      }
      // gargalos: aprovadores pendentes com tempo > 24h
      const now2 = Date.now();
      const pend = aprList.filter((a) => a.status_aprovacao === "Pendente");
      const byEmail = new Map<
        string,
        { nome: string; email: string; pendentes: number; tempoTotal: number }
      >();
      for (const a of pend) {
        const g = inRange.find((x) => x.id === a.gmud_id);
        if (!g) continue;
        const ageH = (now2 - new Date(g.created_at).getTime()) / 3600000;
        if (ageH < 24) continue;
        const key = a.email_aprovador.toLowerCase();
        const cur = byEmail.get(key) ?? {
          nome: a.nome_aprovador,
          email: a.email_aprovador,
          pendentes: 0,
          tempoTotal: 0,
        };
        cur.pendentes += 1;
        cur.tempoTotal += ageH;
        byEmail.set(key, cur);
      }
      gargalos = [...byEmail.values()]
        .map((x) => ({
          nome: x.nome,
          email: x.email,
          pendentes: x.pendentes,
          tempoMedioH: Math.round(x.tempoTotal / x.pendentes),
        }))
        .sort((a, b) => b.pendentes - a.pendentes)
        .slice(0, 10);
    }

    return {
      total: inRange.length,
      taxaSucesso,
      concluidas,
      rollback,
      rejeitadas,
      mediaAprovHoras,
      emExecucao,
      tipos: Object.entries(tipos).map(([name, value]) => ({ name, value })),
      serie: buckets,
      gargalos,
    };
  });

export const updateGmudStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "Rascunho",
          "Em Aprovação",
          "Aprovada",
          "Rejeitada",
          "Cancelada",
          "Em Execução",
          "Concluída",
          "Rollback",
        ]),
        usuario_email: z.string().email().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: gmudInfo } = await sb
      .from("gmuds")
      .select("titulo, status_geral, criado_por")
      .eq("id", data.id)
      .maybeSingle();
    if (!gmudInfo) throw new Error("GMUD não encontrada");

    // Só transições permitidas (gmud-rules.ts): o criador registra o desfecho da
    // própria GMUD já aprovada; quem tem "execute" conduz a execução. Ninguém leva
    // uma GMUD a "Aprovada"/"Rejeitada" por aqui — isso é só via decideGmudApproval.
    const isCreator = gmudInfo.criado_por === context.userId;
    const canExecute = await hasPermission(context.supabase, context.userId, "gmud", "execute");
    if (!isCreator && !canExecute) {
      throw new Error("Acesso negado: você não tem permissão para esta ação");
    }
    const allowed = allowedStatusTransitions(gmudInfo.status_geral, { isCreator, canExecute });
    if (!allowed.includes(data.status)) {
      throw new Error(
        `Não é possível mudar de "${gmudInfo.status_geral}" para "${data.status}".`,
      );
    }
    const actor = await getActor(sb, context.userId, (context as any).claims);
    const { error } = await sb
      .from("gmuds")
      .update({ status_geral: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logGmud(sb, {
      gmud_id: data.id,
      gmud_titulo: gmudInfo?.titulo ?? null,
      tipo_evento: "mudanca_status",
      descricao: `Status alterado de "${gmudInfo.status_geral}" para "${data.status}"`,
      usuario_email: actor.email,
      usuario_nome: actor.nome,
      status: "info",
      detalhes: { status_anterior: gmudInfo.status_geral, status_novo: data.status },
    });
    return { ok: true };
  });

// ─── cancelGmud ───────────────────────────────────────────────────────────────
// Só o criador pode cancelar, e só enquanto a GMUD ainda estiver "Em
// Aprovação" (não importa se algum aprovador já aprovou — basta nenhum ter
// rejeitado e o fluxo ainda não ter concluído). Justificativa é obrigatória.

export const cancelGmud = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        motivo: z.string().trim().min(1, "Justificativa é obrigatória").max(2000),
        usuario_email: z.string().email().optional().nullable(),
        usuario_nome: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: gmudInfo } = await sb
      .from("gmuds")
      .select("titulo, status_geral, criado_por")
      .eq("id", data.id)
      .maybeSingle();
    if (!gmudInfo) throw new Error("GMUD não encontrada.");
    if (gmudInfo.criado_por !== context.userId) {
      throw new Error("Apenas o criador da GMUD pode cancelá-la.");
    }
    if (gmudInfo.status_geral !== "Em Aprovação") {
      throw new Error(
        `Esta GMUD já foi encerrada (status atual: "${gmudInfo.status_geral}") — não é mais possível cancelar.`,
      );
    }

    const { error } = await sb
      .from("gmuds")
      .update({ status_geral: "Cancelada", motivo_cancelamento: data.motivo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Etapas ainda pendentes nunca serão alcançadas — marca como "Cancelado".
    await sb
      .from("gmud_aprovadores")
      .update({ status_aprovacao: "Cancelado" })
      .eq("gmud_id", data.id)
      .eq("status_aprovacao", "Pendente");

    const cancelActor = await getActor(sb, context.userId, (context as any).claims);
    await logGmud(sb, {
      gmud_id: data.id,
      gmud_titulo: gmudInfo.titulo,
      tipo_evento: "mudanca_status",
      descricao: `GMUD cancelada pelo criador. Motivo: ${data.motivo}`,
      usuario_email: cancelActor.email,
      usuario_nome: cancelActor.nome,
      status: "info",
      detalhes: {
        status_anterior: gmudInfo.status_geral,
        status_novo: "Cancelada",
        motivo: data.motivo,
      },
    });

    return { ok: true };
  });

// ─── deleteGmud ───────────────────────────────────────────────────────────────

export const deleteGmud = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "gmud", "delete");
    const sb = admin();

    const { data: gmudRow } = await sb
      .from("gmuds")
      .select("titulo, status_geral, criado_por")
      .eq("id", data.id)
      .maybeSingle();
    if (!gmudRow) throw new Error("GMUD não encontrada");

    // Fora de admin/analista, só o criador pode excluir — e só enquanto
    // ainda não houver nenhuma decisão (a GMUD "morre" pro criador no
    // instante em que o primeiro aprovador decide; daí em diante só
    // admin/analista conseguem excluir).
    const [adminRes, analistaRes] = await Promise.all([
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" as any }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "analista" as any }),
    ]);
    const isPrivileged = adminRes.data === true || analistaRes.data === true;

    if (!isPrivileged) {
      if (gmudRow.criado_por !== context.userId) {
        throw new Error("Acesso negado: você só pode excluir GMUDs que você mesmo criou");
      }
      if (gmudRow.status_geral !== "Em Aprovação") {
        throw new Error(
          "Esta GMUD já foi decidida — a partir daqui só admin/analista podem excluí-la",
        );
      }
      const { data: aprs } = await sb
        .from("gmud_aprovadores")
        .select("status_aprovacao")
        .eq("gmud_id", data.id);
      const anyDecided = (aprs ?? []).some((a) => a.status_aprovacao !== "Pendente");
      if (anyDecided) {
        throw new Error(
          "O primeiro aprovador já decidiu — a partir daqui só admin/analista podem excluí-la",
        );
      }
    }

    const { data: profile } = await sb
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { error: e1 } = await sb.from("gmud_aprovadores").delete().eq("gmud_id", data.id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb.from("gmuds").delete().eq("id", data.id);
    if (e2) throw new Error(e2.message);

    // gmud_id fica null de propósito: a linha em "gmuds" acabou de ser excluída,
    // então referenciá-la aqui poderia violar a FK (ou, se houver ON DELETE
    // CASCADE não rastreado nas migrations, apagaria este próprio log junto).
    // O id original fica preservado em detalhes.
    await logGmud(sb, {
      gmud_id: null,
      gmud_titulo: gmudRow?.titulo ?? null,
      tipo_evento: "exclusao",
      descricao: `GMUD excluída: "${gmudRow?.titulo ?? data.id}"`,
      usuario_email: profile?.email ?? ((context as any).claims?.email as string) ?? null,
      usuario_nome: profile?.full_name ?? null,
      status: "success",
      detalhes: { gmud_id: data.id },
    });

    return { ok: true };
  });
