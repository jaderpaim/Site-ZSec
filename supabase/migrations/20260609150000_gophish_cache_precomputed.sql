-- Adiciona chaves para dados pré-computados no sync (evita processamento na leitura)
INSERT INTO public.gophish_cache (key, data) VALUES
  ('overview',   '{}'::jsonb),
  ('operations', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;
