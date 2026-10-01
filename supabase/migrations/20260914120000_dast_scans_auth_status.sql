-- Visibilidade de scan autenticado: sem isso, se a configuração de
-- autenticação no ZAP falhar (Context/Browser-Based Auth/User via API --
-- ver zap_setup_auth() no main.py, ainda não testado contra um ZAP real), o
-- scan cai pro modo anônimo silenciosamente e o app não tem como distinguir
-- "rodou autenticado" de "caiu pra anônimo" -- os dois terminam como "done"
-- igual. Preenchido pelo callback (dast-callback.ts) só quando o job tinha
-- credencial configurada pro domínio (dast_auth_credentials); NULL continua
-- sendo o caso comum (scan sem nenhuma credencial cadastrada, nunca tentou
-- autenticar).
ALTER TABLE public.dast_scans ADD COLUMN auth_status text;

COMMENT ON COLUMN public.dast_scans.auth_status IS
  'NULL = sem credencial configurada (scan anônimo normal). ''authenticated'' = login confirmado no ZAP. ''failed'' = credencial existia mas a configuração no ZAP falhou (scan caiu pra anônimo).';
