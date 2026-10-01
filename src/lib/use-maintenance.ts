import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

// ── Tipos ────────────────────────────────────────────────────────────────────
export type MaintenanceState = {
  active: boolean;
  activated_by: string | null;   // email de quem ativou
  activated_at: string | null;
  message: string | null;
};

const TABLE = "app_settings";
const KEY   = "maintenance_mode";

const DEFAULT: MaintenanceState = {
  active: false,
  activated_by: null,
  activated_at: null,
  message: null,
};

// ── Hook principal ────────────────────────────────────────────────────────────
export function useMaintenance() {
  const qc = useQueryClient();

  // Realtime — qualquer UPDATE na linha 'maintenance_mode' refetch automático
  useEffect(() => {
    // Remove canal existente antes de criar novo
    const existing = supabase.getChannels().find((c) => c.topic === "realtime:maintenance-mode");
    if (existing) supabase.removeChannel(existing);

    const channel = supabase.channel("maintenance-mode");

    // Adiciona listener ANTES de subscribe
    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: TABLE, filter: `key=eq.${KEY}` },
      () => qc.invalidateQueries({ queryKey: ["maintenance"] })
    );

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const { data = DEFAULT, isLoading } = useQuery<MaintenanceState>({
    queryKey: ["maintenance"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(TABLE)
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      if (!data?.value) return DEFAULT;
      return data.value as MaintenanceState;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return { maintenance: data, isLoading };
}

// ── Hook para toggle (apenas SI) ──────────────────────────────────────────────
export function useMaintenanceToggle() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (active: boolean) => {
      const value: MaintenanceState = {
        active,
        activated_by: active ? (user?.email ?? null) : null,
        activated_at: active ? new Date().toISOString() : null,
        message: active ? "Sistema em manutenção" : null,
      };

      const { error } = await (supabase as any)
        .from(TABLE)
        .upsert({ key: KEY, value }, { onConflict: "key" });

      if (error) throw new Error(error.message);
      return value;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}