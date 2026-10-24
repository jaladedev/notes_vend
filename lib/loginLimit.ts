// Login rate limiting. Failed attempts are counted over a sliding window:
//   * per (username, IP): MAX_PER_USER_IP -- stops guessing one account
//   * per IP:            MAX_PER_IP      -- stops spraying many usernames
// There is deliberately NO per-username-only limit, so someone who knows an
// operator's name cannot lock that operator out from another address.
//
// Counts come from the audit store (rows with action "login.failed", written
// by lib/audit.ts) so they are shared across serverless instances. With no
// store, or if it can't be reached, an in-memory counter is used instead:
// better than nothing, but per instance only.
import { auditSinkFromEnv } from "@/lib/audit";

export const WINDOW_MINUTES = 15;
export const MAX_PER_USER_IP = 5;
export const MAX_PER_IP = 20;

const TIMEOUT_MS = 3000;
const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

/** First hop of x-forwarded-for (set by the host's proxy), else "unknown". */
export function clientIp(headers: { get(name: string): string | null }): string {
  const first = (headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  return IP_RE.test(first) ? first : "unknown";
}

export type Counts = { userIp: number; ip: number };

export function isLimited(c: Counts): boolean {
  return c.userIp >= MAX_PER_USER_IP || c.ip >= MAX_PER_IP;
}

// ---- in-memory fallback ---------------------------------------------------
const memory = new Map<string, number[]>();

function memCount(key: string, now: number): number {
  const cutoff = now - WINDOW_MINUTES * 60_000;
  const kept = (memory.get(key) ?? []).filter((t) => t > cutoff);
  if (kept.length) memory.set(key, kept);
  else memory.delete(key);
  return kept.length;
}

export function recordFailureInMemory(username: string, ip: string, now = Date.now()): void {
  for (const key of [`u:${username}|${ip}`, `i:${ip}`]) {
    memory.set(key, [...(memory.get(key) ?? []), now]);
  }
}

export function countsFromMemory(username: string, ip: string, now = Date.now()): Counts {
  return { userIp: memCount(`u:${username}|${ip}`, now), ip: memCount(`i:${ip}`, now) };
}

export function resetMemoryForTests(): void {
  memory.clear();
}

// ---- shared store ---------------------------------------------------------
async function countFailures(
  sink: { url: string; key: string },
  filters: Record<string, string>,
  sinceIso: string
): Promise<number> {
  const qs = new URLSearchParams({ select: "id", action: "eq.login.failed", at: `gte.${sinceIso}`, ...filters });
  const res = await fetch(`${sink.url}/rest/v1/platform_audit_log?${qs}`, {
    method: "HEAD",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { apikey: sink.key, authorization: `Bearer ${sink.key}`, prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // content-range looks like "0-4/5" or "*/0"
  const total = Number((res.headers.get("content-range") ?? "").split("/")[1]);
  if (!Number.isFinite(total)) throw new Error("no count");
  return total;
}

/** Failed attempts in the window for this username+IP and for this IP. */
export async function currentCounts(username: string, ip: string, now = Date.now()): Promise<Counts> {
  const sink = auditSinkFromEnv();
  const mem = countsFromMemory(username, ip, now);
  if (!sink) return mem;
  const since = new Date(now - WINDOW_MINUTES * 60_000).toISOString();
  try {
    const [userIp, byIp] = await Promise.all([
      countFailures(sink, { "detail->>ip": `eq.${ip}`, "detail->>operator": `eq.${username}` }, since),
      countFailures(sink, { "detail->>ip": `eq.${ip}` }, since),
    ]);
    // The larger of the two: covers rows still in flight and a store that lags.
    return { userIp: Math.max(userIp, mem.userIp), ip: Math.max(byIp, mem.ip) };
  } catch {
    return mem;
  }
}
