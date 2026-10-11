// Treinamentos — server functions.
//   • Gestão (painel): exigem sessão do Z-Sec + permissão do módulo "treinamentos".
//   • Colaborador (/treinamentos): exigem a sessão de treinamento (cookie assinado
//     emitido depois do login Microsoft no tenant). Nunca usam a sessão do painel.
// A parte só de servidor fica em treinamentos.server.ts e é importada dentro dos
// handlers para não ir para o bundle do navegador (mesmo padrão de sso.functions).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission, type ModuleAction } from "@/lib/authz";
import { APP_NAME } from "@/lib/brand";

const MOD = "treinamentos";

export type TreinamentoTipo = "Política" | "Phishing" | "Conscientização";
export type TreinamentoStatus = "Rascunho" | "Publicado" | "Arquivado";
export type AtribuicaoStatus = "Pendente" | "Em andamento" | "Concluído";

export type TreinamentoRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TreinamentoTipo;
  status: TreinamentoStatus;
  video_path: string | null;
  video_url: string | null;
  duracao_seg: number | null;
  exigir_pct_assistido: number;
  bloquear_avanco: boolean;
  exigir_ciencia: boolean;
  prazo_padrao_dias: number;
  policy_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AtribuicaoRow = {
  id: string;
  treinamento_id: string;
  colaborador_id: string;
  origem: "manual" | "phishing" | "politica";
  origem_ref: string | null;
  prazo: string | null;
  status: AtribuicaoStatus;
  pct_assistido: number;
  iniciado_em: string | null;
  concluido_em: string | null;
  convite_enviado_em: string | null;
  created_at: string;
};

export type ColaboradorMin = {
  id: string;
  display_name: string;
  email: string;
  unidade: string | null;
  department_id: string | null;
  cargo: string | null;
};

export type AcessoRow = {
  id: string;
  colaborador_id: string | null;
  email: string | null;
  evento: string;
  treinamento_id: string | null;
  detalhe: string | null;
  created_at: string;
};

