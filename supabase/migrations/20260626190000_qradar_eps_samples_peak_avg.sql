-- O gráfico evolutivo de EPS quer mostrar a MÉDIA do pico (telemetria nativa
-- "Events per Second Raw - Peak 1 Sec") calculada pelo próprio QRadar via AQL,
-- separado do pico MÁXIMO já guardado em peak_eps (usado no card "EPS Pico
-- (7 dias)"). Sem essa coluna, a única média disponível seria derivada em JS
-- a partir de amostras que já são o máximo por hora — não é a mesma coisa.
ALTER TABLE public.qradar_eps_samples ADD COLUMN IF NOT EXISTS peak_eps_avg numeric;
