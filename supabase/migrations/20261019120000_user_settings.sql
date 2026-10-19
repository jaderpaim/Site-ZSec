-- Preferências do usuário (tema, módulos fixados no menu e o que vier com a
-- tela de perfil). Separada de profiles de propósito: profiles guarda campos
-- de autorização protegidos por trigger; aqui o próprio usuário edita tudo,
-- só na própria linha.
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  pinned_modules text[] NOT NULL DEFAULT '{}' CHECK (cardinality(pinned_modules) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "user settings select own" ON public.user_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user settings insert own" ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user settings update own" ON public.user_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS tg_user_settings_updated ON public.user_settings;
CREATE TRIGGER tg_user_settings_updated
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
