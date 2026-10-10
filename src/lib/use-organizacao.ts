import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrganizacao, ORG_FALLBACK, type Organizacao } from "@/lib/organizacao.functions";

/** Dados da organização da instância, com fallback neutro enquanto carrega ou se não configurada. */
export function useOrganizacao(): Organizacao & { rotulo: string } {
  const get = useServerFn(getOrganizacao);
  const { data } = useQuery({
    queryKey: ["organizacao"],
    queryFn: () => get(),
    staleTime: 5 * 60_000,
  });
  const org = data ?? ORG_FALLBACK;
  // Rótulo curto para gráficos e legendas: nome curto, ou o nome completo.
  return { ...org, rotulo: org.nome_curto || org.nome };
}
