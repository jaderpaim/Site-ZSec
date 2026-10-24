/**
 * Transforma um valor em padrão de `.ilike()` que só casa com ele mesmo (comparação
 * exata sem diferenciar maiúsculas). Sem isso, `_` e `%` num e-mail vindo do IdP viram
 * curingas — `joao_silva@x` casaria com `joao.silva@x`.
 *
 * Retorna null se o valor tiver `*`: o PostgREST troca `*` por `%` antes do LIKE e não
 * há como escapar, então quem chama deve tratar como "não encontrado".
 */
export function ilikeExactPattern(value: string): string | null {
  if (value.includes("*")) return null;
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
