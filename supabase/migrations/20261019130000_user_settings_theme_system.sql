-- Tema "Auto": segue o claro/escuro do sistema operacional do usuário.
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_theme_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_theme_check CHECK (theme IN ('dark', 'light', 'system'));
