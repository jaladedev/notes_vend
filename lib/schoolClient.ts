// Signed calls to one school's /api/platform/* endpoints. Never throws on a
// school being down: the dashboard has to keep rendering the other schools.
import { signPlatformRequest } from "@/lib/sign";
import type { School } from "@/lib/schools";

const TIMEOUT_MS = 8000;

export type SubscriptionState = "off" | "active" | "grace" | "upcoming" | "expired";

export type SchoolStatus = {
  schoolName: string | null;
  academicYear: string | null;
  term: number | null;
  latestMigration: string | null;
  subscription: {
    state: SubscriptionState;
    academicYear: string | null;
    startsOn: string | null;
    endsOn: string | null;
    /** active: days until ends. grace: days of grace left (0 = last day). */
    daysLeft: number | null;
    /** Last day access continues after the session ends. Absent on schools without migration 0039. */
    graceEndsOn?: string | null;
  } | null;
  subscriptionError: string | null;
  activeUsers: Record<string, number>;
};

export type Subscription = {
  id: string;
  academic_year: string;
  starts_on: string;
  ends_on: string;
  /** Absent on schools without migration 0039. */
  grace_days?: number;
  note: string | null;
  created_at: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(school: School, method: string, pathAndQuery: string, body = ""): Promise<Result<T>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPlatformRequest({ secret: school.secret, timestamp, method, pathAndQuery, body });
  try {
    const res = await fetch(school.baseUrl + pathAndQuery, {
      method,
      body: body || undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "x-platform-timestamp": String(timestamp),
        "x-platform-signature": signature,
        ...(body ? { "content-type": "application/json" } : {}),
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const msg = (json as { error?: string; message?: string } | null)?.error ?? (json as { message?: string } | null)?.message;
      if (res.status === 404 && msg === "Not found") {
        return { ok: false, error: "Platform API not enabled on this school (PLATFORM_SECRET unset or this version predates it)." };
      }
      if (res.status === 401) return { ok: false, error: "Rejected the signature -- the secret differs from the school's PLATFORM_SECRET." };
      return { ok: false, error: msg ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: timedOut ? "Timed out." : "Could not reach the school." };
  }
}

export const fetchStatus = (s: School) => call<SchoolStatus & { status: string }>(s, "GET", "/api/platform/status");
export const listSubscriptions = (s: School) =>
  call<{ subscriptions: Subscription[] }>(s, "GET", "/api/platform/subscriptions");
export const addSubscription = (s: School, input: { academicYear: string; startsOn: string; endsOn: string; note?: string; graceDays?: number }) =>
  call<{ subscription: Subscription }>(s, "POST", "/api/platform/subscriptions", JSON.stringify(input));
export const removeSubscription = (s: School, id: string) =>
  call<{ deleted: string }>(s, "DELETE", `/api/platform/subscriptions?id=${encodeURIComponent(id)}`);
