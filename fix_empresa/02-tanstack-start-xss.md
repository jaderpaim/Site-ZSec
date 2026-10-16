# TanStack Start: XSS refletido nas respostas das server functions

**Gravidade:** 🔴 Crítica · **Explorável por:** qualquer pessoa, sem login
**Aviso:** [GHSA-qx66-fv34-fjm8](https://github.com/advisories/GHSA-qx66-fv34-fjm8)
— afeta `@tanstack/react-start` `>=1.143.12 <1.168.60` e
`@tanstack/start-server-core` `<1.169.39`.

## 1. Confirmar
```bash
bun audit --audit-level=high      # ou: npm audit
grep -oE '"@tanstack/(react-start|start-server-core)@[0-9.]+"' bun.lock | sort -u
```
Se aparecer o GHSA acima, o app está vulnerável.

## 2. Corrigir — atenção, NÃO use `bun audit fix` para isso
O `bun audit fix` atualiza só o `react-start`. Ele passa a exigir um
`react-router` mais novo, mas o app continua no antigo: o `bun.lock` fica com
**duas cópias** do router e a checagem de tipos quebra em todas as rotas
`/api/public/*` (`'server' does not exist in type ...`).

Também **não** suba para a linha **1.169**: ela renomeia `.inputValidator()`
para `.validator()` nas server functions (centenas de ocorrências) — é uma
migração à parte.

Atualize os três pacotes **juntos**, num conjunto validado (todos usam
`@tanstack/router-core@1.171.35`), com versão **fixa** (sem `^`):
```bash
bun add @tanstack/react-start@1.168.61 @tanstack/react-router@1.170.42 @tanstack/router-plugin@1.168.43
grep -oE '"@tanstack/(react-router|router-core)@[0-9.]+"' bun.lock | sort -u   # UMA versão de cada
```
Se o projeto usar npm em vez de bun, o equivalente é
`npm install --save-exact` com as mesmas versões.

### Ajuste de código obrigatório
Nessa versão o router tipa o erro do `errorComponent` como `unknown`. Em
`src/routes/__root.tsx`, troque a assinatura do componente de erro:
```tsx
import { /* ...os imports atuais..., */ type ErrorComponentProps } from "@tanstack/react-router";

// O router tipa o erro como desconhecido: pode ser qualquer valor lançado, não só Error.
function ErrorComponent({ error, reset }: ErrorComponentProps) {
  // ...
  // onde usava {error.message}:
  {error instanceof Error ? error.message : String(error)}
```

## 3. Validar
```bash
npx tsc --noEmit -p .                 # 0 erros
bun audit --audit-level=high          # sem o GHSA
npm run build                         # build ok
```
Depois do deploy, passe pelas telas principais (login, uma tela com
formulário/filtro e uma ação que grava dado): as server functions são usadas
por todas.

## Para o futuro
Quando o audit acusar algo no TanStack, atualize `react-start`,
`react-router` e `router-plugin` **juntos**. Para achar versões compatíveis:
```bash
npm view @tanstack/react-start@<versão> dependencies    # mostra o react-router exato
npm view @tanstack/react-router@<versão> dependencies   # mostra o router-core
npm view @tanstack/router-plugin@<versão> dependencies  # o plugin precisa do MESMO router-core
```
