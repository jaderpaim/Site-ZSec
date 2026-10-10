// Zona que o módulo Cloudflare abre por padrão: a que bate com o domínio
// corporativo cadastrado em "Dados da Organização"; sem isso, a única zona da
// conta (se houver só uma). Com várias zonas e nenhum domínio, não escolhe.
export function pickDefaultZone<Z extends { id: string; name: string }>(
  zones: Z[],
  dominioCorporativo: string | null,
): Z | null {
  const dominio = dominioCorporativo?.trim().toLowerCase();
  if (dominio) {
    const match = zones.find((z) => {
      const name = z.name.toLowerCase();
      return name === dominio || name.endsWith(`.${dominio}`) || dominio.endsWith(`.${name}`);
    });
    if (match) return match;
  }
  return zones.length === 1 ? zones[0] : null;
}
