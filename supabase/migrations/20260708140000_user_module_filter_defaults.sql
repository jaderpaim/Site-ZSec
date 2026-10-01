-- Período padrão salvo por usuário/módulo (botão "Salvar" no AppHeader)
CREATE TABLE public.user_module_filter_defaults (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     text NOT NULL,
  period     text NOT NULL CHECK (period IN ('all', '30d', '60d', '90d', 'custom')),
  custom_from date,
  custom_to   date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module)
);

ALTER TABLE public.user_module_filter_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own filter defaults"
  ON public.user_module_filter_defaults FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users insert own filter defaults"
  ON public.user_module_filter_defaults FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own filter defaults"
  ON public.user_module_filter_defaults FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own filter defaults"
  ON public.user_module_filter_defaults FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
