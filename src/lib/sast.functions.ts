import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasPermission, requirePermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";
import { recordCronAttemptStart, recordCronRun } from "@/lib/cron-tracking.server";

// Módulo SAST (achados das esteiras CI/CD). Leitura via context.supabase
// (user-scoped): a RLS de sast_* já filtra por has_module_permission('sast',
// 'view'). Escrita (triagem, sync) sempre por aqui com service_role, depois de
// checar a permissão granular -- nunca update direto do client.
type AnyDb = { from: (t: string) => any };
const db = (sb: unknown) => sb as unknown as AnyDb;
const adminDb = supabaseAdmin as unknown as AnyDb;

export const SAST_CRON_JOB = "sast-sync";

export const getSastAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const [canView, canEdit, canManage] = await Promise.all([
      hasPermission(context.supabase, context.userId, "sast", "view"),
      hasPermission(context.supabase, context.userId, "sast", "edit"),
      hasPermission(context.supabase, context.userId, "sast", "manage"),
    ]);
    return { canView, canEdit, canManage };
  });

export const listSastFindings = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("sast_findings")
      .select(
        "id, tool, category, project, repository, branch, environment, rule_id, severity, fingerprint, file_path, line, title, details, status, resolution_source, resolved_at, triaged_at, triage_note, first_seen_at, last_seen_at, occurrences, last_commit_sha, last_build_id, last_build_url, last_file_url, last_author, last_author_email, introduced_by, introduced_by_email, triaged_by",
      )
      .order("last_seen_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    const findings = (data ?? []) as any[];

    // Nome de quem triou -- profiles não é legível por todo mundo via RLS.
    const triagerIds = [...new Set(findings.map((f) => f.triaged_by).filter(Boolean))];
    const names = new Map<string, string>();
    if (triagerIds.length) {
      const { data: profiles } = await adminDb
        .from("profiles")
        .select("id, full_name, email")
        .in("id", triagerIds);
      for (const p of (profiles ?? []) as any[]) names.set(p.id, p.full_name || p.email || "—");
    }
    return {
      findings: findings.map((f) => ({
        ...f,
        triaged_by_name: f.triaged_by ? (names.get(f.triaged_by) ?? "—") : null,
      })),
    };
  });

export const listSastScanRuns = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db(context.supabase)
      .from("sast_scan_runs")
      .select(
        "id, tool, project, repository, branch, environment, commit_sha, build_id, build_url, findings_count, scanned_at",
      )
      .gte("scanned_at", since)
      .order("scanned_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as any[] };
  });

export const listSastFindingEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ findingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await db(context.supabase)
      .from("sast_finding_events")
      .select("id, detected_at, commit_sha, build_id, build_url, file_url, author, author_email")
      .eq("finding_id", data.findingId)
      .order("detected_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as any[] };
  });

export const getSastSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "sast", "view");
    const [
      { data: integ },
      { data: cursor },
      { data: cron },
      { data: ingestInteg },
      { data: lastWebhookRun },
    ] = await Promise.all([
      adminDb
        .from("integrations")
        .select("enabled, api_key, config")
        .eq("provider", "azure_app_insights")
        .maybeSingle(),
      adminDb
        .from("sast_ingest_cursor")
        .select("last_event_at, updated_at")
        .eq("source", "app-insights")
        .maybeSingle(),
      adminDb
        .from("cron_job_runs")
        .select("enabled, last_attempt_at, last_success_at, last_ok, last_error")
        .eq("job_name", SAST_CRON_JOB)
        .maybeSingle(),
      adminDb
        .from("integrations")
        .select("enabled")
        .eq("provider", "azure_devops_sast")
        .maybeSingle(),
      adminDb
        .from("sast_scan_runs")
        .select("created_at")
        .eq("ingest_source", "webhook")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const cfg = (integ?.config ?? {}) as Record<string, unknown>;
    return {
      // Só booleano -- nunca devolve credencial pro browser.
      configured: !!(integ?.api_key && cfg.tenant_id && cfg.client_id && cfg.workspace_id),
      enabled: !!integ?.enabled,
      lastSyncAt: (cursor?.updated_at as string | null) ?? null,
      lastEventAt: (cursor?.last_event_at as string | null) ?? null,
      cron: cron
        ? {
            enabled: !!cron.enabled,
            lastAttemptAt: cron.last_attempt_at as string | null,
            lastSuccessAt: cron.last_success_at as string | null,
            lastOk: cron.last_ok as boolean | null,
            lastError: cron.last_error as string | null,
          }
        : null,
      // Ingestão direta da pipeline (sast-ingest) -- convive com o App Insights.
      ingest: {
        enabled: !!ingestInteg?.enabled,
        lastReceivedAt: (lastWebhookRun?.created_at as string | null) ?? null,
      },
    };
  });

