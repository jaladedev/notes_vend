import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audit, auditSinkFromEnv, cleanDetail, listAudit } from "@/lib/audit";

describe("auditSinkFromEnv", () => {
  it("needs both values and an https url", () => {
    expect(auditSinkFromEnv({})).toBeNull();
    expect(auditSinkFromEnv({ AUDIT_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(auditSinkFromEnv({ AUDIT_SUPABASE_URL: "http://x.supabase.co", AUDIT_SUPABASE_SERVICE_KEY: "k" })).toBeNull();
    expect(auditSinkFromEnv({ AUDIT_SUPABASE_URL: "https://x.supabase.co/", AUDIT_SUPABASE_SERVICE_KEY: "k" }))
      .toEqual({ url: "https://x.supabase.co", key: "k" });
  });
});

describe("cleanDetail", () => {
  it("drops undefined and truncates long strings", () => {
    const out = cleanDetail({ a: undefined, b: "x".repeat(600), c: 1 });
    expect(out).not.toHaveProperty("a");
    expect((out.b as string).length).toBe(501);
    expect(out.c).toBe(1);
  });
});

describe("audit", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockReset();
    delete process.env.AUDIT_SUPABASE_URL;
    delete process.env.AUDIT_SUPABASE_SERVICE_KEY;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("only logs to stdout when no store is configured", async () => {
    await audit("login.ok");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledOnce();
  });

  it("also posts the row to the store when configured", async () => {
    process.env.AUDIT_SUPABASE_URL = "https://vendor.supabase.co";
    process.env.AUDIT_SUPABASE_SERVICE_KEY = "svc";
    fetchMock.mockResolvedValue({ ok: true });
    await audit("subscription.add", { school: "greenfield", note: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://vendor.supabase.co/rest/v1/platform_audit_log");
    expect(init.headers.authorization).toBe("Bearer svc");
    const body = JSON.parse(init.body);
    expect(body.action).toBe("subscription.add");
    expect(body.detail).toEqual({ school: "greenfield" });
  });

  it("never throws when the store fails", async () => {
    process.env.AUDIT_SUPABASE_URL = "https://vendor.supabase.co";
    process.env.AUDIT_SUPABASE_SERVICE_KEY = "svc";
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(audit("login.failed")).resolves.toBeUndefined();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(audit("login.failed")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("listAudit reports no store, store errors, and rows", async () => {
    expect(await listAudit()).toBeNull();
    process.env.AUDIT_SUPABASE_URL = "https://vendor.supabase.co";
    process.env.AUDIT_SUPABASE_SERVICE_KEY = "svc";
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    expect(await listAudit()).toEqual({ error: "Audit store answered HTTP 401." });
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 1, at: "2026-10-24T01:00:00Z", action: "login.ok", detail: {} }] });
    expect(await listAudit()).toEqual({ rows: [{ id: 1, at: "2026-10-24T01:00:00Z", action: "login.ok", detail: {} }] });
  });
});
