# Painel C-Level — dashboard de segurança para o sócio-fundador

Novo módulo no grupo **Executivo** da barra lateral, chamado **Painel C-Level**, escrito na linguagem do dono do negócio: sem jargão, com semáforos, frases curtas e uma métrica-âncora por bloco. Números fictícios porém coerentes com 1.000 colégios parceiros e 400.000 alunos.

## Como a tela conta a história (na ordem)

**1. Está tudo bem? (visão de 5 segundos)**
Faixa larga no topo com um único semáforo (Verde / Amarelo / Vermelho) e uma frase de dono, ex.: "Estamos protegidos. Nenhuma aula foi interrompida por segurança nos últimos 30 dias." Ao lado, três selos curtos: aulas no ar, dados de alunos protegidos, pendências que precisam de você.

**2. O que protegemos**
Quatro cartões grandes: 400.000 alunos, 1.000 colégios parceiros, dados de menores de idade sob guarda (destaque LGPD) e sistemas essenciais de aula monitorados. Cada cartão traz uma linha de tradução ("por que isso importa"), e o bloco de menores exibe um selo de conformidade com a lei de proteção de dados.

**3. O que está acontecendo agora**
Métrica-âncora: tentativas de invasão bloqueadas no mês, com comparação ("28% menos que no mês passado") e a consequência evitada ("poderiam ter parado as aulas em até 120 colégios"). Abaixo: e-mails falsos barrados antes de chegarem aos colégios, incidentes em aberto com prazo, e um mini-quadro "o que isso significa" em uma frase por item.

**4. Estamos melhorando?**
Um único gráfico simples de 6 meses (uma linha: nota geral de proteção de 0 a 100) com marcação do trimestre anterior e uma leitura em texto: "Estamos mais seguros que no trimestre passado." Ao lado, três indicadores de tendência com seta e frase (tempo para resolver um problema, colégios com proteção completa, treinamento das equipes).

**5. Onde preciso decidir**
Três cartões de decisão. Cada um com: título sem jargão, o que acontece se não agirmos (em risco de negócio: aulas paradas, exposição de dados de menores, confiança dos colégios), investimento estimado, prazo sugerido e um selo de prioridade.

Rodapé: data de referência, responsável (Head de Segurança da Informação) e aviso de que os números são ilustrativos.

## Detalhes técnicos

- Novo componente `src/components/dashboard/PainelCLevel.tsx`, com dados fictícios em constantes no topo do arquivo (sem chamadas ao backend, sem migrações).
- Registro do módulo em `src/lib/modules.ts` (slug `painel-c-level`, grupo `Executivo`, ícone `Presentation`, header sem período/departamento/exportação) e em `src/components/dashboard/dashboards.tsx`.
- Visibilidade: mesmo tratamento do Painel Executivo — módulo exclusivo (`src/lib/exclusive-modules.ts` + regra na sidebar), acesso só para super_admin ou quem receber concessão explícita. Requer uma migração curta apenas para incluir o slug nas funções de permissão do banco, no mesmo padrão já usado pelo Painel Executivo.
- Estilo: paleta escura de diretoria já usada no Painel Executivo, tipografia grande, um gráfico único via recharts. Nada de tabelas densas.
