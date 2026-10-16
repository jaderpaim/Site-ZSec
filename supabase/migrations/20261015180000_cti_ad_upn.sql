-- Guarda o UPN real do Entra (pode diferir do e-mail vazado, ex.: contas
-- externas com UPN no formato ..._hotmail.com#EXT#@tenant.onmicrosoft.com).
-- O ROPC precisa do UPN, não do e-mail.
ALTER TABLE public.leakradar_ad_status ADD COLUMN IF NOT EXISTS user_principal_name text;
