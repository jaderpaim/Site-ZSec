
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS emails text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.departments_validate_emails()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  e text;
BEGIN
  IF NEW.emails IS NULL THEN
    NEW.emails := '{}'::text[];
  END IF;
  IF array_length(NEW.emails, 1) > 20 THEN
    RAISE EXCEPTION 'Máximo de 20 e-mails por departamento';
  END IF;
  IF NEW.emails IS NOT NULL THEN
    FOREACH e IN ARRAY NEW.emails LOOP
      IF e !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'E-mail inválido: %', e;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_departments_validate_emails ON public.departments;
CREATE TRIGGER trg_departments_validate_emails
BEFORE INSERT OR UPDATE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.departments_validate_emails();
