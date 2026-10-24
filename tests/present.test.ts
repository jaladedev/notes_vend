import { describe, expect, it } from "vitest";
import { expiryInfo, expirySortKey, isExpiringSoon } from "@/lib/present";

const sub = (over: Record<string, unknown>) =>
  ({ state: "active", academicYear: "2026/2027", startsOn: "2026-09-01", endsOn: "2026-12-31", daysLeft: 70, ...over }) as never;

describe("expiryInfo", () => {
  it("uses the session end when there is no grace date", () => {
    expect(expiryInfo(sub({}), "2026-10-23")).toEqual({
      endsOn: "2026-12-31", accessUntil: "2026-12-31", daysToAccessEnd: 69,
    });
  });
  it("prefers the grace end date", () => {
    const r = expiryInfo(sub({ graceEndsOn: "2027-01-07" }), "2026-10-23");
    expect(r.accessUntil).toBe("2027-01-07");
    expect(r.daysToAccessEnd).toBe(76);
  });
  it("goes negative once access has ended", () => {
    expect(expiryInfo(sub({ endsOn: "2026-10-01" }), "2026-10-23").daysToAccessEnd).toBe(-22);
  });
  it("is null when unknown", () => {
    expect(expiryInfo(null, "2026-10-23")).toEqual({ endsOn: null, accessUntil: null, daysToAccessEnd: null });
    expect(expiryInfo(sub({ endsOn: null }), "2026-10-23").daysToAccessEnd).toBeNull();
  });
});

describe("expirySortKey / isExpiringSoon", () => {
  it("orders unreachable, then soonest, then unknown", () => {
    const keys = [expirySortKey(true, null), expirySortKey(true, 40), expirySortKey(false, null), expirySortKey(true, -3)];
    expect([...keys].sort((a, b) => a - b)).toEqual([-Infinity, -3, 40, Infinity]);
  });
  it("flags lapsed and near-term schools only", () => {
    expect(isExpiringSoon(-3)).toBe(true);
    expect(isExpiringSoon(30)).toBe(true);
    expect(isExpiringSoon(31)).toBe(false);
    expect(isExpiringSoon(null)).toBe(false);
  });
});
