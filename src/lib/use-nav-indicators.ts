import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { ModuleDef } from "@/lib/modules";

/**
 * Contadores do menu lateral: quantos itens pedem atenção em cada módulo.
 * As consultas passam pelo RLS do usuário (mesmo escopo que ele vê no módulo).
 * Se uma consulta falhar (sem permissão, tabela vazia), o contador simplesmente não aparece.
 */
export type NavIndicatorTone = "crit" | "warn" | "info";
export type NavIndicator = { count: number; tone: NavIndicatorTone; label: string };

const REFRESH_MS = 5 * 60 * 1000;

async function headCount(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count, error } = await build();
  if (error) throw error;
  return count ?? 0;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const LOADERS: Record<string, () => Promise<NavIndicator | null>> = {
  // Vulnerabilidades críticas ainda abertas (aplicações + infraestrutura)
  vulnerabilidades: async () => {
    const [app, infra] = await Promise.all(
      (["vulnerabilities_aplicacao", "vulnerabilities_infra"] as const).map((t) =>
        headCount(() =>
          supabase
            .from(t)
            .select("id", { count: "exact", head: true })
            .eq("severity", "Crítica")
            .eq("status", "Aberta"),
        ),
      ),
    );
    const n = app + infra;
    return {
      count: n,
      tone: "crit",
      label: plural(n, "vulnerabilidade crítica aberta", "vulnerabilidades críticas abertas"),
    };
  },

  // Ofensas do QRadar que ainda não foram fechadas
  soc: async () => {
    const n = await headCount(() =>
      supabase
        .from("qradar_offenses")
        .select("id", { count: "exact", head: true })
        .neq("status", "CLOSED"),
    );
    return {
      count: n,
      tone: "crit",
      label: plural(n, "ofensa aberta no QRadar", "ofensas abertas no QRadar"),
    };
  },

  // Endpoints com saúde "bad" na Sophos
  "sophos-xdr": async () => {
    const n = await headCount(() =>
      supabase
        .from("sophos_endpoints")
        .select("id", { count: "exact", head: true })
        .eq("health_overall", "bad"),
    );
    return {
      count: n,
      tone: "crit",
      label: plural(n, "endpoint com saúde crítica", "endpoints com saúde crítica"),
    };
  },

  // Certificados vencidos ou dentro da janela de alerta de cada um (alert_days)
  "dominios-ssl": async () => {
    const { data, error } = await supabase.from("ssl_certificates").select("valid_to, alert_days");
    if (error) throw error;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expired = 0;
    let expiring = 0;
    for (const c of data ?? []) {
      if (!c.valid_to) continue;
      const days = Math.floor((new Date(c.valid_to).getTime() - today.getTime()) / 86400000);
      if (days < 0) expired++;
      else if (days <= (c.alert_days ?? 30)) expiring++;
    }
    const n = expired + expiring;
    const label =
      expired > 0
        ? `${plural(expired, "certificado vencido", "certificados vencidos")}${expiring ? `, ${expiring} perto do vencimento` : ""}`
        : plural(n, "certificado perto do vencimento", "certificados perto do vencimento");
    return { count: n, tone: expired > 0 ? "crit" : "warn", label };
  },

  // Mudanças aguardando aprovação
  gmud: async () => {
    const n = await headCount(() =>
      supabase
        .from("gmuds")
        .select("id", { count: "exact", head: true })
        .eq("status_geral", "Em Aprovação"),
    );
    return {
      count: n,
      tone: "warn",
      label: plural(n, "mudança aguardando aprovação", "mudanças aguardando aprovação"),
    };
  },
};

export function useNavIndicators(visibleModules: ModuleDef[]) {
  const { user } = useAuth();
  const slugs = visibleModules.map((m) => m.slug).filter((s) => s in LOADERS);

  const { data } = useQuery({
    queryKey: ["nav-indicators", user?.id, slugs.join(",")],
    enabled: !!user && slugs.length > 0,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const results = await Promise.allSettled(slugs.map((s) => LOADERS[s]()));
      const out: Record<string, NavIndicator> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value && r.value.count > 0) out[slugs[i]] = r.value;
      });
      return out;
    },
  });

  return data ?? {};
}
