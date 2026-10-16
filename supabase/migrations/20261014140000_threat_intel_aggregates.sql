-- Threat Intelligence — agregações para a tela não precisar carregar todas as
-- linhas (um domínio grande pode ter centenas de milhares de credenciais).
--
-- SECURITY INVOKER (padrão): rodam com o papel de quem chama, então a RLS de
-- leakradar_leaks já filtra — só quem tem `view` enxerga as linhas, e a
-- agregação reflete exatamente o que a RLS permitiria ver.

-- Índices que sustentam as agregações e a paginação por categoria.
CREATE INDEX IF NOT EXISTS idx_leakradar_leaks_cat_added
  ON public.leakradar_leaks (category, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_leakradar_leaks_cat_host
  ON public.leakradar_leaks (category, url_host);

-- Série temporal por período (semana ou mês) e categoria.
CREATE OR REPLACE FUNCTION public.leakradar_timeseries(p_bucket text DEFAULT 'week')
RETURNS TABLE (period date, category text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT date_trunc(CASE WHEN p_bucket = 'month' THEN 'month' ELSE 'week' END,
                    COALESCE(added_at, first_seen_at))::date AS period,
         category,
         count(*)::bigint AS n
  FROM public.leakradar_leaks
  GROUP BY 1, 2;
$$;

-- Top hosts (site de login capturado) de uma categoria.
CREATE OR REPLACE FUNCTION public.leakradar_top_hosts(p_category text, p_limit int DEFAULT 7)
RETURNS TABLE (url_host text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT url_host, count(*)::bigint AS n
  FROM public.leakradar_leaks
  WHERE category = p_category AND url_host IS NOT NULL
  GROUP BY url_host
  ORDER BY count(*) DESC
  LIMIT greatest(1, least(coalesce(p_limit, 7), 50));
$$;

-- Contagem por categoria e status (para KPIs de tratamento, sem puxar linhas).
CREATE OR REPLACE FUNCTION public.leakradar_status_counts()
RETURNS TABLE (category text, status text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT category, status, count(*)::bigint AS n
  FROM public.leakradar_leaks
  GROUP BY 1, 2;
$$;

REVOKE EXECUTE ON FUNCTION public.leakradar_timeseries(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leakradar_top_hosts(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leakradar_status_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leakradar_timeseries(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leakradar_top_hosts(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leakradar_status_counts() TO authenticated;
