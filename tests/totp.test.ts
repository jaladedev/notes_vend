import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpCode, verifyTotp } from "@/lib/totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890".
const rfcSecret = Buffer.from("12345678901234567890");

describe("totpCode", () => {
  it("matches the RFC 6238 vectors (6-digit truncation)", () => {
    expect(totpCode(rfcSecret, 59 * 1000)).toBe("287082");
    expect(totpCode(rfcSecret, 1111111109 * 1000)).toBe("081804");
    expect(totpCode(rfcSecret, 1234567890 * 1000)).toBe("005924");
    expect(totpCode(rfcSecret, 2000000000 * 1000)).toBe("279037");
  });
});

describe("base32", () => {
  it("round-trips", () => {
    const b = Buffer.from("12345678901234567890");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(base32Encode(b)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("ignores spaces and case, rejects junk", () => {
    expect(base32Decode("gezd gnbv").equals(base32Decode("GEZDGNBV"))).toBe(true);
    expect(() => base32Decode("0189")).toThrow();
  });
});

describe("verifyTotp", () => {
  const secret = base32Encode(rfcSecret);
  const t = 1111111109 * 1000;
  it("accepts the current code and one step of drift", () => {
    expect(verifyTotp(secret, "081804", t)).toBe(true);
    expect(verifyTotp(secret, "081804", t + 30_000)).toBe(true);
    expect(verifyTotp(secret, "081804", t - 30_000)).toBe(true);
  });
  it("rejects an old code, a wrong code and malformed input", () => {
    expect(verifyTotp(secret, "081804", t + 90_000)).toBe(false);
    expect(verifyTotp(secret, "000000", t)).toBe(false);
    expect(verifyTotp(secret, "08180", t)).toBe(false);
    expect(verifyTotp(secret, "abcdef", t)).toBe(false);
  });
});
