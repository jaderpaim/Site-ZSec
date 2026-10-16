-- Validação: zera os dados do CTI (mantém config: integração, aplicações e
-- canais de alerta). Limpa credenciais, eventos, incidentes, cruzamento AD e o
-- estado/relatório de coleta. Reinicia a numeração de incidentes (INC...).
TRUNCATE
  public.leakradar_events,
  public.leakradar_ad_status,
  public.leakradar_incidents,
  public.leakradar_leaks,
  public.leakradar_sync_state
  RESTART IDENTITY CASCADE;

ALTER SEQUENCE public.leakradar_incident_ref_seq RESTART WITH 1;
