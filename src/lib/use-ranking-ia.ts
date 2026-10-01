import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRankingIaUsuarios, type RankingIaUsuario } from "@/lib/ia.functions";
import { supabase } from "@/integrations/supabase/client";

export type RankingIAFilters = {
  tool?: string;
  dept?: string;
  unit?: string;
  from?: string;
  to?: string;
};

export function useRankingIA(limit = 20, filters?: RankingIAFilters) {
  const fetchFn = useServerFn(getRankingIaUsuarios);
  const qc = useQueryClient();
  const queryKey = React.useMemo(
    () => ["ranking-ia-usuarios", limit, filters ?? {}] as const,
    [limit, filters],
  );

  const query = useQuery<RankingIaUsuario[]>({
    queryKey,
    queryFn: () => fetchFn({ data: { limit, ...(filters ?? {}) } }),
  });

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("ranking-ia-usuarios")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ia_web_events" },
        () => {
          // Debounce: sync inserts thousands of rows at once; only refetch once it settles.
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => qc.invalidateQueries({ queryKey }), 5000);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc, queryKey]);

  return { data: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
