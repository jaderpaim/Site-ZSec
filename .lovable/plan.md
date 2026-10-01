# Corrigir og:image apontando para o domínio oficial

## Problema
Em `src/routes/__root.tsx`, as metatags `og:image` e `twitter:image` usam uma URL no CDN `pub-...r2.dev` cujo path contém o subdomínio de preview (`id-preview-dfdb85b5--ad2d9bfd-...lovable.app`). Embora seja só uma imagem estática hospedada em CDN (não há bypass real de ambiente), o path expõe o ambiente de preview e é indesejado.

## Solução
1. Gerar uma imagem OG/social (1200x630) representando o B-Security e salvá-la em `public/og-image.png`.
2. Em `src/routes/__root.tsx`, trocar os valores das metatags:
   - `og:image` → `https://b-security.bernoulli.com.br/og-image.png`
   - `twitter:image` → `https://b-security.bernoulli.com.br/og-image.png`
3. Manter as demais metatags como estão.

## Detalhes técnicos
- Arquivos alterados: `src/routes/__root.tsx`, novo `public/og-image.png`.
- Como og:image fica no root, ele se aplica a todas as rotas (já é o comportamento atual).
- Aviso ao usuário: crawlers (LinkedIn, WhatsApp, X) cacheiam previews; a nova imagem só aparecerá após o re-fetch automático ou via debugger de preview.

## Pergunta
Posso gerar uma nova imagem OG genérica (logo + tagline "Plataforma corporativa de Segurança da Informação" sobre fundo escuro) ou você prefere fazer upload da sua própria arte?
