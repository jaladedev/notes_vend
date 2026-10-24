import { describe, expect, it } from "vitest";
import { DUMMY_HASH, authenticate, normalizeUsername, parseOperators, usesNamedOperators } from "@/lib/operators";
import { createSessionToken, hashPassword, readSessionOperator, verifySessionToken } from "@/lib/session";
import { base32Decode, totpCode } from "@/lib/totp";

const generateTotp = (b32: string) => totpCode(base32Decode(b32), Date.now());

const secret = "s".repeat(40);
const ada = hashPassword("ada passphrase 123");
const ben = hashPassword("ben passphrase 456");
const TOTP = "JBSWY3DPEHPK3PXP";
const env = {
  OPERATORS_JSON: JSON.stringify([
    { name: "Ada", passwordHash: ada, totpSecret: TOTP },
    { name: "ben", passwordHash: ben },
  ]),
};

describe("parseOperators", () => {
  it("is null when unset and lowercases names", () => {
    expect(parseOperators(undefined)).toBeNull();
    expect(parseOperators(env.OPERATORS_JSON)!.map((o) => o.name)).toEqual(["ada", "ben"]);
  });
  it("rejects malformed config with a readable error", () => {
    expect(() => parseOperators("nope")).toThrow(/valid JSON/);
    expect(() => parseOperators("[]")).toThrow(/non-empty/);
    expect(() => parseOperators(JSON.stringify([{ name: "A B", passwordHash: ada }]))).toThrow(/name/);
    expect(() => parseOperators(JSON.stringify([{ name: "a", passwordHash: "plain" }]))).toThrow(/hash-password/);
    expect(() => parseOperators(JSON.stringify([{ name: "a", passwordHash: ada }, { name: "A", passwordHash: ben }]))).toThrow(/duplicate/);
  });
  it("tells whether sign-in asks for a username", () => {
    expect(usesNamedOperators({})).toBe(false);
    expect(usesNamedOperators(env)).toBe(true);
  });
});

describe("authenticate (named operators)", () => {
  it("accepts the right password and code, case-insensitive username", () => {
    expect(authenticate({ username: "ADA", password: "ada passphrase 123", code: generateTotp(TOTP) }, env)).toBe("ada");
    expect(authenticate({ username: "ben", password: "ben passphrase 456", code: "" }, env)).toBe("ben");
  });
  it("rejects a wrong password, wrong or missing code, another person's password, unknown user", () => {
    expect(authenticate({ username: "ada", password: "nope", code: generateTotp(TOTP) }, env)).toBeNull();
    expect(authenticate({ username: "ada", password: "ada passphrase 123", code: "000000" }, env)).toBeNull();
    expect(authenticate({ username: "ada", password: "ada passphrase 123", code: "" }, env)).toBeNull();
    expect(authenticate({ username: "ben", password: "ada passphrase 123", code: "" }, env)).toBeNull();
    expect(authenticate({ username: "ghost", password: "ada passphrase 123", code: "" }, env)).toBeNull();
  });
  it("the dummy hash is well formed, so an unknown user costs the same CPU", () => {
    const [, salt, hash] = DUMMY_HASH.split("$");
    expect(Buffer.from(salt!, "base64").length).toBe(16);
    expect(Buffer.from(hash!, "base64").length).toBe(32);
  });
});

describe("authenticate (legacy single operator)", () => {
  it("still works with OPERATOR_PASSWORD_HASH and no usernames", () => {
    const legacy = { OPERATOR_PASSWORD_HASH: ada };
    expect(authenticate({ username: "", password: "ada passphrase 123", code: "" }, legacy)).toBe("operator");
    expect(authenticate({ username: "", password: "bad", code: "" }, legacy)).toBeNull();
  });
});

describe("normalizeUsername", () => {
  it("lowercases and flags anything unsafe as invalid", () => {
    expect(normalizeUsername("  Ada ")).toBe("ada");
    expect(normalizeUsername("a b; drop")).toBe("invalid");
    expect(normalizeUsername("")).toBe("invalid");
  });
});

describe("session carries the operator", () => {
  it("round-trips the name and stays valid for tokens without one", () => {
    expect(readSessionOperator(secret, createSessionToken(secret, undefined, "ada"))).toBe("ada");
    expect(readSessionOperator(secret, createSessionToken(secret))).toBe("operator");
    expect(verifySessionToken(secret, createSessionToken(secret, undefined, "ada"))).toBe(true);
    expect(readSessionOperator(secret, "junk")).toBeNull();
  });
  it("a name swapped into the payload breaks the signature", () => {
    const now = 1_000_000;
    const token = createSessionToken(secret, now, "ben");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: now + 999, op: "ada" })).toString("base64url");
    expect(readSessionOperator(secret, `${forged}.${sig}`, now)).toBeNull();
  });
});
