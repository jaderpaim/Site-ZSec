import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";

const SCOPES = ["domains", "ssl"] as const;
type Scope = (typeof SCOPES)[number];

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertCanManage(userSupabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isModAdmin }, { data: canEdit }] = await Promise.all([
    userSupabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    userSupabase.rpc("is_module_admin", { _user_id: userId, _module: "dominios-ssl" }),
    userSupabase.rpc("has_module_permission", {
      _user_id: userId,
      _module: "dominios-ssl",
      _action: "edit",
    }),
  ]);
  if (!isAdmin && !isModAdmin && !canEdit) {
    throw new Error("Sem permissão para alterar destinatários de alertas");
  }
}

export const getAlertRecipientDept = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z.object({ scope: z.enum(SCOPES) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ department_id: string | null }> => {
    await assertCanManage(context.supabase, context.userId);

    const sb = adminClient();
    const { data: row } = await sb
      .from("integrations")
      .select("config")
      .eq("provider", "alerts_recipients")
      .eq("name", data.scope)
      .maybeSingle();
    const cfg = (row?.config ?? {}) as { department_id?: string | null };
    return { department_id: cfg.department_id ?? null };
  });

export const setAlertRecipientDept = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        scope: z.enum(SCOPES),
        department_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId);

    const sb = adminClient();
    const { data: existing } = await sb
      .from("integrations")
      .select("id")
      .eq("provider", "alerts_recipients")
      .eq("name", data.scope)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await sb
        .from("integrations")
        .update({ config: { department_id: data.department_id } } as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("integrations").insert({
        provider: "alerts_recipients",
        name: data.scope,
        enabled: true,
        config: { department_id: data.department_id },
        created_by: userId,
      } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Server-only helper used by the alert checkers.
 * Returns the configured department emails (lowercased & deduped) for a scope.
 */
export async function getDepartmentEmailsForScope(scope: Scope): Promise<string[]> {
  const sb = adminClient();
  const { data: cfgRow } = await sb
    .from("integrations")
    .select("config")
    .eq("provider", "alerts_recipients")
    .eq("name", scope)
    .maybeSingle();
  const deptId = ((cfgRow?.config ?? {}) as { department_id?: string | null }).department_id;
  if (!deptId) return [];
  const { data: dept } = await sb
    .from("departments")
    .select("emails")
    .eq("id", deptId)
    .maybeSingle();
  const emails: string[] = Array.isArray((dept as any)?.emails) ? (dept as any).emails : [];
  return Array.from(new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
}
