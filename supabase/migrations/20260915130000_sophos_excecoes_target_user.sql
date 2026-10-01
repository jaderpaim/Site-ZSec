-- Permite que uma exceção Sophos se aplique a um USUÁRIO inteiro (não só a
-- um nome de evento) — usado pra tirar contas de sistema/serviço
-- (ex.: "SISTEMA", "n/a", "autologon_*") do Top 10 Usuários com Ameaças,
-- que hoje dominam o ranking e escondem usuários humanos reais.
--
-- target='event' (default) preserva 100% o comportamento atual pras
-- exceções já cadastradas. target='user' faz o event_name (reaproveitado
-- como "nome/padrão de usuário") casar contra sophos_events.user_normalized
-- em vez de sophos_events.name.
ALTER TABLE public.sophos_excecoes
  ADD COLUMN target text NOT NULL DEFAULT 'event';
ALTER TABLE public.sophos_excecoes
  ADD CONSTRAINT sophos_excecoes_target_check CHECK (target IN ('event', 'user'));

-- Mesma função, mesma assinatura — CREATE OR REPLACE preserva os grants
-- existentes. Adiciona a CTE "exu" (exceções de usuário) e as duas
-- condições finais no WHERE.
CREATE OR REPLACE FUNCTION public.get_sophos_top_users_threats(from_ts timestamp with time zone, to_ts timestamp with time zone)
 RETURNS TABLE(user_normalized text, cnt bigint)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ex AS (
    SELECT
      coalesce(array_agg(lower(event_name)) FILTER (WHERE match_type = 'exact'), '{}') AS exact_arr,
      coalesce(array_agg('%' || event_name || '%') FILTER (WHERE match_type = 'contains'), '{}') AS like_arr
    FROM public.sophos_excecoes
    WHERE target = 'event'
  ),
  exu AS (
    SELECT
      coalesce(array_agg(lower(event_name)) FILTER (WHERE match_type = 'exact'), '{}') AS exact_arr,
      coalesce(array_agg('%' || event_name || '%') FILTER (WHERE match_type = 'contains'), '{}') AS like_arr
    FROM public.sophos_excecoes
    WHERE target = 'user'
  )
  SELECT e.user_normalized, count(*)::bigint AS cnt
  FROM public.sophos_events e, ex, exu
  WHERE e.user_normalized IS NOT NULL
    AND e.user_normalized <> ''
    AND e.event_at >= from_ts
    AND e.event_at <= to_ts
    AND lower(coalesce(e.name, '')) <> ALL (ex.exact_arr)
    AND NOT (coalesce(e.name, '') ILIKE ANY (ex.like_arr))
    AND lower(e.user_normalized) <> ALL (exu.exact_arr)
    AND NOT (e.user_normalized ILIKE ANY (exu.like_arr))
  GROUP BY e.user_normalized
  ORDER BY cnt DESC
  LIMIT 10;
$function$;