async function guard(context: { supabase: unknown; userId: string }, action: ModuleAction) {
  // requirePermission usa o RPC has_module_permission (admins e admins do módulo inclusos)
  await requirePermission(
    context.supabase as Parameters<typeof requirePermission>[0],
    context.userId,
    MOD,
    action,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GESTÃO
// ══════════════════════════════════════════════════════════════════════════════

/** Tudo o que a tela de gestão precisa, numa chamada. */
export const getTreinamentosData = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await guard(context, "view");
    const S = await import("./treinamentos.server");
    const sb = S.adminDb();
    const [tr, at, co, dep, ac, pol, sso] = await Promise.all([
      sb.from("treinamentos").select("*").order("created_at", { ascending: false }),
      sb
        .from("treinamento_atribuicoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000),
      sb
        .from("colaboradores")
        .select("id, display_name, email, unidade, department_id, cargo")
        .order("display_name"),
      sb.from("departments").select("id, name").order("name"),
      sb
        .from("treinamento_acessos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      sb.from("policies").select("id, name, status").order("name"),
      sb.rpc("get_sso_public_config").maybeSingle(),
    ]);
    for (const r of [tr, at, co, dep, ac, pol]) if (r.error) throw new Error(r.error.message);
    const ssoCfg = (sso.data ?? {}) as {
      allowed_domains?: string[] | null;
      oauth_enabled?: boolean;
    };
    return {
      treinamentos: (tr.data ?? []) as TreinamentoRow[],
      atribuicoes: (at.data ?? []) as AtribuicaoRow[],
      colaboradores: (co.data ?? []) as ColaboradorMin[],
      departamentos: (dep.data ?? []) as Array<{ id: string; name: string }>,
      acessos: (ac.data ?? []) as AcessoRow[],
      politicas: (pol.data ?? []) as Array<{ id: string; name: string; status: string }>,
      allowedDomains: (ssoCfg.allowed_domains ?? []).map((d) => d.toLowerCase()),
      ssoAtivo: !!ssoCfg.oauth_enabled,
    };
  });

const TreinamentoInput = z.object({
  id: z.string().uuid().optional().nullable(),
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(2000).nullable().optional(),
  tipo: z.enum(["Política", "Phishing", "Conscientização"]),
  status: z.enum(["Rascunho", "Publicado", "Arquivado"]),
  video_path: z.string().max(500).nullable().optional(),
  video_url: z.string().url().max(1000).nullable().optional(),
  duracao_seg: z.number().int().positive().nullable().optional(),
  exigir_pct_assistido: z.number().int().min(0).max(100),
  bloquear_avanco: z.boolean(),
  exigir_ciencia: z.boolean(),
  prazo_padrao_dias: z.number().int().min(1).max(365),
  policy_id: z.string().uuid().nullable().optional(),
});

export const upsertTreinamento = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) => TreinamentoInput.parse(i))
  .handler(async ({ data, context }) => {
    await guard(context, data.id ? "edit" : "create");
    if (data.video_path && data.video_url) throw new Error("Use arquivo OU link, não os dois");
    const S = await import("./treinamentos.server");
    const sb = S.adminDb();
    const row = {
      titulo: data.titulo,
      descricao: data.descricao || null,
      tipo: data.tipo,
      status: data.status,
      video_path: data.video_path || null,
      video_url: data.video_url || null,
      duracao_seg: data.duracao_seg ?? null,
      exigir_pct_assistido: data.exigir_pct_assistido,
      bloquear_avanco: data.bloquear_avanco,
      exigir_ciencia: data.exigir_ciencia,
      prazo_padrao_dias: data.prazo_padrao_dias,
      policy_id: data.tipo === "Política" ? (data.policy_id ?? null) : null,
    };
    if (data.id) {
      const { data: prev } = await sb
        .from("treinamentos")
        .select("video_path")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await sb.from("treinamentos").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      // Troca de vídeo: remove o arquivo antigo do Storage
      if (prev?.video_path && prev.video_path !== row.video_path) {
        await sb.storage.from(S.VIDEO_BUCKET).remove([prev.video_path]);
      }
      return { id: data.id };
    }
    const { data: ins, error } = await sb
      .from("treinamentos")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const deleteTreinamento = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await guard(context, "delete");
    const S = await import("./treinamentos.server");
    const sb = S.adminDb();
    const { data: prev } = await sb
      .from("treinamentos")
      .select("video_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await sb.from("treinamentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (prev?.video_path) await sb.storage.from(S.VIDEO_BUCKET).remove([prev.video_path]);
    return { ok: true };
  });

/** URL assinada para o navegador enviar o vídeo direto ao Storage (sem passar pelo servidor). */
export const createVideoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.enum(["video/mp4", "video/webm"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await guard(context, "create");
    const S = await import("./treinamentos.server");
    const ext = data.contentType === "video/webm" ? "webm" : "mp4";
    const safe = data.filename
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const path = `videos/${crypto.randomUUID()}-${safe || "video"}.${ext}`;
    const { data: up, error } = await S.adminDb()
      .storage.from(S.VIDEO_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !up) throw new Error(error?.message ?? "Falha ao preparar o envio");
    return { path, token: up.token };
  });

/** Pré-visualização do vídeo na gestão. */
export const getVideoPreviewUrl = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) => z.object({ path: z.string().min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    await guard(context, "view");
    const S = await import("./treinamentos.server");
    const { data: s, error } = await S.adminDb()
      .storage.from(S.VIDEO_BUCKET)
      .createSignedUrl(data.path, 60 * 30);
    if (error || !s) throw new Error(error?.message ?? "Vídeo indisponível");
    return { url: s.signedUrl };
  });

async function enviarConvites(atribuicaoIds: string[]) {
  const S = await import("./treinamentos.server");
  const sb = S.adminDb();
  if (atribuicaoIds.length === 0) return { enviados: 0, falhas: 0 };
  const { data: rows, error } = await sb
    .from("treinamento_atribuicoes")
    .select("id, prazo, treinamento_id, treinamentos(titulo), colaboradores(display_name, email)")
    .in("id", atribuicaoIds);
  if (error) throw new Error(error.message);
  let enviados = 0;
  let falhas = 0;
  for (const r of (rows ?? []) as unknown as Array<{
    id: string;
    prazo: string | null;
    treinamento_id: string;
    treinamentos: { titulo: string } | null;
    colaboradores: { display_name: string; email: string } | null;
  }>) {
    if (!r.colaboradores?.email || !r.treinamentos) continue;
    const link = `${S.appBaseUrl()}/treinamentos?t=${r.treinamento_id}`;
    const ok = await S.sendMail(
      r.colaboradores.email,
      `Treinamento de segurança: ${r.treinamentos.titulo}`,
      S.buildConviteHtml({
        nome: r.colaboradores.display_name,
        titulo: r.treinamentos.titulo,
        prazo: r.prazo,
        link,
      }),
      "treinamento_convite",
    ).catch(() => false);
    if (ok) {
      enviados++;
      await sb
        .from("treinamento_atribuicoes")
        .update({ convite_enviado_em: new Date().toISOString() })
        .eq("id", r.id);
    } else falhas++;
  }
  return { enviados, falhas };
}

