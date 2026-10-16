# Correções de segurança — app de segurança (TanStack Start + Supabase)

Achados encontrados durante a homologação de uma cópia deste app. Cada arquivo
é autossuficiente: entregue um por vez ao Claude Code (ou a quem for corrigir)
**dentro do repositório da empresa**. Todos seguem o mesmo roteiro:
confirmar que o problema existe → corrigir → validar.

| # | Arquivo | Gravidade | Explorável sem login? |
|---|---|---|---|
| 1 | [01-security-definer-sem-login.md](01-security-definer-sem-login.md) | 🔴 Crítica | Sim |
| 2 | [02-tanstack-start-xss.md](02-tanstack-start-xss.md) | 🔴 Crítica | Sim |
| 3 | [03-hook-secret-igual-chave-publica.md](03-hook-secret-igual-chave-publica.md) | 🟠 Alta | Sim |
| 4 | [04-handle-new-user-escalonamento.md](04-handle-new-user-escalonamento.md) | 🟠 Alta (crítica se o cadastro público estiver ligado) | Sim |

**Ordem sugerida:** 1 → 2 → 3 → 4. O item 3 deve ser feito **depois** do 1:
enquanto o 1 estiver aberto, o segredo novo pode ser roubado do mesmo jeito.

**Regras para quem for corrigir:**
- Mudança de banco sempre por **migration** no repositório (nunca só pelo SQL
  Editor/DBeaver), para não haver diferença entre o código e o banco.
- Antes de qualquer `supabase db push`, confirme o projeto vinculado
  (`cat supabase/.temp/project-ref`).
- Não cole segredos (chaves, tokens) em chats, issues ou commits.
