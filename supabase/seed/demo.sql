-- =============================================================================
-- Dados de DEMONSTRAÇÃO (fictícios) para homologação e apresentação comercial.
--
-- - Nada da empresa de origem: nomes inventados, domínios *.exemplo.com.br,
--   IPs de documentação (RFC 5737: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
-- - Todo registro criado aqui tem id "de______-0000-4000-8000-____________"
--   (ver pg_temp.demo_id). Remoção segura: supabase/seed/demo-remove.sql apaga
--   só esses ids; dados reais não são tocados.
-- - Idempotente: rodar de novo não duplica (ON CONFLICT DO NOTHING).
-- - Período: últimos 12 meses a partir da data em que roda.
--
-- Como rodar: DBeaver (conexão do ambiente de TESTE) → abrir este arquivo →
-- selecionar tudo → Alt+X (executar script). Nunca no banco de produção.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.demo_id(tag text, n int) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('de' || substr(md5(tag), 1, 6) || '-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

DO $seed$
DECLARE
  d_si uuid; d_ti uuid; d_fin uuid; d_com uuid; d_rh uuid; d_jur uuid; d_mkt uuid;
  depts uuid[];
  nomes text[] := ARRAY['Ana Souza','Bruno Lima','Carla Mendes','Diego Rocha','Elisa Martins','Fábio Costa',
    'Gabriela Alves','Henrique Dias','Isabela Nunes','João Pereira','Karina Lopes','Lucas Ferreira',
    'Mariana Ribeiro','Nicolas Barros','Olívia Castro','Paulo Teixeira','Quésia Moraes','Rafael Gomes',
    'Sabrina Pinto','Tiago Cardoso','Úrsula Freitas','Vinícius Araújo','Wesley Monteiro','Yasmin Correia',
    'Zeca Batista','Amanda Duarte','Bernardo Siqueira','Camila Rezende','Daniel Fonseca','Estela Prado'];
  apps text[] := ARRAY['portal.exemplo.com.br','erp.exemplo.com.br','crm.exemplo.com.br','rh.exemplo.com.br',
    'financeiro.exemplo.com.br','api.exemplo.com.br','loja.exemplo.com.br','intranet.exemplo.com.br',
    'blog.exemplo.com.br','app.exemplo.com.br'];
  vtipos_app text[] := ARRAY['SQL Injection','XSS refletido','XSS armazenado','CSRF','IDOR','Open Redirect',
    'SSRF','Exposição de dados sensíveis','Cabeçalhos de segurança ausentes','TLS fraco',
    'Componente desatualizado','Upload de arquivo irrestrito','Sessão sem expiração','Listagem de diretório'];
  vtipos_inf text[] := ARRAY['SMBv1 habilitado','RDP exposto à internet','OpenSSH desatualizado','Certificado expirado',
    'Patch de segurança ausente','Credencial padrão','SNMP com comunidade pública','Telnet habilitado',
    'TLS 1.0 habilitado','Serviço sem autenticação','Kernel desatualizado','Porta de gerência exposta'];
  sevs text[] := ARRAY['Crítica','Alta','Alta','Média','Média','Média','Baixa','Baixa'];
  i int; j int; k int; n int; dt date; st text; sev text; g uuid;
BEGIN
  PERFORM setseed(0.42);
  --
  -- ── Departamentos (reaproveita os que já existem com o mesmo nome) ─────────
  INSERT INTO public.departments (id, name, description) VALUES
    (pg_temp.demo_id('dept',1),'Segurança da Informação','Equipe de SI'),
    (pg_temp.demo_id('dept',2),'TI','Infraestrutura e sistemas'),
    (pg_temp.demo_id('dept',3),'Financeiro','Contas, tesouraria e controladoria'),
    (pg_temp.demo_id('dept',4),'Comercial','Vendas e relacionamento'),
    (pg_temp.demo_id('dept',5),'Recursos Humanos','Pessoas e cultura'),
    (pg_temp.demo_id('dept',6),'Jurídico','Contratos e compliance'),
    (pg_temp.demo_id('dept',7),'Marketing','Comunicação e marca')
  ON CONFLICT DO NOTHING;
  SELECT id INTO d_si  FROM public.departments WHERE name = 'Segurança da Informação';
  SELECT id INTO d_ti  FROM public.departments WHERE name = 'TI';
  SELECT id INTO d_fin FROM public.departments WHERE name = 'Financeiro';
  SELECT id INTO d_com FROM public.departments WHERE name = 'Comercial';
  SELECT id INTO d_rh  FROM public.departments WHERE name = 'Recursos Humanos';
  SELECT id INTO d_jur FROM public.departments WHERE name = 'Jurídico';
  SELECT id INTO d_mkt FROM public.departments WHERE name = 'Marketing';
  depts := ARRAY[d_ti, d_fin, d_com, d_rh, d_jur, d_mkt, d_si];
  --
  -- ── Aplicações (nome = endereço: as vulnerabilidades herdam o departamento) ─
  FOR i IN 1..array_length(apps,1) LOOP
    INSERT INTO public.applications (id, name, department_id)
    VALUES (pg_temp.demo_id('app',i), apps[i], depts[1 + (i % 6)])
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Vulnerabilidades de aplicação (≈70) ─────────────────────────────────────
  FOR i IN 1..70 LOOP
    dt  := current_date - (random()*360)::int;
    sev := sevs[1 + floor(random()*array_length(sevs,1))::int];
    st  := CASE WHEN dt < current_date - 120 THEN (ARRAY['Fechada','Fechada','Mitigada','Em tratamento'])[1+floor(random()*4)::int]
                WHEN dt < current_date - 30  THEN (ARRAY['Fechada','Em tratamento','Aberta','Mitigada'])[1+floor(random()*4)::int]
                ELSE (ARRAY['Aberta','Aberta','Em tratamento'])[1+floor(random()*3)::int] END;
    INSERT INTO public.vulnerabilities_aplicacao
      (id, fqdn, severity, status, kind, vuln_type, source, system_app, identified_at, closed_at,
       treatment_due_date, mitigation_description, external_id)
    VALUES (pg_temp.demo_id('vapp',i), apps[1 + (i % array_length(apps,1))], sev::vuln_severity, st::vuln_status,
       'aplicacao', vtipos_app[1 + floor(random()*array_length(vtipos_app,1))::int],
       (ARRAY['Pentest','Scanner','DAST','Bug Bounty'])[1+floor(random()*4)::int],
       initcap(split_part(apps[1 + (i % array_length(apps,1))], '.', 1)),
       dt,
       CASE WHEN st IN ('Fechada','Mitigada') THEN dt + (5 + random()*60)::int END,
       dt + CASE sev WHEN 'Crítica' THEN 7 WHEN 'Alta' THEN 30 WHEN 'Média' THEN 60 ELSE 90 END,
       CASE WHEN st IN ('Fechada','Mitigada') THEN 'Correção aplicada e validada em reteste.' END,
       'DEMO-APP-' || lpad(i::text, 4, '0'))
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Vulnerabilidades de infraestrutura (≈90) ───────────────────────────────
  FOR i IN 1..90 LOOP
    dt  := current_date - (random()*360)::int;
    sev := sevs[1 + floor(random()*array_length(sevs,1))::int];
    st  := CASE WHEN dt < current_date - 90 THEN (ARRAY['Fechada','Fechada','Mitigada','Aberta'])[1+floor(random()*4)::int]
                ELSE (ARRAY['Aberta','Aberta','Em tratamento','Mitigada'])[1+floor(random()*4)::int] END;
    INSERT INTO public.vulnerabilities_infra
      (id, fqdn, severity, status, kind, vuln_type, source, system_app, identified_at, closed_at,
       treatment_due_date, department_id, responsible, external_id)
    VALUES (pg_temp.demo_id('vinf',i),
       'srv-' || lpad((1 + i % 30)::text, 2, '0') || '.exemplo.local',
       sev::vuln_severity, st::vuln_status, 'infraestrutura',
       vtipos_inf[1 + floor(random()*array_length(vtipos_inf,1))::int],
       (ARRAY['Scanner','Scanner','Pentest'])[1+floor(random()*3)::int],
       'Servidor ' || lpad((1 + i % 30)::text, 2, '0'),
       dt,
       CASE WHEN st IN ('Fechada','Mitigada') THEN dt + (3 + random()*45)::int END,
       dt + CASE sev WHEN 'Crítica' THEN 7 WHEN 'Alta' THEN 30 WHEN 'Média' THEN 60 ELSE 90 END,
       d_ti, 'TI', 'DEMO-INF-' || lpad(i::text, 4, '0'))
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Snapshots mensais de vulnerabilidades (tendência dos gráficos) ─────────
  FOR i IN 0..11 LOOP
    dt := (date_trunc('month', current_date) - (i || ' months')::interval)::date;
    n  := 140 - i*4 + (random()*10)::int;
    INSERT INTO public.vuln_snapshots (id, snapshot_date, total, abertas, resolvidas, criticas, altas, medias, baixas)
    VALUES (pg_temp.demo_id('vsnap',i), dt, n, (n*0.45)::int, (n*0.55)::int,
            (n*0.08)::int, (n*0.22)::int, (n*0.40)::int, (n*0.30)::int)
    ON CONFLICT DO NOTHING;
    -- month é texto 'YYYY-MM' (ver 20260813160000).
    INSERT INTO public.vuln_infra_monthly_snapshot (month, new_count, fix_count, maintained_count)
    VALUES (to_char(dt, 'YYYY-MM'), 6 + (random()*10)::int, 5 + (random()*12)::int, 20 + (random()*15)::int)
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── CMDB (≈40 ativos) e indisponibilidades ─────────────────────────────────
  FOR i IN 1..40 LOOP
    INSERT INTO public.cmdb_ativos
      (id, nome, tipo, criticidade, status, departamento_id, ip_hostname, sistema_operacional,
       fabricante_modelo, localizacao, observacoes)
    VALUES (pg_temp.demo_id('cmdb',i),
       CASE WHEN i <= 30 THEN 'srv-' || lpad(i::text, 2, '0') ELSE 'ativo-' || lpad(i::text, 2, '0') END,
       CASE WHEN i <= 30 THEN 'Servidor'
            ELSE (ARRAY['Switch','Roteador','Firewall','Storage','Impressora','Notebook','Desktop','Switch','Firewall','Storage'])[i-30] END,
       (ARRAY['Crítico','Alto','Alto','Médio','Médio','Baixo'])[1 + (i % 6)],
       CASE WHEN i % 13 = 0 THEN 'Em manutenção' WHEN i % 17 = 0 THEN 'Desativado' ELSE 'Ativo' END,
       depts[1 + (i % 7)],
       CASE WHEN i <= 15 THEN '192.0.2.' || (10 + i) WHEN i <= 30 THEN '198.51.100.' || (10 + i) ELSE '203.0.113.' || (10 + i) END,
       CASE WHEN i <= 30 THEN (ARRAY['Ubuntu 22.04 LTS','Windows Server 2022','Debian 12','Red Hat Enterprise Linux 9','Windows Server 2019'])[1 + (i % 5)] END,
       (ARRAY['Dell PowerEdge R650','HPE ProLiant DL380','Lenovo ThinkSystem SR630','Cisco Catalyst 9200','Fortinet FortiGate 100F'])[1 + (i % 5)],
       (ARRAY['Datacenter principal','Datacenter secundário','Escritório SP','Nuvem (IaaS)'])[1 + (i % 4)],
       'Ativo de demonstração')
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..30 LOOP
    dt := current_date - (random()*180)::int;
    n  := (10 + random()*240)::int;          -- duração em minutos
    k  := (random()*12*60)::int;             -- início: minutos depois das 08:00
    -- duracao_min é coluna gerada (fim - inicio).
    INSERT INTO public.indisponibilidades (id, ativo_id, inicio, fim, motivo, observacao)
    VALUES (pg_temp.demo_id('indisp',i), pg_temp.demo_id('cmdb', 1 + (i*7 % 30)),
       dt + time '08:00' + (k || ' minutes')::interval,
       dt + time '08:00' + (k + n || ' minutes')::interval,
       (ARRAY['Manutenção programada','Falha de hardware','Atualização de sistema','Queda de energia','Falha de rede','Pico de uso'])[1 + (i % 6)],
       'Registro de demonstração')
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Fornecedores (alguns vencendo em breve, alguns vencidos) ───────────────
  FOR i IN 1..14 LOOP
    INSERT INTO public.fornecedores (id, nome, servico_prestado, data_contratacao, data_expiracao, alert_days, department_id)
    VALUES (pg_temp.demo_id('forn',i),
       (ARRAY['Nuvem Alfa','DataSafe Backup','Rede Ômega','SoftSign','Contábil Prime','MailFlow','Segura Pentest',
              'Hosting Brasil','LinkFibra','Cofre Digital','HelpDesk Mais','Treina Sec','Auditoria XYZ','PrintServ'])[i] || ' Ltda.',
       (ARRAY['Infraestrutura em nuvem','Backup gerenciado','Link de internet','Certificados digitais','Sistema contábil',
              'E-mail corporativo','Testes de invasão','Hospedagem de sites','Link dedicado','Gestão de senhas',
              'Suporte técnico','Treinamentos de SI','Auditoria de conformidade','Impressão gerenciada'])[i],
       current_date - (200 + i*40),
       current_date + (ARRAY[-20,5,12,25,45,90,120,180,240,300,365,400,-60,15])[i],
       30, depts[1 + (i % 7)])
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── WSUS (≈25 servidores) ───────────────────────────────────────────────────
  FOR i IN 1..25 LOOP
    n := (random()*30)::int;
    -- not_installed e has_alert são colunas geradas a partir das contagens.
    INSERT INTO public.wsus_servers (id, computer_name, needed, failed, installed_or_na, no_status, last_report_at)
    VALUES (pg_temp.demo_id('wsus',i), 'SRV-WIN-' || lpad(i::text, 2, '0') || '.exemplo.local',
       n, CASE WHEN i % 6 = 0 THEN 1 + (random()*4)::int ELSE 0 END, 400 + (random()*300)::int,
       CASE WHEN i % 9 = 0 THEN 2 ELSE 0 END,
       now() - ((random()*72)::int || ' hours')::interval)
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Aprovadores e GMUDs ─────────────────────────────────────────────────────
  INSERT INTO public.aprovadores (id, nome, email, department_id, ordem, papel) VALUES
    (pg_temp.demo_id('aprov',1),'Carla Mendes','carla.mendes@exemplo.com.br', d_ti, 1,'Gestora de TI'),
    (pg_temp.demo_id('aprov',2),'Diego Rocha','diego.rocha@exemplo.com.br', d_si, 2,'Coordenador de SI'),
    (pg_temp.demo_id('aprov',3),'Elisa Martins','elisa.martins@exemplo.com.br', d_fin, 1,'Gerente Financeira'),
    (pg_temp.demo_id('aprov',4),'Fábio Costa','fabio.costa@exemplo.com.br', d_com, 1,'Gerente Comercial')
  ON CONFLICT DO NOTHING;
  FOR i IN 1..28 LOOP
    dt := current_date - (random()*300)::int;
    st := (ARRAY['Concluída','Concluída','Concluída','Aprovada','Em Aprovação','Rejeitada','Em Execução','Cancelada','Rascunho','Rollback'])[1 + (i % 10)];
    g  := pg_temp.demo_id('gmud',i);
    INSERT INTO public.gmuds (id, titulo, descricao, justificativa, plano_execucao, plano_rollback, tipo, impacto,
                              status_geral, data_inicio, data_fim, department_id, criado_por_nome, criado_por_email,
                              motivo_cancelamento, created_at)
    VALUES (g,
       (ARRAY['Atualização do firewall de borda','Migração do servidor de arquivos','Aplicação de patches mensais',
              'Troca de certificado do portal','Ajuste de regras de WAF','Upgrade do banco do ERP',
              'Novo link de internet','Hardening de servidores Linux','Rotação de credenciais de serviço',
              'Atualização do antivírus','Mudança de DNS do CRM','Expansão do storage'])[1 + (i % 12)] || ' #' || i,
       'Mudança planejada de demonstração.', 'Manter o ambiente atualizado e seguro.',
       '1. Comunicar áreas; 2. Executar na janela; 3. Validar serviços.', 'Reverter para a configuração anterior a partir do backup.',
       (ARRAY['Normal','Normal','Padrão','Emergencial'])[1 + (i % 4)]::gmud_tipo,
       (ARRAY['Baixo','Médio','Médio','Alto'])[1 + (i % 4)]::gmud_impacto,
       st::gmud_status, dt + time '22:00', dt + time '23:30', depts[1 + (i % 7)],
       nomes[1 + (i % 30)], lower(replace(translate(nomes[1 + (i % 30)], 'áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ', 'aeiouaeoaocAEIOUAEOAOC'), ' ', '.')) || '@exemplo.com.br',
       CASE WHEN st = 'Cancelada' THEN 'Janela de manutenção remarcada.' END,
       dt - 5)
    ON CONFLICT DO NOTHING;
    FOR j IN 1..2 LOOP
      INSERT INTO public.gmud_aprovadores (id, gmud_id, nome_aprovador, email_aprovador, ordem, papel, department_id,
                                           status_aprovacao, data_acao, observacoes)
      VALUES (pg_temp.demo_id('gmudap', i*10 + j), g,
         (ARRAY['Carla Mendes','Diego Rocha'])[j], (ARRAY['carla.mendes@exemplo.com.br','diego.rocha@exemplo.com.br'])[j],
         j, (ARRAY['Gestora de TI','Coordenador de SI'])[j], (ARRAY[d_ti, d_si])[j],
         (CASE
            WHEN st IN ('Concluída','Aprovada','Em Execução','Rollback') THEN 'Aprovado'
            WHEN st = 'Rejeitada' THEN CASE WHEN j = 1 THEN 'Aprovado' ELSE 'Rejeitado' END
            WHEN st = 'Cancelada' THEN 'Cancelado'
            WHEN st = 'Em Aprovação' THEN CASE WHEN j = 1 THEN 'Aprovado' ELSE 'Pendente' END
            ELSE 'Pendente' END)::gmud_aprov_status,
         CASE WHEN st NOT IN ('Rascunho','Em Aprovação') OR j = 1 THEN dt - 2 END,
         CASE WHEN st = 'Rejeitada' AND j = 2 THEN 'Sem plano de comunicação às áreas.' END)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  --
  -- ── Maturidade: notas trimestrais da própria organização ───────────────────
  SELECT id INTO g FROM public.segmentos WHERE is_propria LIMIT 1;
  IF g IS NOT NULL THEN
    FOR i IN 1..5 LOOP
      INSERT INTO public.segmentos_notas (id, segmento_id, periodo, periodo_ordem, nota_nist, nota_iso)
      VALUES (pg_temp.demo_id('nota',i), g,
         (ARRAY['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])
           [extract(month FROM current_date - ((5 - i) * 3 || ' months')::interval)::int]
           || ' ' || extract(year FROM current_date - ((5 - i) * 3 || ' months')::interval)::int, 100 + i,
         (ARRAY[1.40,1.72,2.05,2.31,2.58])[i], (ARRAY[1.10,1.35,1.62,1.90,2.15])[i])
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  --
  INSERT INTO public.benchmark_empresa (id, ano, faturamento_anual, investimento_ciber, score_maturidade)
  VALUES (pg_temp.demo_id('bench',1), extract(year FROM current_date)::int, 250000000, 1625000, 2.58)
  ON CONFLICT DO NOTHING;
  --
  -- ── Comitês ─────────────────────────────────────────────────────────────────
  FOR i IN 1..14 LOOP
    dt := current_date - 330 + i * 28;
    INSERT INTO public.comites (id, nome, tipo, periodicidade, data, status, participantes, observacao)
    VALUES (pg_temp.demo_id('comite',i),
       (ARRAY['Comitê de Segurança da Informação','Comitê de Privacidade','Comitê de Riscos'])[1 + (i % 3)],
       (ARRAY['Estratégico','Operacional'])[1 + (i % 2)],
       (ARRAY['Mensal','Trimestral','Bimestral'])[1 + (i % 3)], dt,
       CASE WHEN dt > current_date THEN 'Agendado' WHEN i % 9 = 0 THEN 'Cancelado' ELSE 'Realizado' END,
       'Diretoria, SI, TI, Jurídico', CASE WHEN dt <= current_date THEN 'Ata registrada.' END)
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── NPS (áreas internas avaliam o serviço de SI) ───────────────────────────
  FOR i IN 1..8 LOOP
    INSERT INTO public.nps_clientes (id, nome, email)
    VALUES (pg_temp.demo_id('npscli',i),
       (ARRAY['Financeiro','Comercial','Recursos Humanos','Jurídico','Marketing','TI','Operações','Diretoria'])[i],
       'area' || i || '@exemplo.com.br')
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..96 LOOP
    n := LEAST(10, GREATEST(0, round(6.5 + random()*4.5 - (CASE WHEN i % 11 = 0 THEN 5 ELSE 0 END))::int));
    INSERT INTO public.nps_registros (id, cliente_id, nota, categoria, data_pesquisa, comentario)
    VALUES (pg_temp.demo_id('npsreg',i), pg_temp.demo_id('npscli', 1 + (i % 8)), n,
       CASE WHEN n <= 6 THEN 'Detrator' WHEN n <= 8 THEN 'Neutro' ELSE 'Promotor' END,
       current_date - (random()*360)::int,
       (ARRAY['Atendimento rápido.','Poderia comunicar melhor as mudanças.','Equipe muito prestativa.',NULL,NULL])[1 + (i % 5)])
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Não conformidades ───────────────────────────────────────────────────────
  FOR i IN 1..8 LOOP
    INSERT INTO public.nao_conformidades_manuais (id, plataforma, fora_compliance, prazo_resolucao, observacoes,
                                                  aceite_risco, evidencias, impactos, data_configuracao)
    VALUES (pg_temp.demo_id('ncman',i),
       (ARRAY['Active Directory','VPN','E-mail','ERP','Backup','Estações Windows','Firewall','Portal web'])[i],
       (ARRAY['Senhas sem expiração','MFA não obrigatório','DMARC em modo p=none','Usuários genéricos ativos',
              'Backup sem teste de restauração','BitLocker desativado','Regras "any-any" antigas','TLS 1.0 habilitado'])[i],
       current_date + (15 + i*10),
       'Identificado na revisão trimestral.', CASE WHEN i % 4 = 0 THEN 'Aceito pela diretoria até a próxima revisão.' END,
       'Relatório de configuração anexado.', 'Aumenta o risco de acesso indevido.', current_date - (20 + i*15))
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..6 LOOP
    INSERT INTO public.nao_conformidade_chamados (id, chamado, descricao, data_abertura, responsavel, impacto)
    VALUES (pg_temp.demo_id('ncch',i), 'CHG-' || (2400 + i),
       'Tratamento de não conformidade identificada na auditoria.', current_date - (10 + i*12),
       nomes[1 + i*3], (ARRAY['Alto','Médio','Baixo'])[1 + (i % 3)])
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Organização SI: áreas, membros, funções críticas, capacitações ─────────
  FOR i IN 1..4 LOOP
    INSERT INTO public.org_areas (id, nome, descricao, ordem)
    VALUES (pg_temp.demo_id('orgarea',i),
       (ARRAY['Governança, Riscos e Compliance','Operações de Segurança','Arquitetura de Segurança','Resposta a Incidentes'])[i],
       (ARRAY['Políticas, riscos e auditorias','Monitoramento e resposta do dia a dia','Padrões e revisão de projetos','Tratamento de incidentes'])[i], i)
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..12 LOOP
    INSERT INTO public.org_membros (id, area_id, nome, cargo, email, ativo)
    VALUES (pg_temp.demo_id('orgmem',i), pg_temp.demo_id('orgarea', 1 + (i % 4)), nomes[i],
       (ARRAY['Coordenador(a)','Analista Sênior','Analista Pleno','Analista Júnior'])[1 + (i % 4)],
       lower(replace(translate(nomes[i], 'áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ', 'aeiouaeoaocAEIOUAEOAOC'), ' ', '.')) || '@exemplo.com.br', i <> 12)
    ON CONFLICT DO NOTHING;
  END LOOP;
  -- Membro i fica na área 1 + (i % 4): o responsável da área k é o membro k-1 (área 1 → membro 4).
  UPDATE public.org_areas a
     SET responsavel_membro_id = pg_temp.demo_id('orgmem', CASE a.ordem WHEN 1 THEN 4 ELSE a.ordem - 1 END)
   WHERE a.id IN (SELECT pg_temp.demo_id('orgarea', x) FROM generate_series(1,4) x) AND a.responsavel_membro_id IS NULL;
  FOR i IN 1..6 LOOP
    INSERT INTO public.org_funcoes_criticas (id, area_id, nome, descricao, titular_id, substituto_id)
    VALUES (pg_temp.demo_id('orgfun',i), pg_temp.demo_id('orgarea', 1 + (i % 4)),
       (ARRAY['Gestão do SIEM','Administração do firewall','Gestão de vulnerabilidades','Resposta a incidentes',
              'Gestão de identidades','DPO / Privacidade'])[i],
       'Função crítica com cobertura definida.', pg_temp.demo_id('orgmem', i), pg_temp.demo_id('orgmem', i + 6))
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..6 LOOP
    INSERT INTO public.org_treinamentos (id, area_id, titulo, provedor, inicio, fim, status, observacao)
    VALUES (pg_temp.demo_id('orgtrei',i), pg_temp.demo_id('orgarea', 1 + (i % 4)),
       (ARRAY['ISO 27001 Lead Implementer','CompTIA Security+','Análise forense','Cloud Security (CCSK)','Pentest web','LGPD na prática'])[i],
       (ARRAY['Instituto Exemplo','CompTIA','Academia Sec','CSA','Escola Hacker','Privacidade.Org'])[i],
       current_date - (200 - i*30), current_date - (170 - i*30),
       (ARRAY['Concluído','Concluído','Em andamento','Planejado','Concluído','Cancelado'])[i],
       'Capacitação de demonstração')
    ON CONFLICT DO NOTHING;
    FOR j IN 1..4 LOOP
      INSERT INTO public.org_treinamento_participantes (treinamento_id, membro_id, concluido, concluido_em)
      VALUES (pg_temp.demo_id('orgtrei',i), pg_temp.demo_id('orgmem', 1 + ((i + j*3) % 12)),
         (i IN (1,2,5)), CASE WHEN i IN (1,2,5) THEN current_date - (160 - i*30) END)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  --
  -- ── Políticas e Processos ──────────────────────────────────────────────────
  FOR i IN 1..12 LOOP
    INSERT INTO public.policies (id, name, tipo, status, onda, indicador, publicacao, revisao, target_count, trained_count)
    VALUES (pg_temp.demo_id('pol',i),
       (ARRAY['Política de Segurança da Informação','Política de Senhas','Política de Uso Aceitável','Política de Backup',
              'Política de Controle de Acesso','Processo de Resposta a Incidentes','Política de Classificação da Informação',
              'Política de Privacidade (LGPD)','Política de Teletrabalho','Processo de Gestão de Vulnerabilidades',
              'Processo de Gestão de Mudanças','Plano de Continuidade de Negócios'])[i],
       CASE WHEN i IN (6,10,11,12) THEN 'Processo' ELSE 'Política' END,
       (ARRAY['Publicada','Publicada','Publicada','Em Validação','Publicada','Revisão'])[1 + (i % 6)]::policy_status,
       'Onda ' || (1 + (i % 3)), (ARRAY['Ciência formal','Treinamento concluído','Aceite eletrônico'])[1 + (i % 3)],
       current_date - (300 - i*15), current_date + (60 + i*20),
       420, (420 * (0.35 + random()*0.6))::int)
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Pílulas de SI (uma por mês) ─────────────────────────────────────────────
  FOR i IN 1..12 LOOP
    INSERT INTO public.pilulas_si (id, nome, descricao, data, quantidade, link)
    VALUES (pg_temp.demo_id('pilula',i),
       (ARRAY['Como reconhecer phishing','Senhas fortes e gerenciador','MFA em todo lugar','Wi-Fi público com cuidado',
              'Mesa limpa, tela bloqueada','Golpes por WhatsApp','Engenharia social por telefone','Backup pessoal',
              'Compartilhamento seguro de arquivos','Uso consciente de IA','Atualizações automáticas','Viagens e segurança'])[i],
       'Conteúdo rápido de conscientização.', (date_trunc('month', current_date) - ((12 - i) || ' months')::interval)::date,
       300 + (random()*500)::int, 'https://exemplo.com.br/pilulas/' || i)
    ON CONFLICT DO NOTHING;
  END LOOP;
  --
  -- ── Treinamentos: colaboradores, treinamentos e atribuições ────────────────
  FOR i IN 1..30 LOOP
    INSERT INTO public.colaboradores (id, display_name, email, department_id, cargo, unidade)
    VALUES (pg_temp.demo_id('colab',i), nomes[i],
       lower(replace(translate(nomes[i], 'áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ', 'aeiouaeoaocAEIOUAEOAOC'), ' ', '.')) || '@exemplo.com.br',
       depts[1 + (i % 7)], (ARRAY['Analista','Coordenador(a)','Assistente','Gerente','Especialista'])[1 + (i % 5)],
       (ARRAY['Matriz','Filial Sul','Filial Nordeste'])[1 + (i % 3)])
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR i IN 1..5 LOOP
    INSERT INTO public.treinamentos (id, titulo, descricao, tipo, status, prazo_padrao_dias, exigir_ciencia, exigir_pct_assistido, policy_id)
    VALUES (pg_temp.demo_id('trein',i),
       (ARRAY['Política de Segurança da Informação','Reconhecendo e-mails de phishing','Senhas e MFA',
              'LGPD para colaboradores','Uso seguro de IA generativa'])[i],
       'Treinamento de demonstração.',
       (ARRAY['Política','Phishing','Conscientização','Política','Conscientização'])[i], 'Publicado', 30, true, 0,
       CASE i WHEN 1 THEN pg_temp.demo_id('pol',1) WHEN 4 THEN pg_temp.demo_id('pol',8) END)
    ON CONFLICT DO NOTHING;
    FOR j IN 1..24 LOOP
      k  := 1 + ((i * 7 + j) % 30);
      st := (ARRAY['Concluído','Concluído','Concluído','Em andamento','Pendente'])[1 + ((i + j) % 5)];
      INSERT INTO public.treinamento_atribuicoes (id, treinamento_id, colaborador_id, origem, status, pct_assistido,
                                                  prazo, iniciado_em, concluido_em, convite_enviado_em)
      VALUES (pg_temp.demo_id('treinatr', i*100 + j), pg_temp.demo_id('trein',i), pg_temp.demo_id('colab',k),
         CASE i WHEN 2 THEN 'phishing' WHEN 1 THEN 'politica' WHEN 4 THEN 'politica' ELSE 'manual' END, st,
         CASE st WHEN 'Concluído' THEN 100 WHEN 'Em andamento' THEN 40 ELSE 0 END,
         current_date + (i*5 - 10),
         CASE WHEN st <> 'Pendente' THEN now() - ((20 + j) || ' days')::interval END,
         CASE WHEN st = 'Concluído' THEN now() - ((5 + j) || ' days')::interval END,
         now() - ((30 + j) || ' days')::interval)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  --
  RAISE NOTICE 'Dados de demonstração carregados.';
END $seed$;
