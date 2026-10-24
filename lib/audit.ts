// Operator audit trail. Every action is ALWAYS written to stdout as one JSON
// line (kind "platform.audit"). When AUDIT_SUPABASE_URL and
// AUDIT_SUPABASE_SERVICE_KEY are set it is also saved to the vendor's own
// Supabase project (table platform_audit_log, see supabase/audit_log.sql),
// which is append-only. A failed write is logged and never breaks the action.

const TIMEOUT_MS = 3000;
const MAX_STRING = 500;

export type AuditSink = { url: string; key: string };

export function auditSinkFromEnv(env: Record<string, string | undefined> = process.env): AuditSink | null {
  const url = env.AUDIT_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.AUDIT_SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key || !/^https:\/\//.test(url)) return null;
  return { url, key };
}

/** Keeps rows small: long strings are cut, undefined fields dropped. */
export function cleanDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v.length > MAX_STRING ? v.slice(0, MAX_STRING) + "…" : v;
  }
  return out;
}

export async function audit(action: string, detail: Record<string, unknown> = {}): Promise<void> {
  const at = new Date().toISOString();
  const clean = cleanDetail(detail);
  console.log(JSON.stringify({ at, kind: "platform.audit", action, ...clean }));

  const sink = auditSinkFromEnv();
  if (!sink) return;
  try {
    const res = await fetch(`${sink.url}/rest/v1/platform_audit_log`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: sink.key,
        authorization: `Bearer ${sink.key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ at, action, detail: clean }),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ kind: "platform.audit.store_failed", status: res.status, action }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      kind: "platform.audit.store_failed",
      action,
      error: err instanceof Error ? err.name : "unknown",
    }));
  }
}

export type AuditRow = { id: number; at: string; action: string; detail: Record<string, unknown> };

/** Latest rows first. Returns null when no store is configured, an error string when it fails. */
export async function listAudit(limit = 200): Promise<{ rows: AuditRow[] } | { error: string } | null> {
  const sink = auditSinkFromEnv();
  if (!sink) return null;
  try {
    const res = await fetch(`${sink.url}/rest/v1/platform_audit_log?select=id,at,action,detail&order=id.desc&limit=${limit}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
      headers: { apikey: sink.key, authorization: `Bearer ${sink.key}` },
    });
    if (!res.ok) return { error: `Audit store answered HTTP ${res.status}.` };
    return { rows: (await res.json()) as AuditRow[] };
  } catch {
    return { error: "Could not reach the audit store." };
  }
}
