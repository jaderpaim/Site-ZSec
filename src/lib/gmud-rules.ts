/**
 * Regras de negócio da GMUD compartilhadas entre servidor (gmud.functions.ts) e
 * tela (GmudDetailsSheet / NewGmudDialog). O servidor é quem garante; a tela só
 * usa para não oferecer o que o servidor vai recusar.
 */

/**
 * Transições de status_geral permitidas fora do fluxo de aprovação.
 * "Aprovada" e "Rejeitada" nunca aparecem como destino: só decideGmudApproval
 * leva uma GMUD até lá, depois de passar pela cadeia de aprovadores.
 */
const MANAGER_TRANSITIONS: Record<string, readonly string[]> = {
  "Em Aprovação": ["Cancelada"],
  Aprovada: ["Em Execução", "Concluída", "Rollback", "Cancelada"],
  "Em Execução": ["Concluída", "Rollback"],
  // correção do desfecho já registrado
  Concluída: ["Rollback"],
  Rollback: ["Concluída"],
};

/** O criador só registra o desfecho da própria GMUD depois de aprovada. */
const CREATOR_TRANSITIONS: Record<string, readonly string[]> = {
  Aprovada: ["Concluída", "Rollback"],
  "Em Execução": ["Concluída", "Rollback"],
};

export function allowedStatusTransitions(
  from: string | null | undefined,
  who: { isCreator: boolean; canExecute: boolean },
): string[] {
  const out = new Set<string>();
  if (!from) return [];
  if (who.canExecute) for (const s of MANAGER_TRANSITIONS[from] ?? []) out.add(s);
  if (who.isCreator) for (const s of CREATOR_TRANSITIONS[from] ?? []) out.add(s);
  return [...out];
}

/** GMUD Emergencial ou de impacto Crítico exige a Gerência de TI na cadeia. */
export function requiresGerenciaTi(
  tipo: string | null | undefined,
  impacto: string | null | undefined,
) {
  return tipo === "Emergencial" || impacto === "Crítico";
}

export function isGerenciaTiName(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("gerência de ti") || n.includes("gerencia de ti");
}
