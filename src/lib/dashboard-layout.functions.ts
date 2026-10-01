import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";

export const getDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { module: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_dashboard_layouts")
      .select("layout")
      .eq("user_id", userId)
      .eq("module", data.module)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    type Block = { id: string; title: string; size: string };
    const layout = (row?.layout ?? null) as Block[] | null;
    return { ok: true as const, layout };
  });

export const saveDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { module: string; layout: Array<{ id: string; title: string; size: string }> }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_dashboard_layouts")
      .upsert(
        { user_id: userId, module: data.module, layout: data.layout as never, updated_at: new Date().toISOString() } as never,
        { onConflict: "user_id,module" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