const TriageSchema = z
  .object({
    findingId: z.string().uuid(),
    status: z.enum(["aberto", "resolvido", "falso_positivo", "risco_aceito"]),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((d) => d.status === "aberto" || (d.note ?? "").length >= 5, {
    message: "Justificativa obrigatória (mínimo 5 caracteres).",
    path: ["note"],
  });

export const setSastFindingStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => TriageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "sast", "edit");

    const { data: finding, error: fetchError } = await adminDb
      .from("sast_findings")
      .select("id, tool, project, repository, branch, rule_id, file_path, line, status")
      .eq("id", data.findingId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!finding) throw new Error("Achado não encontrado.");
    if (finding.status === data.status) return { ok: true };

    const now = new Date().toISOString();
    const reopening = data.status === "aberto";
    const { error } = await adminDb
      .from("sast_findings")
      .update({
        status: data.status,
        resolution_source: reopening ? null : "manual",
        resolved_at: data.status === "resolvido" ? now : null,
        triaged_by: context.userId,
        triaged_at: now,
        triage_note: reopening ? (data.note ?? null) : data.note,
        updated_at: now,
      })
      .eq("id", data.findingId);

    const descricao = `Alterou achado SAST ${finding.repository}/${finding.branch} (${finding.rule_id}${finding.file_path ? ` em ${finding.file_path}` : ""}) de "${finding.status}" para "${data.status}"`;
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "triage",
      descricao,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        findingId: data.findingId,
        from: finding.status,
        to: data.status,
        note: data.note ?? null,
        project: finding.project,
        repository: finding.repository,
        branch: finding.branch,
      },
    });
    if (error) throw new Error(error.message);

    const { notifySastTriage } = await import("@/lib/sast.server");
    await notifySastTriage({
      finding,
      previousStatus: finding.status,
      newStatus: data.status,
      note: data.note ?? null,
      actorUserId: context.userId,
    });
    return { ok: true };
  });

export const triggerSastSync = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "sast", "manage");
    const started = Date.now();
    await recordCronAttemptStart(SAST_CRON_JOB, "manual");
    const { syncSastFromAppInsights } = await import("@/lib/sast.server");
    const result = await syncSastFromAppInsights();
    await recordCronRun(SAST_CRON_JOB, "manual", {
      ok: result.ok,
      error: result.error,
      durationMs: Date.now() - started,
    });
    await logAudit({
      userId: context.userId,
      modulo: "sast",
      acao: "sync_manual",
      descricao: result.ok
        ? `Sincronizou SAST manualmente (${result.eventsRead} eventos lidos, ${result.detectionsInserted} detecções novas, ${result.findingsAutoResolved} achados fechados automaticamente)`
        : "Falha ao sincronizar SAST manualmente",
      status: result.ok ? "success" : "error",
      mensagemErro: result.error ?? null,
      detalhes: { ...result },
    });
    if (!result.ok) throw new Error(result.error ?? "Falha ao sincronizar.");
    return result;
  });
