import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/use-departments";
import { usePinnedModules } from "@/lib/use-user-settings";
import { useVisibleModules } from "@/lib/use-visible-modules";
import type { ModuleDef } from "@/lib/modules";
import { AppHeader } from "@/components/layout/AppHeader";
import { ThemeSegmented } from "@/components/layout/ThemeSwitch";

export const Route = createFileRoute("/app/perfil")({ component: PerfilPage });

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  analista: "Analista",
  visualizador: "Visualizador",
  personalizado: "Personalizado",
};

/**
 * Tela "Meu perfil" (menu da conta na sidebar). Ponto de partida: dados da
 * conta, tema e módulos fixados, todos de user_settings/profiles do próprio
 * usuário. Novas preferências entram aqui como novas seções.
 */
function PerfilPage() {
  const { user, role } = useAuth();
  const { data: departments } = useDepartments();
  const { pinned, togglePin } = usePinnedModules();
  const visibleModules = useVisibleModules();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, department_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const email = user?.email ?? "";
  const name = profile?.full_name || email.split("@")[0].replace(/[._]/g, " ");
  const department = departments?.find((d) => d.id === profile?.department_id)?.name;
  const pinnedModules = pinned
    .map((slug) => visibleModules.find((m) => m.slug === slug))
    .filter((m): m is ModuleDef => !!m);

  return (
    <>
      <AppHeader title="Meu perfil" subtitle="CONTA" hidePeriod hideDepartment hideExport />
      <div className="font-ui p-6 max-w-3xl w-full mx-auto grid gap-4">
        <Section title="Conta">
          <div className="flex items-center gap-4">
            <span className="size-12 shrink-0 rounded-full grid place-items-center bg-v2-surface-2 border border-v2-line text-lg font-semibold text-v2-fg">
              {email[0]?.toUpperCase() ?? "U"}
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-v2-fg capitalize truncate">
                {name || "—"}
              </div>
              <div className="font-data text-[12px] text-v2-fg-3 break-all">{email}</div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <Field label="Perfil de acesso" value={role ? (ROLE_LABEL[role] ?? role) : "—"} />
            <Field label="Departamento" value={department ?? "—"} />
          </dl>
        </Section>

        <Section
          title="Aparência"
          description="O tema fica salvo no seu perfil e vale em qualquer computador. Auto segue o claro/escuro do sistema."
        >
          <ThemeSegmented className="w-full sm:w-[320px]" />
        </Section>

        <Section
          title="Módulos fixados"
          description="Aparecem no topo do menu lateral. Para fixar, passe o mouse num módulo do menu e clique na estrela."
        >
          {pinnedModules.length === 0 ? (
            <p className="text-[13px] text-v2-fg-3">Nenhum módulo fixado ainda.</p>
          ) : (
            <ul className="grid gap-1">
              {pinnedModules.map((m) => {
                const Icon = m.icon;
                return (
                  <li
                    key={m.slug}
                    className="flex items-center gap-3 h-11 px-2 rounded-lg hover:bg-v2-hover"
                  >
                    <span className="size-7 shrink-0 rounded-lg grid place-items-center bg-v2-surface-2 border border-v2-line text-v2-fg-3">
                      <Icon className="size-[15px]" />
                    </span>
                    <Link
                      to="/app/$module"
                      params={{ module: m.slug }}
                      className="flex-1 min-w-0 text-[13.5px] text-v2-fg hover:underline"
                    >
                      <span className="block truncate">{m.short}</span>
                      <span className="block truncate text-[11px] text-v2-fg-3">{m.group}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => togglePin(m.slug)}
                      aria-label={`Desafixar ${m.short}`}
                      title="Desafixar"
                      className="size-8 grid place-items-center rounded-md text-(--v2-cat-pin) hover:bg-v2-surface-2"
                    >
                      <Star className="size-4 fill-current" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-v2-surface border border-v2-line rounded-xl p-5">
      <h2 className="text-[14px] font-semibold text-v2-fg">{title}</h2>
      {description && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-v2-fg-3 max-w-[60ch]">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-v2-fg-3">{label}</dt>
      <dd className="mt-0.5 text-v2-fg">{value}</dd>
    </div>
  );
}
