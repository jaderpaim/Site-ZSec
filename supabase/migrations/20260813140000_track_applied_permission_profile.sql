-- Registra qual perfil de permissão foi aplicado por último a cada usuário —
-- só pra exibição/rastreio na tela de Usuários (ver aplicação em
-- users.functions.ts). Continua sendo cópia única (snapshot): esta coluna
-- não é um vínculo vivo, é só "a última coisa que foi aplicada aqui".
-- ON DELETE SET NULL: excluir o perfil não desfaz as permissões já copiadas,
-- só limpa o rótulo (deixa de saber de qual perfil vieram).
ALTER TABLE public.profiles
  ADD COLUMN permission_profile_id uuid REFERENCES public.permission_profiles(id) ON DELETE SET NULL;
