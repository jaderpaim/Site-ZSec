/**
 * Valida que `path` é um destino de navegação seguro dentro do próprio app.
 *
 * Checagens manuais por prefixo (`startsWith("/")`, `!startsWith("//")`)
 * não bastam: variações como "/\evil.com", "\evil.com" ou "\/evil.com" não
 * batem com "//" mas o parser de URL do runtime normaliza a contrabarra e
 * resolve para um host diferente — um bypass clássico de filtro de
 * open-redirect. Resolver com `URL` e comparar a origem contra uma origem
 * fixa fictícia replica a normalização real do navegador e fecha essa
 * brecha, sem depender de listar cada variante de prefixo manualmente.
 */
export function isSafeRedirectPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  try {
    const base = "https://internal.invalid";
    return new URL(path, base).origin === base;
  } catch {
    return false;
  }
}
