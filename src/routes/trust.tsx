import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Users, Database, Mail, FileText } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Confiança e Segurança — B-Security" },
      {
        name: "description",
        content:
          "Página de confiança do B-Security: práticas de segurança, privacidade e controles disponíveis na plataforma.",
      },
      { property: "og:title", content: "Confiança e Segurança — B-Security" },
      {
        property: "og:description",
        content:
          "Página de confiança do B-Security: práticas de segurança, privacidade e controles disponíveis na plataforma.",
      },
      { name: "twitter:title", content: "Confiança e Segurança — B-Security" },
      {
        name: "twitter:description",
        content:
          "Página de confiança do B-Security: práticas de segurança, privacidade e controles disponíveis na plataforma.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold text-foreground">
            B-Security
          </Link>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Confiança e Segurança</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Esta página é mantida pelos responsáveis pelo B-Security para responder dúvidas comuns
            sobre segurança e privacidade da plataforma. O conteúdo é informativo e editável pelos
            mantenedores; não constitui certificação independente nem auditoria externa.
          </p>
        </div>

        <div className="grid gap-4">
          <Section icon={Lock} title="Acesso e Autenticação">
            <p>
              O B-Security é uma plataforma interna de uso restrito. O acesso requer autenticação
              por e-mail/senha ou provedores SSO habilitados (Google, Microsoft/Azure AD), com
              suporte opcional a SAML.
            </p>
            <p>
              Permissões são controladas por papéis (admin, analista, visualizador) e por permissões
              granulares por módulo. Cada requisição autenticada é validada no servidor.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Plataforma e Hospedagem">
            <p>
              A aplicação é hospedada em infraestrutura serverless de borda e utiliza um banco de
              dados Postgres gerenciado. Toda comunicação entre o navegador e o servidor ocorre via
              HTTPS/TLS.
            </p>
            <p>
              A separação entre operações de leitura e operações privilegiadas é feita no servidor:
              chaves administrativas nunca são expostas ao navegador.
            </p>
          </Section>

          <Section icon={Database} title="Dados e Retenção">
            <p>
              Os dados tratados pelo B-Security são definidos pelo cliente que opera a instância e
              utilizados exclusivamente para as finalidades de monitoramento e operação de
              segurança configuradas no produto.
            </p>
            <p>
              Políticas específicas de retenção, exclusão e localização de dados devem ser
              confirmadas com os responsáveis pela instância.
            </p>
          </Section>

          <Section icon={Users} title="Controle por Linha (RLS) e Auditoria">
            <p>
              Tabelas sensíveis utilizam políticas de segurança em nível de linha (Row-Level
              Security) no banco de dados. Ações administrativas e tentativas de autenticação são
              registradas em logs internos disponíveis para administradores.
            </p>
          </Section>

          <Section icon={FileText} title="Subprocessadores e Integrações">
            <p>
              O B-Security integra-se com serviços de terceiros (por exemplo, provedores de
              identidade, gateways de e-mail e ferramentas de segurança configuradas pelo cliente).
              A lista exata de integrações ativas depende da configuração de cada instância.
            </p>
          </Section>

          <Section icon={Mail} title="Contato e Relato de Vulnerabilidades">
            <p>
              Para reportar uma possível vulnerabilidade ou solicitar informações adicionais sobre
              segurança e privacidade, entre em contato com os administradores da instância em que
              você utiliza o B-Security.
            </p>
          </Section>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Este conteúdo é mantido pelos responsáveis pelo B-Security. Declarações sobre conformidade
          (LGPD, GDPR, ISO, SOC 2, etc.), criptografia específica ou compromissos contratuais devem
          ser confirmadas diretamente com o time responsável pela instância.
        </p>
      </main>
    </div>
  );
}
