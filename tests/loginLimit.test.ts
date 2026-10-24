import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PER_IP, MAX_PER_USER_IP, WINDOW_MINUTES, clientIp, countsFromMemory, currentCounts, isLimited,
  recordFailureInMemory, resetMemoryForTests,
} from "@/lib/loginLimit";

const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null });

describe("clientIp", () => {
  it("takes the first forwarded hop and rejects junk", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "x-forwarded-for": "evil; drop table" }))).toBe("unknown");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("isLimited", () => {
  it("trips on either threshold", () => {
    expect(isLimited({ userIp: MAX_PER_USER_IP - 1, ip: 0 })).toBe(false);
    expect(isLimited({ userIp: MAX_PER_USER_IP, ip: 0 })).toBe(true);
    expect(isLimited({ userIp: 0, ip: MAX_PER_IP })).toBe(true);
  });
});

describe("in-memory counter", () => {
  beforeEach(() => { resetMemoryForTests(); delete process.env.AUDIT_SUPABASE_URL; delete process.env.AUDIT_SUPABASE_SERVICE_KEY; });

  it("counts per username+ip and per ip, and forgets after the window", () => {
    const t0 = 1_000_000_000;
    for (let i = 0; i < 3; i++) recordFailureInMemory("ada", "1.1.1.1", t0);
    recordFailureInMemory("ben", "1.1.1.1", t0);
    expect(countsFromMemory("ada", "1.1.1.1", t0)).toEqual({ userIp: 3, ip: 4 });
    expect(countsFromMemory("ada", "2.2.2.2", t0)).toEqual({ userIp: 0, ip: 0 });
    expect(countsFromMemory("ada", "1.1.1.1", t0 + WINDOW_MINUTES * 60_000 + 1)).toEqual({ userIp: 0, ip: 0 });
  });

  it("another address cannot lock an operator out", () => {
    for (let i = 0; i < 10; i++) recordFailureInMemory("ada", "9.9.9.9");
    expect(isLimited(countsFromMemory("ada", "1.1.1.1"))).toBe(false);
  });
});

describe("shared store counts", () => {
  beforeEach(() => {
    resetMemoryForTests();
    process.env.AUDIT_SUPABASE_URL = "https://vendor.supabase.co";
    process.env.AUDIT_SUPABASE_SERVICE_KEY = "svc";
  });

  it("reads counts from content-range and filters by ip and operator", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "0-4/5" } })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "0-8/9" } });
    vi.stubGlobal("fetch", fetchMock);
    expect(await currentCounts("ada", "1.1.1.1")).toEqual({ userIp: 5, ip: 9 });
    const urls = fetchMock.mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls[0]).toContain("detail->>ip=eq.1.1.1.1");
    expect(urls[0]).toContain("detail->>operator=eq.ada");
    expect(urls[1]).not.toContain("operator");
    expect(fetchMock.mock.calls[0]![1].method).toBe("HEAD");
    vi.unstubAllGlobals();
  });

  it("falls back to memory when the store fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    recordFailureInMemory("ada", "1.1.1.1");
    expect(await currentCounts("ada", "1.1.1.1")).toEqual({ userIp: 1, ip: 1 });
    vi.unstubAllGlobals();
  });
});
