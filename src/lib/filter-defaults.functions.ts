import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";

export type ModuleFilterDefault = {
  period: "all" | "30d" | "60d" | "90d" | "custom";
  customFrom: string | null;
  customTo: string | null;
};

export const getModuleFilterDefault = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { module: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_module_filter_defaults")
      .select("period, custom_from, custom_to")
      .eq("user_id", userId)
      .eq("module", data.module)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const filterDefault: ModuleFilterDefault | null = row
      ? { period: row.period as ModuleFilterDefault["period"], customFrom: row.custom_from, customTo: row.custom_to }
      : null;
    return { ok: true as const, filterDefault };
  });

export const saveModuleFilterDefault = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: { module: string; period: string; customFrom?: string | null; customTo?: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_module_filter_defaults")
      .upsert(
        {
          user_id: userId,
          module: data.module,
          period: data.period,
          custom_from: data.customFrom ?? null,
          custom_to: data.customTo ?? null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,module" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
