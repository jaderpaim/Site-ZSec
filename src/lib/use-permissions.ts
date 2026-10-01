import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { isExclusiveModule } from "@/lib/exclusive-modules";

export type PermissionMatrix = {
  isGlobalAdmin: boolean;
  isSuperAdmin: boolean;
  moduleAdmins: Set<string>;
  perms: Set<string>; // "module:action"
  departmentName: string | null;
};

function normalizeModuleSlug(moduleSlug: string): string {
  if (moduleSlug === "sophos") return "sophos-xdr";
  if (moduleSlug === "cloudflare") return "cloudflare-waf";
  return moduleSlug;
}

const EMPTY: PermissionMatrix = {
  isGlobalAdmin: false,
  isSuperAdmin: false,
  moduleAdmins: new Set(),
  perms: new Set(),
  departmentName: null,
};

export function usePermissions() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  // Limpa cache ao trocar de usuário ou fazer logout
  useEffect(() => {
    if (user?.id) {
      qc.invalidateQueries({ queryKey: ["permissions"] });
    } else {
      qc.removeQueries({ queryKey: ["permissions"] });
    }
  }, [user?.id]);

  // Realtime: escuta mudanças nas 3 tabelas de permissão do usuário logado
  // Qualquer INSERT, UPDATE ou DELETE dispara refetch imediato — sem reload
  useEffect(() => {
    if (!user?.id) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["permissions", user.id] });
    };

    const CHANNEL_NAME = `permissions:${user.id}`;

    // Remove canal existente antes de criar um novo (evita erro de subscribe duplo)
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${CHANNEL_NAME}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(CHANNEL_NAME)
      // user_roles: sem filtro — DELETE não propaga filtro no Postgres replication
      // invalidamos para qualquer mudança e o queryFn filtra pelo user_id
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "user_roles" }, invalidate)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "module_admins" }, invalidate)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "user_module_permissions" }, invalidate);

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ["permissions", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PermissionMatrix> => {
      if (!user) return EMPTY;
      // admin e super_admin têm a mesma visibilidade/operação em todos os módulos.
      // A diferença entre eles (só super_admin pode gerenciar OUTROS usuários) é
      // aplicada à parte, em assertCanManageUsers (server) e nos gates específicos
      // da tela de Gestão de Usuários (client) — não neste bypass geral.
      const isGlobalAdmin = role === "admin" || role === "super_admin";
      const isSuperAdmin = role === "super_admin";
      const [{ data: admins }, { data: perms }, { data: profile }] = await Promise.all([
        supabase.from("module_admins").select("module_slug").eq("user_id", user.id),
        supabase.from("user_module_permissions").select("module_slug, action").eq("user_id", user.id),
        supabase.from("profiles").select("department_id").eq("id", user.id).maybeSingle(),
      ]);
      let departmentName: string | null = null;
      const deptId = (profile as any)?.department_id ?? null;
      if (deptId) {
        const { data: dept } = await supabase.from("departments").select("name").eq("id", deptId).maybeSingle();
        departmentName = (dept as any)?.name ?? null;
      }
      return {
        isGlobalAdmin,
        isSuperAdmin,
        moduleAdmins: new Set((admins ?? []).map((r: any) => normalizeModuleSlug(r.module_slug))),
        perms: new Set((perms ?? []).map((r: any) => `${normalizeModuleSlug(r.module_slug)}:${r.action}`)),
        departmentName,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 min — Realtime invalida quando há mudança real
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Módulos exclusivos (ex.: Benchmark) não usam o bypass de admin comum —
  // só super_admin passa automático; admin (e todo o resto) precisa de
  // concessão explícita em module_admins/user_module_permissions.
  function can(moduleSlug: string, action: string): boolean {
    if (!user) return false;
    const bypass = isExclusiveModule(moduleSlug) ? data.isSuperAdmin : data.isGlobalAdmin;
    if (bypass) return true;
    if (data.moduleAdmins.has(moduleSlug)) return true;
    return data.perms.has(`${moduleSlug}:${action}`);
  }

  function isModuleAdmin(moduleSlug: string): boolean {
    const bypass = isExclusiveModule(moduleSlug) ? data.isSuperAdmin : data.isGlobalAdmin;
    return bypass || data.moduleAdmins.has(moduleSlug);
  }

  function isAnyModuleAdmin(): boolean {
    return data.isGlobalAdmin || data.moduleAdmins.size > 0;
  }

  // "seguran" e "inform" aparecem antes de qualquer acento em "Segurança da
  // Informação", então um includes em minúsculas basta (sem normalizar acentos).
  const isSeguranca = (() => {
    const n = (data.departmentName ?? "").toLowerCase();
    return n.includes("seguran") && n.includes("inform");
  })();

  return {
    loading: isLoading,
    isAdmin: data.isGlobalAdmin,
    can,
    isModuleAdmin,
    isAnyModuleAdmin,
    isSeguranca,
    isDastAllowed: data.isGlobalAdmin && isSeguranca,
    departmentName: data.departmentName,
    matrix: data,
  };
}
