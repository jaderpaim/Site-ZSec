-- Seed de validação: credenciais vazadas fictícias do domínio homepaim.com.br.
-- Crie os mesmos e-mails como usuários no Entra ID (UPN = e-mail) para validar o
-- cruzamento com o AD (última troca de senha + MFA). A coleta real do CTI
-- sobrescreve estes dados na próxima sincronização.
--
-- password_strength: 0-2 muito fraca · 3-4 fraca · 5-7 média · 8+ forte.

INSERT INTO public.leakradar_leaks
  (leak_id, category, domain, username, is_email, url, url_host, password_strength, unlocked, added_at)
VALUES
  -- Colaboradores (8)
  ('seed-emp-001', 'employees', 'homepaim.com.br', 'ana.silva@homepaim.com.br', true,
   'https://login.microsoftonline.com/common/oauth2', 'login.microsoftonline.com', 2, false, '2024-11-10T08:00:00Z'),
  ('seed-emp-002', 'employees', 'homepaim.com.br', 'bruno.costa@homepaim.com.br', true,
   'https://portal.homepaim.com.br/login', 'portal.homepaim.com.br', 6, false, '2025-03-02T08:00:00Z'),
  ('seed-emp-003', 'employees', 'homepaim.com.br', 'carla.dias@homepaim.com.br', true,
   'https://vpn.homepaim.com.br/remote/login', 'vpn.homepaim.com.br', 3, false, '2025-06-15T08:00:00Z'),
  ('seed-emp-004', 'employees', 'homepaim.com.br', 'diego.alves@homepaim.com.br', true,
   'https://accounts.google.com/signin', 'accounts.google.com', 9, false, '2025-01-20T08:00:00Z'),
  ('seed-emp-005', 'employees', 'homepaim.com.br', 'erica.melo@homepaim.com.br', true,
   'https://login.microsoftonline.com/common/oauth2', 'login.microsoftonline.com', 1, false, '2026-09-01T08:00:00Z'),
  ('seed-emp-006', 'employees', 'homepaim.com.br', 'felipe.rocha@homepaim.com.br', true,
   'https://app.homepaim.com.br/entrar', 'app.homepaim.com.br', 4, false, '2026-07-10T08:00:00Z'),
  ('seed-emp-007', 'employees', 'homepaim.com.br', 'gabriela.nunes@homepaim.com.br', true,
   'https://portal.homepaim.com.br/login', 'portal.homepaim.com.br', 7, false, '2026-10-01T08:00:00Z'),
  ('seed-emp-008', 'employees', 'homepaim.com.br', 'henrique.lima@homepaim.com.br', true,
   'https://login.microsoftonline.com/common/oauth2', 'login.microsoftonline.com', 0, false, '2026-10-10T08:00:00Z'),
  -- Clientes (3)
  ('seed-cus-001', 'customers', 'homepaim.com.br', 'cliente.ana@gmail.com', true,
   'https://portal.homepaim.com.br/aluno/login', 'portal.homepaim.com.br', 1, false, '2026-08-01T08:00:00Z'),
  ('seed-cus-002', 'customers', 'homepaim.com.br', 'responsavel.b@hotmail.com', true,
   'https://app.homepaim.com.br/entrar', 'app.homepaim.com.br', 5, false, '2026-05-12T08:00:00Z'),
  ('seed-cus-003', 'customers', 'homepaim.com.br', 'familia.c@yahoo.com', true,
   'https://portal.homepaim.com.br/aluno/login', 'portal.homepaim.com.br', 3, false, '2026-09-20T08:00:00Z'),
  -- Terceiros (2)
  ('seed-thp-001', 'third_parties', 'homepaim.com.br', 'bruno.costa@homepaim.com.br', true,
   'https://www.linkedin.com/login', 'www.linkedin.com', 2, false, '2026-06-01T08:00:00Z'),
  ('seed-thp-002', 'third_parties', 'homepaim.com.br', 'compras@homepaim.com.br', true,
   'https://fornecedor-xyz.com.br/portal', 'fornecedor-xyz.com.br', 8, false, '2026-07-22T08:00:00Z')
ON CONFLICT (leak_id, category) DO NOTHING;

-- Relatório/estado da coleta, para os cards e KPIs mostrarem os totais oficiais
-- sem precisar rodar a sincronização real.
INSERT INTO public.leakradar_sync_state (id, last_sync_at, totals, report, updated_at)
VALUES (
  'leakradar',
  now(),
  '{"homepaim.com.br": {
     "employees": {"total": 8, "total_unlocked": 0, "collected": 8},
     "customers": {"total": 3, "total_unlocked": 0, "collected": 3},
     "third_parties": {"total": 2, "total_unlocked": 0, "collected": 2}
   }}'::jsonb,
  '{"homepaim.com.br": {
     "employees_compromised": 8,
     "customers_compromised": 3,
     "third_parties_compromised": 2,
     "employee_passwords": {"total_pass": 8,
       "too_weak": {"qty": 3, "perc": 37.5}, "weak": {"qty": 2, "perc": 25.0},
       "medium": {"qty": 2, "perc": 25.0}, "strong": {"qty": 1, "perc": 12.5}},
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

-- Cadastro dos colaboradores (para a correlação no detalhe). Se já existir o
-- e-mail, mantém. entra_oid fica nulo (a coleta AD usa o e-mail como UPN).
INSERT INTO public.colaboradores (display_name, email, cargo)
VALUES
  ('Ana Silva', 'ana.silva@homepaim.com.br', 'Financeiro'),
  ('Bruno Costa', 'bruno.costa@homepaim.com.br', 'TI'),
  ('Carla Dias', 'carla.dias@homepaim.com.br', 'Pedagógico'),
  ('Diego Alves', 'diego.alves@homepaim.com.br', 'Comercial'),
  ('Erica Melo', 'erica.melo@homepaim.com.br', 'RH'),
  ('Felipe Rocha', 'felipe.rocha@homepaim.com.br', 'Marketing'),
  ('Gabriela Nunes', 'gabriela.nunes@homepaim.com.br', 'Operações'),
  ('Henrique Lima', 'henrique.lima@homepaim.com.br', 'Logística')
ON CONFLICT (email) DO NOTHING;
