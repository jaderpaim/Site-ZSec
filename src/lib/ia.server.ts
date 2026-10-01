// Server-only helpers for IA Ranking
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs" as never).insert({
      provider: "ranking-ia",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    } as never);
  } catch {
    /* ignore */
  }
}

export function cleanUserName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  // Strip "DOMAIN\" prefix
  return v.replace(/^[^\\]+\\/, "").trim() || null;
}

// Known AI tools — host/keyword fragments → friendly "Tipo de IA" name.
// Order matters: first match wins.
const IA_TOOL_RULES: Array<{ match: RegExp; name: string }> = [
  { match: /chatgpt|openai\.com/i, name: "ChatGPT" },
  { match: /copilot|githubcopilot|microsoft\.com\/.*copilot|bing\.com\/chat/i, name: "Copilot" },
  { match: /gemini\.google|bard\.google|generativelanguage|deepmind/i, name: "Gemini" },
  { match: /claude|anthropic/i, name: "Claude" },
  { match: /perplexity/i, name: "Perplexity" },
  { match: /mistral/i, name: "Mistral" },
  { match: /huggingface/i, name: "Hugging Face" },
  { match: /character\.ai/i, name: "Character.AI" },
  { match: /poe\.com/i, name: "Poe" },
  { match: /you\.com/i, name: "You.com" },
  { match: /grok|x\.ai/i, name: "Grok" },
  { match: /midjourney/i, name: "Midjourney" },
  { match: /stability\.ai|stablediffusion/i, name: "Stability AI" },
  { match: /runwayml/i, name: "Runway" },
  { match: /notion\.so\/.*ai|notion\.ai/i, name: "Notion AI" },
  { match: /jasper\.ai/i, name: "Jasper" },
  { match: /writesonic/i, name: "Writesonic" },
  { match: /deepl\.com\/write|deepl-write/i, name: "DeepL Write" },
  { match: /elevenlabs/i, name: "ElevenLabs" },
  { match: /suno\.ai|suno\.com/i, name: "Suno" },
  { match: /lovable\.dev|api\.lovable/i, name: "Lovable" },
  { match: /gamma\.app|api\.gamma/i, name: "Gamma" },
];

// Classify an arbitrary text blob (URL, host, raw event text) into a known IA tool.
// Returns null when the text does not match any known AI tool — caller should discard.
export function classifyIaTool(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = String(text);
  for (const r of IA_TOOL_RULES) {
    if (r.match.test(s)) return r.name;
  }
  return null;
}

// Decide whether a sophos_events row is an IA web-control event.
// Rule: must contain the tag "IA" somewhere in the event payload
// (type / name / source / raw). If the tag is absent, the event is discarded.
export function isWebEvent(row: {
  type?: string | null;
  name?: string | null;
  source?: string | null;
  raw?: Record<string, unknown> | null;
}): boolean {
  const blob = [row.type, row.name, row.source, row.raw && typeof row.raw === "object" ? JSON.stringify(row.raw) : ""]
    .filter(Boolean)
    .join(" ");
  if (!blob) return false;
  // Must contain "IA" as a standalone token (case-sensitive, word boundary).
  // Matches: "IA", "tag:IA", "[IA]", "categoria=IA", "tags:[\"IA\"]".
  // Does NOT match: "Midia", "Dialog", "Maria" — anything where IA is embedded in another word.
  return /(^|[^A-Za-z0-9])IA([^A-Za-z0-9]|$)/.test(blob);
}

type SophosEventRow = {
  id: string;
  tenant_id: string;
  event_at: string | null;
  user_name: string | null;
  endpoint_name: string | null;
  type: string | null;
  name: string | null;
  raw: Record<string, unknown> | null;
};

// Take a batch of sophos_events rows and upsert the IA-relevant subset
// into ia_web_events.
export async function ingestWebEventsFromSophos(rows: SophosEventRow[]): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  const out: Array<{
    id: string;
    tenant_id: string;
    event_at: string;
    user_name: string | null;
    endpoint_name: string | null;
    domain: string | null;
    raw_event: string | null;
    source_event_id: string;
  }> = [];

  for (const r of rows) {
    if (!r.event_at) continue;
    if (!isWebEvent({ type: r.type, name: r.name, raw: r.raw })) continue;

    const raw = r.raw ?? {};
    // Gather all candidate text snippets that may carry the IA tool URL/name.
    const rawObj = raw as Record<string, unknown>;
    const candidates: string[] = [];
    for (const v of [
      rawObj.url,
      rawObj.target,
      rawObj.destination,
      rawObj.destinationDomain,
      rawObj.host,
      rawObj.event,
      rawObj.Evento,
      rawObj.Event,
      r.name,
      r.type,
    ]) {
      if (typeof v === "string" && v.trim()) candidates.push(v);
    }
    let tool: string | null = null;
    for (const c of candidates) {
      tool = classifyIaTool(c);
      if (tool) break;
    }
    // Final fallback: scan the whole raw blob.
    if (!tool) tool = classifyIaTool(JSON.stringify(raw));
    if (!tool) continue; // discard events that don't map to a known IA tool

    // user_name fallback: sophos_events.user_name is often NULL; the actual
    // identity lives in raw.source (e.g. "DOMAIN\\user.name") or other fields.
    const rawUser =
      r.user_name ||
      (typeof rawObj.source === "string" ? (rawObj.source as string) : null) ||
      (typeof rawObj.user_name === "string" ? (rawObj.user_name as string) : null) ||
      (typeof rawObj.userName === "string" ? (rawObj.userName as string) : null) ||
      (typeof rawObj.user === "string" ? (rawObj.user as string) : null);

    out.push({
      id: `ia-${r.id}`,
      tenant_id: r.tenant_id,
      event_at: r.event_at,
      user_name: cleanUserName(rawUser),
      endpoint_name: r.endpoint_name,
      domain: tool,
      raw_event: typeof r.name === "string" ? r.name : null,
      source_event_id: r.id,
    });
  }

  if (out.length === 0) return 0;

  for (let i = 0; i < out.length; i += 500) {
    const chunk = out.slice(i, i + 500);
    const { error } = await supabaseAdmin.from("ia_web_events").upsert(chunk as never, { onConflict: "id" });
    if (error) throw new Error(`upsert ia_web_events: ${error.message}`);
  }
  return out.length;
}

// Re-derive ia_web_events from sophos_events covering the last `days` days.
// Used by both the periodic sync and on-demand rebuilds.
export async function rebuildIaWebEvents(days = 7): Promise<number> {
  const t0 = Date.now();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let processed = 0;
  let from = 0;
  const page = 1000;
  try {
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("sophos_events")
        .select("id, tenant_id, event_at, user_name, endpoint_name, type, name, raw")
        .gte("event_at", since)
        .order("event_at", { ascending: true })
        .range(from, from + page - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as SophosEventRow[];
      if (rows.length === 0) break;
      processed += await ingestWebEventsFromSophos(rows);
      if (rows.length < page) break;
      from += page;
    }
    await logApi(
      "success",
      200,
      `ranking-ia sync: ${processed} eventos IA processados (últimos ${days}d)`,
      Date.now() - t0,
    );
    return processed;
  } catch (e: any) {
    await logApi("error", null, e?.message ?? "Erro ao sincronizar ranking IA", Date.now() - t0);
    throw e;
  }
}
