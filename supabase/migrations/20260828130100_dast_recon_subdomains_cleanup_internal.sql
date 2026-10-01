-- Limpeza pontual: antes da correção de roteamento (20260828130000), o
-- network_discovery gravava host interno com hostname resolvido direto em
-- dast_recon_subdomains (scope=internal) -- Ativos Descobertos do DAST.
-- Critério corrigido com o usuário: toda descoberta de host interno é
-- Shadow IT, DAST fica só com descoberta externa (Amass/Cloudflare). Scan
-- novo não grava mais nada com scope=internal aqui; isso remove o que já
-- tinha sido gravado sob o critério antigo.

DELETE FROM public.dast_recon_subdomains
WHERE scope = 'internal';
