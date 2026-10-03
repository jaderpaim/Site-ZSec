import * as React from "react";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";

export const GMUD_STATUSES = [
  "Rascunho",
  "Em Aprovação",
  "Aprovada",
  "Rejeitada",
  "Cancelada",
  "Em Execução",
  "Concluída",
  "Rollback",
] as const;
export type GmudStatus = (typeof GMUD_STATUSES)[number];

/** Aprovador como vem de listGmuds/getGmud (`ativo` calculado no backend). */
export type GmudAprovador = {
  id: string;
  ordem: number | null;
  nome_aprovador: string;
  email_aprovador: string | null;
  papel: string | null;
  status_aprovacao: string;
  data_acao: string | null;
  notificado_em: string | null;
  observacoes?: string | null;
  ativo?: boolean;
};

/** GMUD como vem de listGmuds/getGmud (só os campos que a interface usa). */
export type GmudRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  justificativa: string | null;
  tipo: string;
  impacto: string | null;
  status_geral: string;
  created_at: string;
  data_inicio: string | null;
  data_fim: string | null;
  plano_execucao: string | null;
  plano_rollback: string | null;
  motivo_cancelamento: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_por_email: string | null;
  total_aprovadores?: number;
  aprovadores?: GmudAprovador[];
};

export const sortAprovadores = (aprs: GmudAprovador[] | undefined) =>
  [...(aprs ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

export const errMsg = (e: unknown, fallback = "Erro inesperado") =>
  e instanceof Error ? e.message : fallback;

/**
 * Quem pode excluir: admin/analista sempre; fora disso, só o criador e só
 * enquanto a GMUD está "Em Aprovação" sem nenhuma decisão registrada (mesma
 * regra do backend em deleteGmud — aqui só decide se o botão aparece).
 */
export function useCanDeleteGmud() {
  const { isAdmin, can } = usePermissions();
  const { role, user } = useAuth();
  const isPrivilegedDeleter = isAdmin || role === "analista";
  return React.useCallback(
    (g: GmudRow | null | undefined): boolean => {
      if (!g || !can("gmud", "delete")) return false;
      if (isPrivilegedDeleter) return true;
      if (g.criado_por !== user?.id) return false;
      if (g.status_geral !== "Em Aprovação") return false;
      return !(g.aprovadores ?? []).some((a) => a.status_aprovacao !== "Pendente");
    },
    [can, isPrivilegedDeleter, user?.id],
  );
}
