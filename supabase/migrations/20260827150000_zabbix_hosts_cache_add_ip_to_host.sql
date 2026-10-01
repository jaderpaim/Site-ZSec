
-- Guarda o mapa IP -> hostname(s) técnico(s) reportado(s) pelo Zabbix.
-- Usado para detectar divergência de hostname no CMDB (IP bate no Zabbix, mas o nome
-- cadastrado no ativo não corresponde ao hostname técnico daquele IP).
ALTER TABLE public.zabbix_hosts_cache ADD COLUMN ip_to_host jsonb NOT NULL DEFAULT '{}'::jsonb;
