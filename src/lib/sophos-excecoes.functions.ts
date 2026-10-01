import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SophosExcecaoRow = {
  id: string;
  event_name: string;
  match_type: "exact" | "contains";
  target: "event" | "user";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const listSophosExcecoes = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<SophosExcecaoRow[]> => {
    await requirePermission(context.supabase, context.userId, "excecao-sophos", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("sophos_excecoes")
      .select("id, event_name, match_type, target, created_by, created_at, updated_at")
      .order("event_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SophosExcecaoRow[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  event_name: z.string().min(1).max(200),
  match_type: z.enum(["exact", "contains"]),
  target: z.enum(["event", "user"]).default("event"),
});

export const upsertSophosExcecao = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "excecao-sophos", data.id ? "create" : "create");
    const sb = admin();
    const payload = { event_name: data.event_name.trim(), match_type: data.match_type, target: data.target };
    if (data.id) {
      const { error } = await sb.from("sophos_excecoes").update(payload).eq("id", data.id);
      await logAudit({
        userId: context.userId,
        modulo: "excecao-sophos",
        acao: "update",
        descricao: `Editou a exceção Sophos "${payload.event_name}"`,
        status: error ? "error" : "success",
        mensagemErro: error?.message ?? null,
        detalhes: payload,
      });
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await sb
      .from("sophos_excecoes")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    await logAudit({
      userId: context.userId,
      modulo: "excecao-sophos",
      acao: "create",
      descricao: `Criou a exceção Sophos "${payload.event_name}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: payload,
    });
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteSophosExcecao = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "excecao-sophos", "delete");
    const sb = admin();
    const { data: existing } = await sb.from("sophos_excecoes").select("event_name").eq("id", data.id).maybeSingle();
    const { error } = await sb.from("sophos_excecoes").delete().eq("id", data.id);
    await logAudit({
      userId: context.userId,
      modulo: "excecao-sophos",
      acao: "delete",
      descricao: `Excluiu a exceção Sophos "${existing?.event_name ?? data.id}"`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: { id: data.id },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
