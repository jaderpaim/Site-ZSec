-- Seed de validação (extra): 3 contas que existem no Entra de testes, para
-- validar o cruzamento com o AD de ponta a ponta. jpp2005@hotmail.com entra
-- como colaborador para teste (a coleta AD tenta pelo e-mail como UPN).

INSERT INTO public.leakradar_leaks
  (leak_id, category, domain, username, is_email, url, url_host, password_strength, unlocked, added_at)
VALUES
  ('seed-emp-009', 'employees', 'homepaim.com.br', 'jpp2005@hotmail.com', true,
   'https://login.microsoftonline.com/common/oauth2', 'login.microsoftonline.com', 3, false, '2026-10-05T08:00:00Z'),
  ('seed-emp-010', 'employees', 'homepaim.com.br', 'mauricio.bringel@homepaim.com.br', true,
   'https://portal.homepaim.com.br/login', 'portal.homepaim.com.br', 7, false, '2026-09-15T08:00:00Z'),
  ('seed-emp-011', 'employees', 'homepaim.com.br', 'paulo.machado@homepaim.com.br', true,
   'https://login.microsoftonline.com/common/oauth2', 'login.microsoftonline.com', 1, false, '2026-10-12T08:00:00Z')
ON CONFLICT (leak_id, category) DO NOTHING;

-- Relatório atualizado: colaboradores agora 11 (clientes/terceiros inalterados).
INSERT INTO public.leakradar_sync_state (id, last_sync_at, totals, report, updated_at)
VALUES (
  'leakradar',
  now(),
  '{"homepaim.com.br": {
     "employees": {"total": 11, "total_unlocked": 0, "collected": 11},
     "customers": {"total": 3, "total_unlocked": 0, "collected": 3},
     "third_parties": {"total": 2, "total_unlocked": 0, "collected": 2}
   }}'::jsonb,
  '{"homepaim.com.br": {
     "employees_compromised": 11,
     "customers_compromised": 3,
     "third_parties_compromised": 2,
     "employee_passwords": {"total_pass": 11,
       "too_weak": {"qty": 4, "perc": 36.4}, "weak": {"qty": 3, "perc": 27.3},
       "medium": {"qty": 3, "perc": 27.3}, "strong": {"qty": 1, "perc": 9.1}},
     "customer_passwords": {"total_pass": 3,
       "too_weak": {"qty": 1, "perc": 33.3}, "weak": {"qty": 1, "perc": 33.3},
       "medium": {"qty": 1, "perc": 33.3}, "strong": {"qty": 0, "perc": 0.0}},
     "third_parties_passwords": {"total_pass": 2,
       "too_weak": {"qty": 1, "perc": 50.0}, "weak": {"qty": 0, "perc": 0.0},
       "medium": {"qty": 0, "perc": 0.0}, "strong": {"qty": 1, "perc": 50.0}}
   }}'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
  SET last_sync_at = EXCLUDED.last_sync_at,
      totals = EXCLUDED.totals,
      report = EXCLUDED.report,
      updated_at = EXCLUDED.updated_at;

INSERT INTO public.colaboradores (display_name, email, cargo)
VALUES
  ('JPP (teste Hotmail)', 'jpp2005@hotmail.com', 'Teste'),
  ('Mauricio Bringel', 'mauricio.bringel@homepaim.com.br', 'Diretoria'),
  ('Paulo Machado', 'paulo.machado@homepaim.com.br', 'TI')
ON CONFLICT (email) DO NOTHING;
