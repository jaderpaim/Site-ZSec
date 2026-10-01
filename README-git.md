# Guia: apontar o projeto para um novo repositório Git (Gitea)

Use este guia quando quiser criar um projeto novo a partir deste código e enviá-lo para outro repositório. O guia faz quatro coisas:

1. Troca o remote antigo pelo novo.
2. Configura o autor dos commits.
3. Remove segredos versionados.
4. Recomeça o histórico do zero, para que commits antigos (e os segredos neles) não sejam enviados ao repositório novo.

Rode todos os comandos no terminal, **na pasta raiz do projeto**.

> **Antes de começar:** crie o repositório vazio no Gitea e copie a URL HTTPS dele.
> Exemplo usado aqui: `https://git.homepaim.com.br/jaderpaim/Projeto_Z-Sec`

---

## 0. Conferir o estado atual

```bash
git remote -v          # mostra para onde o projeto aponta hoje
git status --short     # mostra arquivos alterados ainda sem commit
git config user.email  # mostra o e-mail configurado (vazio = não configurado)
```

---

## 1. Trocar o remote

```bash
git remote remove origin
git remote add origin https://jaderpaim@git.homepaim.com.br/jaderpaim/NOME-DO-REPO.git
git remote -v
```

O `git remote -v` deve mostrar duas linhas (fetch e push) com a URL nova.

---

## 2. Configurar o autor dos commits

Use o mesmo e-mail da sua conta no Gitea, porque é ele que liga os commits ao seu usuário.

```bash
git config user.name "Jader Paim"
git config user.email "SEU-EMAIL-DO-GITEA"
```

> Sem `--global`, a configuração vale só para este projeto. Com `--global`, vale para todos os repositórios da máquina.

---

## 3. Remover segredos versionados

Procure chaves e segredos nos arquivos que vão para o repositório:

```bash
grep -rn "sb_secret_\|service_role\|SECRET\|PASSWORD" . --exclude-dir=node_modules --exclude-dir=.git
```

O lugar mais comum é o `.claude/settings.json`. Comandos `curl` aprovados no Claude Code ficam salvos ali com as chaves dentro. Para ver em quais linhas:

```bash
grep -n "sb_secret_" .claude/settings.json
```

Abra o arquivo no VSCode e apague essas linhas inteiras. Se a linha apagada for a última de uma lista `[ ]`, tire também a vírgula que sobrar no fim da linha anterior, senão o JSON fica inválido. Depois confira:

```bash
grep -c "sb_secret_" .claude/settings.json   # deve mostrar 0
```

> Se uma chave já foi enviada para algum repositório, **considere-a vazada**: gere uma nova no painel do Supabase (Project Settings → API) e revogue a antiga.

---

## 4. Recomeçar o histórico (commit inicial limpo)

Este passo cria uma branch sem histórico, contendo só os arquivos atuais:

```bash
git checkout --orphan novo-main
git add -A
git status
```

No `git status`, confirme que **não** aparecem:

- `node_modules/`
- `.env.local` ou qualquer outro `.env*`
- binários grandes que você não queira no repositório (ex.: `cloudflared.exe`)

Para tirar um arquivo do commit sem apagá-lo do disco:

```bash
git rm --cached cloudflared.exe
echo "cloudflared.exe" >> .gitignore
git add .gitignore
```

Se estiver tudo certo, faça o commit e substitua a `main` antiga:

```bash
git commit -m "Commit inicial do projeto"
git branch -D main       # apaga a main antiga (com o histórico velho)
git branch -m main       # renomeia novo-main para main
git log --oneline        # deve mostrar só 1 commit
```

> **Quer manter o histórico antigo?** Pule este passo e faça só um commit normal com a remoção dos segredos. Os segredos continuarão acessíveis nos commits antigos.

---

## 5. Enviar para o repositório novo

```bash
git push -u origin main
```

- **Senha:** o Gitea vai pedir a senha do usuário. Se a conta tiver 2FA, use um **token** no lugar dela: Gitea → Configurações → Aplicações → Gerar token, com permissão de escrita em repositório.
- **`rejected (fetch first)`:** o repositório foi criado com README ou licença. Como ainda não tem nada seu, sobrescreva com `git push -u origin main --force`, **só neste primeiro push**.

Depois, abra a página do repositório no Gitea e confira se os arquivos estão lá.

---

## 6. Limpezas recomendadas depois do primeiro push

Itens que ainda apontam para o projeto de origem:

| O quê | Por quê | O que fazer |
| --- | --- | --- |
| `.github/workflows/sync-prod.yml` | Espelha o código para o repositório de produção do Bernoulli | Apagar |
| `.lovable/` | Liga o projeto ao Lovable antigo | Apagar, se não for usar o Lovable |
| `supabase/config.toml` | `project_id` do Supabase antigo | Trocar quando criar o Supabase novo |
| `README.md` e `supabase/migrations/` | Domínio `b-security.bernoulli.com.br` | Trocar quando tiver o domínio novo |
| `.claude/settings.json` | URLs e comandos do ambiente antigo | Revisar e limpar |

Para encontrar as referências restantes:

```bash
grep -rnI "homepaim\|Si-Bernoulli\|lovable.dev/projects\|b-security.bernoulli\|tcacmepuiyoqkypatkqa" . --exclude-dir=node_modules --exclude-dir=.git
```

Depois das mudanças:

```bash
git add -A
git commit -m "Remove referências ao projeto de origem"
git push
```

---

## Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| `fatal: No such remote 'origin'` | O remote já tinha sido removido. Siga para o `git remote add` |
| `error: remote origin already exists` | Rode `git remote remove origin` antes do `add`, ou troque a URL com `git remote set-url origin <url>` |
| `Authentication failed` | Senha errada, ou a conta tem 2FA: use um token |
| `rejected (fetch first)` no primeiro push | O repositório remoto não estava vazio: use `--force` só nesse primeiro push |
| `error: Cannot delete branch 'main' checked out` | Você ainda está na `main`: rode `git checkout novo-main` antes do `git branch -D main` |
| Push muito lento ou `file exceeds size limit` | Algum binário grande entrou no commit: tire-o com `git rm --cached` e faça `git commit --amend` |
| `Author identity unknown` | Faltou o passo 2 |
