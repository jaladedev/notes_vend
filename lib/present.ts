import type { SchoolStatus } from "@/lib/schoolClient";

export function stateLabel(sub: SchoolStatus["subscription"]): { text: string; tone: "ok" | "warn" | "bad" | "off" } {
  if (!sub) return { text: "unknown", tone: "off" };
  switch (sub.state) {
    case "off": return { text: "not enforced", tone: "off" };
    case "active":
      return sub.daysLeft !== null && sub.daysLeft <= 14
        ? { text: `ends in ${sub.daysLeft}d`, tone: "warn" }
        : { text: "active", tone: "ok" };
    case "grace":
      return {
        text: sub.daysLeft === 0 ? "grace · last day" : `grace · ${sub.daysLeft ?? "?"}d left`,
        tone: "warn",
      };
    case "upcoming": return { text: "not started", tone: "warn" };
    case "expired": return { text: "expired", tone: "bad" };
  }
}

/** The highest migration name any reachable school reports. */
export function newestMigration(names: (string | null | undefined)[]): string | null {
  const real = names.filter((n): n is string => !!n);
  return real.length ? real.reduce((a, b) => (a > b ? a : b)) : null;
}

export type ExpiryInfo = {
  endsOn: string | null;
  /** Last day access continues: grace end when known, otherwise the session end. */
  accessUntil: string | null;
  /** Whole days from `today` to accessUntil; negative once it has passed. Null when unknown. */
  daysToAccessEnd: number | null;
};

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/** `today` is a YYYY-MM-DD string (UTC) so this stays pure and testable. */
export function expiryInfo(sub: SchoolStatus["subscription"], today: string): ExpiryInfo {
  const endsOn = sub?.endsOn ?? null;
  const accessUntil = sub?.graceEndsOn ?? endsOn;
  const a = accessUntil ? dayNumber(accessUntil) : null;
  const t = dayNumber(today);
  return { endsOn, accessUntil, daysToAccessEnd: a !== null && t !== null ? a - t : null };
}

/**
 * Sort key for the overview: unreachable schools first (they need a look),
 * then soonest access end (already-lapsed ahead of upcoming), schools with
 * no known end date last.
 */
export function expirySortKey(reachable: boolean, daysToAccessEnd: number | null): number {
  if (!reachable) return -Infinity;
  return daysToAccessEnd ?? Infinity;
}

/** Schools whose access ends within `withinDays` days (or already ended). */
export function isExpiringSoon(daysToAccessEnd: number | null, withinDays = 30): boolean {
  return daysToAccessEnd !== null && daysToAccessEnd <= withinDays;
}