export const atribuirTreinamento = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) =>
    z
      .object({
        treinamento_id: z.string().uuid(),
        colaborador_ids: z.array(z.string().uuid()).min(1).max(5000),
        prazo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        enviar_convite: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await guard(context, "create");
    const S = await import("./treinamentos.server");
    const sb = S.adminDb();
    const { data: t } = await sb
      .from("treinamentos")
      .select("status")
      .eq("id", data.treinamento_id)
      .maybeSingle();
    if (!t) throw new Error("Treinamento não encontrado");
    if (t.status !== "Publicado") throw new Error("Publique o treinamento antes de atribuir");
    // Quem já tem esse treinamento não é atribuído de novo
    const { data: existing } = await sb
      .from("treinamento_atribuicoes")
      .select("colaborador_id")
      .eq("treinamento_id", data.treinamento_id)
      .in("colaborador_id", data.colaborador_ids);
    const ja = new Set((existing ?? []).map((e: { colaborador_id: string }) => e.colaborador_id));
    const novos = data.colaborador_ids.filter((id) => !ja.has(id));
    let ids: string[] = [];
    if (novos.length > 0) {
      const { data: ins, error } = await sb
        .from("treinamento_atribuicoes")
        .insert(
          novos.map((colaborador_id) => ({
            treinamento_id: data.treinamento_id,
            colaborador_id,
            origem: "manual",
            prazo: data.prazo,
            created_by: context.userId,
          })),
        )
        .select("id");
      if (error) throw new Error(error.message);
      ids = (ins ?? []).map((r: { id: string }) => r.id);
    }
    const convites = data.enviar_convite ? await enviarConvites(ids) : { enviados: 0, falhas: 0 };
    return { criadas: ids.length, jaTinham: ja.size, ...convites };
  });

export const reenviarConvite = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    await guard(context, "edit");
    return enviarConvites(data.ids);
  });

export const deleteAtribuicao = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await guard(context, "delete");
    const S = await import("./treinamentos.server");
    const { error } = await S.adminDb().from("treinamento_atribuicoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Adesão por política (treinamentos de ciência vinculados), para o módulo Políticas. */
export const getAdesaoPoliticas = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(
      context.supabase as Parameters<typeof requirePermission>[0],
      context.userId,
      "politicas",
      "view",
    );
    const S = await import("./treinamentos.server");
    const sb = S.adminDb();
    const { data: trs } = await sb
      .from("treinamentos")
      .select("id, policy_id")
      .not("policy_id", "is", null);
    const ids = (trs ?? []).map((t: { id: string }) => t.id);
    if (ids.length === 0) return {} as Record<string, { trained: number; target: number }>;
    const { data: ats } = await sb
      .from("treinamento_atribuicoes")
      .select("treinamento_id, status")
      .in("treinamento_id", ids);
    const byTr = new Map<string, { trained: number; target: number }>();
    for (const a of (ats ?? []) as Array<{ treinamento_id: string; status: string }>) {
      const c = byTr.get(a.treinamento_id) ?? { trained: 0, target: 0 };
      c.target++;
      if (a.status === "Concluído") c.trained++;
      byTr.set(a.treinamento_id, c);
    }
    const out: Record<string, { trained: number; target: number }> = {};
    for (const t of (trs ?? []) as Array<{ id: string; policy_id: string }>) {
      const c = byTr.get(t.id);
      if (!c) continue;
      const prev = out[t.policy_id] ?? { trained: 0, target: 0 };
      out[t.policy_id] = { trained: prev.trained + c.trained, target: prev.target + c.target };
    }
    return out;
  });

