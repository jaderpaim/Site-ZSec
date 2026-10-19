import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type UserSettings = { theme: "dark" | "light"; pinned_modules: string[] };

const DEFAULTS: UserSettings = { theme: "dark", pinned_modules: [] };

// Até regenerar src/integrations/supabase/types.ts com a tabela user_settings;
// depois disso, trocar `db` por `supabase` e apagar esta linha.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

/**
 * Preferências do usuário logado (tabela user_settings). A linha só existe
 * depois do primeiro save: `row` null = nunca salvou, vale DEFAULTS.
 */
export function useUserSettings() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const queryKey = ["user-settings", uid];

  const { data: row } = useQuery({
    queryKey,
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async (): Promise<UserSettings | null> => {
      const { data, error } = await db
        .from("user_settings")
        .select("theme, pinned_modules")
        .eq("user_id", uid!)
        .maybeSingle();
      if (error) throw error;
      return (data as UserSettings | null) ?? null;
    },
  });

  const { mutate: update } = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const { error } = await db.from("user_settings").upsert({ user_id: uid!, ...patch });
      if (error) throw error;
    },
    // Otimista: o menu reage na hora; se o save falhar, volta ao valor anterior
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<UserSettings | null>(queryKey);
      qc.setQueryData<UserSettings>(queryKey, { ...DEFAULTS, ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => qc.setQueryData(queryKey, ctx?.prev ?? null),
  });

  return { row, settings: row ?? DEFAULTS, update };
}

export function usePinnedModules() {
  const { settings, update } = useUserSettings();
  const pinned = settings.pinned_modules;
  const togglePin = (slug: string) =>
    update({
      pinned_modules: pinned.includes(slug) ? pinned.filter((s) => s !== slug) : [...pinned, slug],
    });
  return { pinned, togglePin };
}
