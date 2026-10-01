import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/layout/AppHeader";
import { DASHBOARDS } from "@/components/dashboard/dashboards";
import { MODULE_BY_SLUG } from "@/lib/modules";
import { usePermissions } from "@/lib/use-permissions";
import { Loader2, Lock } from "lucide-react";

export const Route = createFileRoute("/app/$module")({ component: ModulePage });

function ModulePage() {
  const { module } = Route.useParams();
  const def = MODULE_BY_SLUG[module];
  const Dash = DASHBOARDS[module];
  const { isAdmin, can, isAnyModuleAdmin, isModuleAdmin, isDastAllowed, loading } = usePermissions();

  if (!def || !Dash) {
    return <Navigate to="/app/$module" params={{ module: "vulnerabilidades" }} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const { hidePeriod, hideDepartment, hideExport } = def.headerConfig ?? {};

  // Para gmud: view desabilitado oculta só o dashboard, mas mantém acesso
  // à Guia de Operação se tiver qualquer outra permissão
  const allowedGmud =
    module === "gmud" &&
    (can("gmud", "create") ||
      can("gmud", "edit") ||
      can("gmud", "approve") ||
      can("gmud", "execute") ||
      can("gmud", "delete"));

  const allowed =
    module === "dast-scanner" || module === "shadow-it"
      ? isDastAllowed // exclusivo: admin + depto Segurança da Informação (Shadow IT reaproveita o mesmo gate)
      : isAdmin ||
        allowedGmud ||
        (module === "usuarios"
          ? isAnyModuleAdmin()
          : isModuleAdmin(module) || can(module, "view") || can(module, "manage"));

  if (!allowed) {
    return (
      <>
        <AppHeader
          title={def.title}
          subtitle={def.group.toUpperCase()}
          moduleSlug={module}
          hidePeriod={hidePeriod}
          hideDepartment={hideDepartment}
          hideExport={hideExport}
        />
        <div className="p-8 max-w-2xl w-full mx-auto">
          <div className="border border-border bg-surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
            <Lock className="size-8 text-muted-foreground" />
            <div className="text-lg font-semibold">Acesso restrito</div>
            <div className="text-sm text-muted-foreground">
              Você não tem permissão para visualizar este módulo. Solicite acesso ao administrador.
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={def.title}
        subtitle={def.group.toUpperCase()}
        moduleSlug={module}
        hidePeriod={hidePeriod}
        hideDepartment={hideDepartment}
        hideExport={hideExport}
      />
      <div className="p-8 max-w-[1600px] w-full mx-auto">
        <Dash />
      </div>
    </>
  );
}
