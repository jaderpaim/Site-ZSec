// Server-only: cruzamento com o Entra ID via Microsoft Graph (app-only).
// Busca, por colaborador com vazamento, a última troca de senha, status de MFA e
// se a conta está ativa, e grava em leakradar_ad_status. NUNCA importar no cliente.
//
// Credencial na tabela `integrations` (provider='entra_graph'): client_secret
// cifrado em api_key; tenant_id/client_id em config.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

const GRAPH = "https://graph.microsoft.com/v1.0";
const REQUEST_GAP_MS = 120;
const MAX_TARGETS = 5000;

export type EntraCreds = { tenantId: string; clientId: string; clientSecret: string };

// Credenciais do app-only Graph: usa o MESMO app do SSO (sso_config traz
// tenant/client; o secret vem do env AZURE_CLIENT_SECRET). Para funcionar, o app
// do SSO precisa ter as permissões de APLICAÇÃO do Graph + consentimento do admin.
export async function getEntraCreds(): Promise<EntraCreds | null> {
  const { data: sso } = await adminDb
    .from("sso_config")
    .select("azure_tenant_id, azure_client_id")
    .limit(1)
    .maybeSingle();
  const secret = process.env.AZURE_CLIENT_SECRET;
  if (sso?.azure_tenant_id && sso?.azure_client_id && secret) {
    return { tenantId: sso.azure_tenant_id, clientId: sso.azure_client_id, clientSecret: secret };
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extrai a mensagem de erro do corpo do Graph (ex.: "Insufficient privileges…").
function graphErr(json: any): string {
  const m = json?.error?.message ?? json?.error?.code;
  return typeof m === "string" ? m.slice(0, 160) : "sem detalhe";
}

async function graphToken(creds: EntraCreds): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  // Timeout: sem isso, um servidor sem egress para a Microsoft deixa a coleta
  // pendurada para sempre (o recordCronRun nunca é chamado).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      (e as Error).name === "AbortError"
        ? "Sem resposta de login.microsoftonline.com (timeout) — verifique o acesso do servidor à internet."
        : `Falha ao contatar login.microsoftonline.com: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!data.access_token) throw new Error(`Token Graph: ${data.error_description ?? res.status}`);
  return data.access_token;
}

async function graphGet(
  token: string,
  path: string,
): Promise<{ ok: boolean; status: number; json: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

type Target = { email: string; graphId: string };

// Alvos: contas de colaboradores (employees) com vazamento, não mascaradas.
// Usa entra_oid do cadastro quando houver; senão o próprio e-mail como UPN.
async function collectTargets(): Promise<Target[]> {
  const { data: leaks } = await adminDb
    .from("leakradar_leaks")
    .select("username")
    .eq("category", "employees")
    .limit(20000);
  const emails = [
    ...new Set(
      ((leaks ?? []) as Array<{ username: string | null }>)
        .map((l) => (l.username ?? "").trim().toLowerCase())
        .filter((u) => u && !u.includes("*") && u.includes("@")),
    ),
  ].slice(0, MAX_TARGETS);
  if (emails.length === 0) return [];

  const { data: colabs } = await adminDb
    .from("colaboradores")
    .select("email, entra_oid")
    .in("email", emails);
  const oidByEmail = new Map<string, string | null>(
    ((colabs ?? []) as Array<{ email: string; entra_oid: string | null }>).map((c) => [
      c.email.toLowerCase(),
      c.entra_oid,
    ]),
  );
  return emails.map((email) => ({ email, graphId: oidByEmail.get(email) || email }));
}

export async function syncAdStatus(): Promise<{ ok: boolean; checked: number; error?: string }> {
  const creds = await getEntraCreds();
  if (!creds) {
    return {
      ok: false,
      checked: 0,
      error: "SSO (Entra) não configurado ou AZURE_CLIENT_SECRET ausente.",
    };
  }
  try {
    const token = await graphToken(creds);
    const targets = await collectTargets();
    const now = new Date().toISOString();
    let checked = 0;

    for (const t of targets) {
      const id = encodeURIComponent(t.graphId);
      const row: Record<string, unknown> = {
        email: t.email,
        checked_at: now,
        updated_at: now,
        error: null,
      };
      const user = await graphGet(
        token,
        `/users/${id}?$select=id,accountEnabled,lastPasswordChangeDateTime,userType,userPrincipalName`,
      );
      await sleep(REQUEST_GAP_MS);
      if (user.ok) {
        row.entra_oid = user.json?.id ?? (t.graphId.includes("@") ? null : t.graphId);
        row.account_enabled = user.json?.accountEnabled ?? null;
        row.last_password_change = user.json?.lastPasswordChangeDateTime ?? null;
        row.user_type = user.json?.userType ?? null; // Member | Guest
        row.user_principal_name = user.json?.userPrincipalName ?? null;

        // MFA pelos métodos de autenticação (não exige licença premium, ao
        // contrário do relatório userRegistrationDetails). Forte = qualquer
        // segundo fator além de senha/e-mail.
        const reg = await graphGet(token, `/users/${id}/authentication/methods`);
        await sleep(REQUEST_GAP_MS);
        if (reg.ok) {
          const metodos = (reg.json?.value ?? []) as Array<{ "@odata.type"?: string }>;
          const forte = metodos.some((m) => {
            const t = (m["@odata.type"] ?? "").toLowerCase();
            return (
              t.includes("microsoftauthenticator") ||
              t.includes("phone") ||
              t.includes("fido2") ||
              t.includes("softwareoath") ||
              t.includes("windowshelloforbusiness")
            );
          });
          row.mfa_registered = forte;
          row.mfa_capable = forte;
        } else if (reg.status !== 404) {
          row.error = `MFA ${reg.status}: ${graphErr(reg.json)}`;
        }
      } else {
        // 404 = não existe no tenant; registra o estado para a tela saber.
        row.error =
          user.status === 404
            ? "conta não encontrada no Entra"
            : `Graph ${user.status}: ${graphErr(user.json)}`;
        row.account_enabled = null;
        row.last_password_change = null;
      }

      const { error } = await adminDb
        .from("leakradar_ad_status")
        .upsert(row, { onConflict: "email" });
      if (error) throw new Error(error.message);
      checked++;
    }
    return { ok: true, checked };
  } catch (e) {
    return { ok: false, checked: 0, error: (e as Error).message };
  }
}

// Hosts de login da Microsoft — validação por ROPC contra o próprio tenant.
export const MS_LOGIN_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.windows.net",
  "login.live.com",
  "sts.windows.net",
];
export function isMsLoginHost(host: string | null | undefined): boolean {
  const h = (host ?? "").toLowerCase();
  return MS_LOGIN_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

// Validação legítima de credencial Microsoft/Entra: ROPC (grant_type=password)
// contra o SEU tenant, com o app do SSO. NÃO é POST no formulário de login de
// terceiro — é o fluxo de autenticação suportado para o seu próprio diretório.
// Distingue senha válida / válida-com-MFA / inválida.
export async function validateEntraRopc(
  username: string,
  password: string,
): Promise<{ status: "valida" | "invalida" | "inconclusiva"; detail: string; mfa?: boolean }> {
  const creds = await getEntraCreds();
  if (!creds) return { status: "inconclusiva", detail: "Entra/SSO não configurado." };
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    username,
    password,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let json: any;
  let ok = false;
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: ctrl.signal,
      },
    );
    ok = res.ok;
    json = await res.json().catch(() => ({}));
  } catch (e) {
    return {
      status: "inconclusiva",
      detail:
        (e as Error).name === "AbortError"
          ? "Sem resposta do Entra (timeout)."
          : `Falha ao contatar o Entra: ${(e as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (ok && json?.access_token) {
    return {
      status: "valida",
      detail: "Login aceito no Entra — senha válida, sem MFA bloqueando.",
    };
  }
  const err: string = json?.error_description ?? json?.error ?? "";
  const code = (err.match(/AADSTS\d+/) ?? [])[0] ?? "";
  // MFA exigido = a SENHA está correta (a 1ª etapa passou); só o 2º fator barrou.
  if (/AADSTS50076|AADSTS50079|AADSTS50074|AADSTS50072|AADSTS50158/.test(err)) {
    return {
      status: "valida",
      detail: "Senha válida — o login exige MFA (2º fator barrou).",
      mfa: true,
    };
  }
  if (/AADSTS50126/.test(err)) return { status: "invalida", detail: "Senha recusada pelo Entra." };
  if (/AADSTS700056|AADSTS50034|AADSTS50128|AADSTS51004/.test(err))
    return {
      status: "inconclusiva",
      detail:
        "Identidade externa/federada (ex.: conta Microsoft pessoal) — a senha é do provedor de origem, não do seu tenant. Use a marcação manual.",
    };
  if (/AADSTS50057/.test(err))
    return { status: "inconclusiva", detail: "Conta desabilitada no Entra." };
  if (/AADSTS50053/.test(err))
    return { status: "inconclusiva", detail: "Conta bloqueada (smart lockout) — não insista." };
  if (/AADSTS65001|AADSTS7000218|AADSTS50059|AADSTS700016/.test(err)) {
    return {
      status: "inconclusiva",
      detail: "ROPC indisponível (app sem password grant ou conta federada).",
    };
  }
  return {
    status: "inconclusiva",
    detail: code ? `Entra: ${code}` : "Entra: resposta inesperada.",
  };
}

// ── Teste de diretório por credencial (modelo do b-security-suite) ───────────
// Lê a conta no Graph (app-only) e compara a última troca de senha com a data
// do vazamento. NÃO envia a senha a lugar nenhum. Conta ativa com senha não
// trocada desde o vazamento → "exposta" (pode ser confirmada no Entra depois);
// senha trocada / conta desativada → "mitigada".
// Permissões de aplicação: User.Read.All; UserAuthenticationMethod.Read.All
// (MFA) e RoleManagement.Read.Directory (conta privilegiada) são opcionais.
export async function testDirectory(args: {
  upn: string;
  leakedAt: string | null;
}): Promise<import("./leakradar-validate.server").ValidationOutcome> {
  const creds = await getEntraCreds();
  if (!creds)
    return {
      status: "inconclusiva",
      severity: null,
      summary: "Entra/SSO não configurado — o teste de diretório usa o app do SSO.",
      details: {},
    };
  let token: string;
  try {
    token = await graphToken(creds);
  } catch (e) {
    return { status: "inconclusiva", severity: null, summary: (e as Error).message, details: {} };
  }
  const id = encodeURIComponent(args.upn);
  const user = await graphGet(
    token,
    `/users/${id}?$select=id,accountEnabled,lastPasswordChangeDateTime,userType,userPrincipalName,displayName`,
  );
  if (!user.ok)
    return {
      status: "inconclusiva",
      severity: null,
      summary:
        user.status === 404
          ? "Conta não encontrada no diretório."
          : `Graph ${user.status}: ${graphErr(user.json)}`,
      details: { encontrada: user.status === 404 ? false : null },
    };

  const upn: string = user.json?.userPrincipalName ?? args.upn;
  const userType: string | null = user.json?.userType ?? null;
  const externa = userType === "Guest" || upn.includes("#EXT#");
  const accountEnabled = user.json?.accountEnabled !== false;
  const lastPwd: string | null = user.json?.lastPasswordChangeDateTime ?? null;
  const leakedAt = args.leakedAt ? new Date(args.leakedAt) : null;
  const trocadaDepois =
    !!lastPwd && !!leakedAt && new Date(lastPwd).getTime() > leakedAt.getTime();

  // Checagens extras: dependem de permissões opcionais e nunca derrubam o teste.
  let mfa: boolean | null = null;
  const reg = await graphGet(token, `/users/${id}/authentication/methods`);
  if (reg.ok) {
    const metodos = (reg.json?.value ?? []) as Array<{ "@odata.type"?: string }>;
    mfa = metodos.some((m) => {
      const t = (m["@odata.type"] ?? "").toLowerCase();
      return (
        t.includes("microsoftauthenticator") ||
        t.includes("phone") ||
        t.includes("fido2") ||
        t.includes("softwareoath") ||
        t.includes("windowshelloforbusiness")
      );
    });
  }
  let privilegiada: boolean | null = null;
  const roles = await graphGet(token, `/users/${id}/memberOf/microsoft.graph.directoryRole?$select=id`);
  if (roles.ok) privilegiada = ((roles.json?.value ?? []) as unknown[]).length > 0;

  const details = {
    encontrada: true,
    upn,
    userType,
    externa,
    contaAtiva: accountEnabled,
    ultimaTrocaSenha: lastPwd,
    dataVazamento: args.leakedAt,
    trocadaDepois,
    mfa,
    privilegiada,
  };

  if (!accountEnabled)
    return { status: "mitigada", severity: "baixa", summary: "Conta desativada no diretório.", details };
  if (trocadaDepois)
    return {
      status: "mitigada",
      severity: "baixa",
      summary: "Senha trocada depois do vazamento.",
      details,
    };
  const extra = [mfa === false ? "sem MFA" : null, privilegiada ? "conta privilegiada" : null]
    .filter(Boolean)
    .join(", ");
  return {
    status: "exposta",
    severity: "critica",
    summary: `Conta ativa e senha não trocada desde o vazamento${extra ? ` (${extra})` : ""}.${
      lastPwd ? "" : " O Graph não informou a última troca de senha."
    }`,
    details,
  };
}
