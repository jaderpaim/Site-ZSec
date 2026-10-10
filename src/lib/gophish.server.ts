// Server-only Gophish API client. Reads credentials from `integrations` table.
import { createClient } from "@supabase/supabase-js";
import { readSecret } from "@/lib/crypto.server";

function makeAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type GophishCreds = { baseUrl: string; apiKey: string };

export async function getGophishCreds(): Promise<GophishCreds | null> {
  const supabase = makeAdmin();
  const { data } = await supabase
    .from("integrations")
    .select("base_url, api_key, enabled")
    .eq("provider", "gophish")
    .maybeSingle();
  if (!data?.enabled || !data?.api_key || !data?.base_url) return null;
  return { baseUrl: data.base_url.replace(/\/+$/, ""), apiKey: readSecret(data.api_key) };
}

export async function gophishFetch<T>(creds: GophishCreds, path: string): Promise<T> {
  const url = `${creds.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: "application/json",
      ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
      ...(process.env.CF_ACCESS_CLIENT_SECRET
        ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
        : {}),
    },
  });
  if (!res.ok) throw new Error(`Gophish ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

// ─── Domain types (subset of Gophish API responses) ──────────────────────────
export type GpResult = {
  id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  status: string; // "Email Sent" | "Email Opened" | "Clicked Link" | "Submitted Data" | "Email Reported"
  ip?: string;
  reported?: boolean;
};

export type GpTemplateRef = { id: number; name: string };

export type GpCampaign = {
  id: number;
  name: string;
  status: string; // "In progress" | "Completed" | "Queued"
  created_date?: string;
  launch_date?: string;
  completed_date?: string;
  template?: { id: number; name: string; html?: string; subject?: string };
  results?: GpResult[];
  groups?: Array<{ id: number; name: string }>;
};

export type GpTemplate = { id: number; name: string; subject?: string; html?: string; text?: string };

export type GpGroupTarget = {
  email: string;
  first_name?: string;
  last_name?: string;
  position?: string;
};

export type GpGroup = { id: number; name: string; modified_date?: string; targets?: GpGroupTarget[] };
