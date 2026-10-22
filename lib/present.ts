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