// ══════════════════════════════════════════════════════════════════════════════
// COLABORADOR (página pública /treinamentos)
// ══════════════════════════════════════════════════════════════════════════════

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: sessão própria do colaborador, conferida no handler
export const getLearnerSession = createServerFn({ method: "GET" }).handler(async () => {
  const S = await import("./treinamentos.server");
  const s = await S.currentLearner();
  return s ? { nome: s.n, email: s.e } : null;
});

/** Inicia o login Microsoft só para treinamentos (validação no tenant, sem conta no Z-Sec). */
// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: sessão própria do colaborador, conferida no handler
export const startLearnerSso = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ t: z.string().uuid().optional().nullable() }).parse(i ?? {}))
  .handler(async ({ data }) => {
    const S = await import("./treinamentos.server");
    const { buildState } = await import("./sso.functions");
    const sb = S.adminDb();
    const { data: cfg, error } = await sb.rpc("get_sso_public_config").maybeSingle();
    if (error) throw new Error(error.message);
    const c = (cfg ?? {}) as { azure_tenant_id?: string; azure_client_id?: string };
    if (!c.azure_tenant_id || !c.azure_client_id)
      throw new Error(`Login Microsoft não configurado no ${APP_NAME}`);
    if (!process.env.AZURE_CLIENT_SECRET || !process.env.SSO_STATE_SECRET) {
      throw new Error("Login Microsoft não configurado (segredos pendentes)");
    }
    const redirectUri = S.learnerRedirectUri();
    const back = data.t ? `/treinamentos?t=${data.t}` : "/treinamentos";
    const state = await buildState("", redirectUri, back);
    const url = new URL(
      `https://login.microsoftonline.com/${c.azure_tenant_id}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set("client_id", c.azure_client_id);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", crypto.randomUUID());
    url.searchParams.set("prompt", "select_account");
    return { authorizeUrl: url.toString() };
  });

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: sessão própria do colaborador, conferida no handler
export const learnerLogout = createServerFn({ method: "POST" }).handler(async () => {
  const S = await import("./treinamentos.server");
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(S.LEARNER_COOKIE, "", { ...S.learnerCookieOptions, maxAge: 0 });
  return { ok: true };
});

export type MeuTreinamento = {
  atribuicao_id: string;
  treinamento_id: string;
  titulo: string;
  descricao: string | null;
  tipo: TreinamentoTipo;
  duracao_seg: number | null;
  prazo: string | null;
  status: AtribuicaoStatus;
  pct_assistido: number;
  concluido_em: string | null;
};

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: sessão própria do colaborador, conferida no handler
export const listMyTrainings = createServerFn({ method: "POST" }).handler(async () => {
  const S = await import("./treinamentos.server");
  const s = await S.currentLearner();
  if (!s) throw new Error("Sessão de treinamento expirada");
  const { data, error } = await S.adminDb()
    .from("treinamento_atribuicoes")
    .select(
      "id, treinamento_id, prazo, status, pct_assistido, concluido_em, treinamentos!inner(titulo, descricao, tipo, duracao_seg, status)",
    )
    .eq("colaborador_id", s.c)
    .eq("treinamentos.status", "Publicado");
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      treinamento_id: string;
      prazo: string | null;
      status: AtribuicaoStatus;
      pct_assistido: number;
      concluido_em: string | null;
      treinamentos: {
        titulo: string;
        descricao: string | null;
        tipo: TreinamentoTipo;
        duracao_seg: number | null;
      };
    }>
  ).map(
    (r): MeuTreinamento => ({
      atribuicao_id: r.id,
      treinamento_id: r.treinamento_id,
      titulo: r.treinamentos.titulo,
      descricao: r.treinamentos.descricao,
      tipo: r.treinamentos.tipo,
      duracao_seg: r.treinamentos.duracao_seg,
      prazo: r.prazo,
      status: r.status,
      pct_assistido: r.pct_assistido,
      concluido_em: r.concluido_em,
    }),
  );
});

/** Carrega uma atribuição do próprio colaborador (nunca de outra pessoa). */
async function loadOwnAssignment(atribuicaoId: string) {
  const S = await import("./treinamentos.server");
  const s = await S.currentLearner();
  if (!s) throw new Error("Sessão de treinamento expirada");
  const sb = S.adminDb();
  const { data, error } = await sb
    .from("treinamento_atribuicoes")
    .select("*, treinamentos!inner(*)")
    .eq("id", atribuicaoId)
    .eq("colaborador_id", s.c)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Treinamento não encontrado para o seu usuário");
  return { S, s, sb, a: data as AtribuicaoRow & { treinamentos: TreinamentoRow } };
}

async function logAcesso(
  colaboradorId: string,
  email: string,
  evento: string,
  treinamentoId: string,
  detalhe?: string,
) {
  const S = await import("./treinamentos.server");
  const { getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");
  await S.adminDb()
    .from("treinamento_acessos")
    .insert({
      colaborador_id: colaboradorId,
      email,
      evento,
      treinamento_id: treinamentoId,
      detalhe: detalhe ?? null,
      ip: getRequestIP({ xForwardedFor: true }) ?? null,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
}

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: loadOwnAssignment confere a sessão do colaborador e a posse da atribuição
export const openTraining = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ atribuicao_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { S, s, sb, a } = await loadOwnAssignment(data.atribuicao_id);
    const t = a.treinamentos;
    if (t.status !== "Publicado") throw new Error("Este treinamento não está disponível");
    let videoSrc: string | null = null;
    if (t.video_path) {
      // Link curto: expira em 30 min e só serve para esta sessão de estudo
      const { data: signed } = await sb.storage
        .from(S.VIDEO_BUCKET)
        .createSignedUrl(t.video_path, 60 * 30);
      videoSrc = signed?.signedUrl ?? null;
    }
    if (a.status === "Pendente") {
      await sb
        .from("treinamento_atribuicoes")
        .update({ status: "Em andamento", iniciado_em: new Date().toISOString() })
        .eq("id", a.id);
    }
    await logAcesso(s.c, s.e, "abriu", t.id);
    return {
      atribuicao_id: a.id,
      titulo: t.titulo,
      descricao: t.descricao,
      tipo: t.tipo,
      video_src: videoSrc,
      video_url: t.video_url,
      duracao_seg: t.duracao_seg,
      exigir_pct_assistido: t.exigir_pct_assistido,
      bloquear_avanco: t.bloquear_avanco,
      exigir_ciencia: t.exigir_ciencia,
      prazo: a.prazo,
      status: a.status === "Pendente" ? ("Em andamento" as AtribuicaoStatus) : a.status,
      pct_assistido: a.pct_assistido,
    };
  });

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: loadOwnAssignment confere a sessão do colaborador e a posse da atribuição
export const reportProgress = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ atribuicao_id: z.string().uuid(), pct: z.number().int().min(0).max(100) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { sb, a } = await loadOwnAssignment(data.atribuicao_id);
    if (a.status === "Concluído" || data.pct <= a.pct_assistido) return { pct: a.pct_assistido };
    await sb.from("treinamento_atribuicoes").update({ pct_assistido: data.pct }).eq("id", a.id);
    return { pct: data.pct };
  });

// nosemgrep: zsec-server-fn-sem-sessao -- página pública de treinamentos: loadOwnAssignment confere a sessão do colaborador e a posse da atribuição
export const completeTraining = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ atribuicao_id: z.string().uuid(), ciencia: z.boolean() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { s, sb, a } = await loadOwnAssignment(data.atribuicao_id);
    const t = a.treinamentos;
    if (a.status === "Concluído") return { ok: true };
    // A medição de % só existe para vídeo enviado ao Z-Sec; link externo depende só da ciência
    if (t.video_path && a.pct_assistido < t.exigir_pct_assistido) {
      throw new Error(`Assista pelo menos ${t.exigir_pct_assistido}% do vídeo para concluir`);
    }
    if ((t.exigir_ciencia || !t.video_path) && !data.ciencia)
      throw new Error("Confirme que assistiu e entendeu");
    const { error } = await sb
      .from("treinamento_atribuicoes")
      .update({
        status: "Concluído",
        concluido_em: new Date().toISOString(),
        pct_assistido: Math.max(a.pct_assistido, t.video_path ? a.pct_assistido : 100),
      })
      .eq("id", a.id);
    if (error) throw new Error(error.message);
    await logAcesso(s.c, s.e, "concluiu", t.id);
    return { ok: true };
  });
