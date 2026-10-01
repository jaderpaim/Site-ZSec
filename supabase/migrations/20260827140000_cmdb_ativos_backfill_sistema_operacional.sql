
-- CMDB: backfill de Sistema Operacional para ativos existentes (só preenche onde ainda está vazio)
UPDATE public.cmdb_ativos
SET sistema_operacional = 'Windows Server'
WHERE tipo = 'Servidor'
  AND sistema_operacional IS NULL;

UPDATE public.cmdb_ativos
SET sistema_operacional = 'Fortigate'
WHERE tipo = 'Firewall'
  AND sistema_operacional IS NULL;
