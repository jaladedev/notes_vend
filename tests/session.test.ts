import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/lib/session";

const secret = "x".repeat(40);

describe("password hashing", () => {
  it("verifies the right password and rejects others", () => {
    const stored = hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });
  it("salts, so equal passwords hash differently", () => {
    expect(hashPassword("same password 1")).not.toBe(hashPassword("same password 1"));
  });
  it("rejects missing or malformed stored values", () => {
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "plaintext")).toBe(false);
    expect(verifyPassword("x", "scrypt$$")).toBe(false);
  });
});

describe("session tokens", () => {
  const now = 1_000_000;
  it("accepts a fresh token and rejects it after expiry", () => {
    const token = createSessionToken(secret, now);
    expect(verifySessionToken(secret, token, now + 10)).toBe(true);
    expect(verifySessionToken(secret, token, now + SESSION_TTL_SECONDS + 1)).toBe(false);
  });
  it("rejects a tampered payload, a wrong secret and junk", () => {
    const token = createSessionToken(secret, now);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: now + 10 ** 9 })).toString("base64url");
    expect(verifySessionToken(secret, `${forged}.${sig}`, now)).toBe(false);
    expect(verifySessionToken("y".repeat(40), token, now)).toBe(false);
    expect(verifySessionToken(secret, `${payload}.`, now)).toBe(false);
    expect(verifySessionToken(secret, undefined, now)).toBe(false);
    expect(verifySessionToken(undefined, token, now)).toBe(false);
    expect(verifySessionToken("short", token, now)).toBe(false);
  });
  it("refuses to mint a token with a weak secret", () => {
    expect(() => createSessionToken("short")).toThrow();
  });
});
