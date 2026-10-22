import { describe, expect, it } from "vitest";
import { parseSchools } from "@/lib/schools";
import { newestMigration, stateLabel } from "@/lib/present";

const secret = "k".repeat(32);
const one = { slug: "greenfield", name: " Greenfield ", baseUrl: "https://g.example.com/some/path", secret };

describe("parseSchools", () => {
  it("returns [] for unset or blank", () => {
    expect(parseSchools(undefined)).toEqual([]);
    expect(parseSchools("  ")).toEqual([]);
  });
  it("normalises name and reduces baseUrl to its origin", () => {
    expect(parseSchools(JSON.stringify([one]))).toEqual([
      { slug: "greenfield", name: "Greenfield", baseUrl: "https://g.example.com", secret },
    ]);
  });
  it("allows http only for localhost", () => {
    expect(parseSchools(JSON.stringify([{ ...one, baseUrl: "http://localhost:3000" }]))[0]?.baseUrl).toBe("http://localhost:3000");
    expect(() => parseSchools(JSON.stringify([{ ...one, baseUrl: "http://g.example.com" }]))).toThrow(/https/);
  });
  it("rejects bad JSON, non-arrays, weak secrets, bad slugs and duplicates", () => {
    expect(() => parseSchools("{")).toThrow(/valid JSON/);
    expect(() => parseSchools("{}")).toThrow(/array/);
    expect(() => parseSchools(JSON.stringify([{ ...one, secret: "short" }]))).toThrow(/32/);
    expect(() => parseSchools(JSON.stringify([{ ...one, slug: "Bad Slug" }]))).toThrow(/slug/);
    expect(() => parseSchools(JSON.stringify([one, one]))).toThrow(/duplicated/);
  });
});

describe("presentation helpers", () => {
  it("labels subscription states", () => {
    expect(stateLabel(null)).toEqual({ text: "unknown", tone: "off" });
    expect(stateLabel({ state: "expired", academicYear: null, startsOn: null, endsOn: null, daysLeft: null }).tone).toBe("bad");
    expect(stateLabel({ state: "active", academicYear: "x", startsOn: "a", endsOn: "b", daysLeft: 40 })).toEqual({ text: "active", tone: "ok" });
    expect(stateLabel({ state: "active", academicYear: "x", startsOn: "a", endsOn: "b", daysLeft: 14 })).toEqual({ text: "ends in 14d", tone: "warn" });
    const grace = (daysLeft: number | null) =>
      stateLabel({ state: "grace", academicYear: "x", startsOn: "a", endsOn: "b", daysLeft, graceEndsOn: "c" });
    expect(grace(5)).toEqual({ text: "grace · 5d left", tone: "warn" });
    expect(grace(0)).toEqual({ text: "grace · last day", tone: "warn" });
    expect(grace(null)).toEqual({ text: "grace · ?d left", tone: "warn" });
  });
  it("finds the newest migration among schools", () => {
    expect(newestMigration(["0035_a.sql", null, "0036_b.sql"])).toBe("0036_b.sql");
    expect(newestMigration([null])).toBeNull();
  });
});
