import { describe, expect, it } from "vitest";
import { signPlatformRequest } from "@/lib/sign";

// Same vector as the school app's tests/platform-auth.test.ts.
const secret = "s".repeat(32);
const VECTOR = { timestamp: 1760000000, method: "POST", pathAndQuery: "/api/platform/subscriptions?x=1", body: '{"a":1}' };

describe("signPlatformRequest", () => {
  it("matches the signature the school app expects", () => {
    expect(signPlatformRequest({ secret, ...VECTOR })).toBe(
      "34abd77f6bedbb06d6ccc7068f398fa5fbbc70e86628f90c4dc7d2eb2cc9f88f"
    );
  });
  it("changes with any input", () => {
    const base = signPlatformRequest({ secret, ...VECTOR });
    expect(signPlatformRequest({ secret, ...VECTOR, body: "{}" })).not.toBe(base);
    expect(signPlatformRequest({ secret: "t".repeat(32), ...VECTOR })).not.toBe(base);
  });
});
