# Escalonamento de privilégio no cadastro (handle_new_user)

**Gravidade:** 🟠 Alta — vira 🔴 **crítica** se o cadastro público
("Allow new users to sign up") estiver ligado no Supabase.

## O problema
O gatilho `public.handle_new_user()` (em `auth.users`) define o papel do
usuário novo lendo `raw_user_meta_data->>'role'`. Esse campo é preenchido
**por quem se cadastra**: `supabase.auth.signUp({ email, password, options:
{ data: { role: "super_admin" } } })`, usando a chave pública que está no
navegador. Resultado: qualquer pessoa que consiga se cadastrar nasce
`super_admin`.

## 1. Confirmar
```sql
SELECT prosrc LIKE '%raw_user_meta_data->>''role''%' AS le_papel_do_usuario
FROM pg_proc WHERE proname = 'handle_new_user';
```
`true` = vulnerável. Veja também no painel: **Authentication → Providers →
Email → "Allow new users to sign up"**. Se estiver ligado, trate como crítico
e faça a auditoria do passo 4 antes de tudo.

## 2. Corrigir
**a) Banco — migration nova** `supabase/migrations/<timestamp>_handle_new_user_sem_role_do_cliente.sql`.
Antes, confira a versão atual da função (`pg_get_functiondef`) e preserve o
que ela faz além do papel; na versão analisada era isto:
```sql
-- O papel de um usuário novo não pode vir do próprio usuário: raw_user_meta_data
-- é preenchido por quem se cadastra. Só raw_app_meta_data (gravado pela
-- service role) é aceito; sem ele, todo usuário nasce visualizador.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role app_role := 'visualizador';
  requested_role text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  requested_role := NEW.raw_app_meta_data->>'role';
  IF requested_role IN ('admin','analista','visualizador','personalizado','super_admin') THEN
    default_role := requested_role::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  PERFORM public.apply_role_defaults(NEW.id, default_role);
  RETURN NEW;
END;
$function$;
```

**b) App — o convite precisa definir o papel pelo servidor.** Se o fluxo de
convite (`src/lib/users.functions.ts`) passava o papel em `user_metadata`
esperando que o gatilho aplicasse, ele deixa de funcionar (todo convidado
nasce visualizador). Depois de criar/convidar o usuário com a service role,
aplique o papel explicitamente — por exemplo, uma função usada tanto no
convite quanto na troca de papel:
```ts
async function resetUserRole(userId: string, role: AppRole) {
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("module_admins").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_module_permissions").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").update({ permission_profile_id: null }).eq("id", userId);
  const { error: e2 } = await supabaseAdmin.rpc("apply_role_defaults", { _user_id: userId, _role: role });
  if (e2) throw new Error(e2.message);
}
```

**c) Painel:** se o app só entra por convite/SSO, **desligue** "Allow new
users to sign up" (Authentication → Providers → Email).

## 3. Validar
1. A consulta do passo 1 retorna `false`.
2. Convidar um usuário como **analista** pelo app → ele entra como analista
   (não como visualizador).
3. Com o cadastro público ligado (se for o caso), um `signUp` com
   `options.data.role = "super_admin"` deve resultar em **visualizador**.

## 4. Auditoria (se o cadastro público esteve ligado)
Procure contas que podem ter se aproveitado:
```sql
SELECT u.email, u.created_at, r.role, u.raw_user_meta_data->>'role' AS papel_pedido
FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id
WHERE r.role IN ('super_admin','admin')
ORDER BY u.created_at DESC;
```
Qualquer admin que não tenha vindo de convite conhecido deve ser investigado
(logs de acesso, ações no audit log) e rebaixado.
