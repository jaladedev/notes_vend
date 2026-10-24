// Named operators. Configured in OPERATORS_JSON:
//   [{"name":"ada","passwordHash":"scrypt$...","totpSecret":"BASE32..."}]
// Each person has their own password (and ideally their own authenticator
// secret); removing an entry and redeploying revokes that person. When
// OPERATORS_JSON is unset the dashboard falls back to the single shared
// OPERATOR_PASSWORD_HASH / OPERATOR_TOTP_SECRET pair (operator name "operator").
import { verifyPassword } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";

export type Operator = { name: string; passwordHash: string; totpSecret?: string };

export const LEGACY_OPERATOR = "operator";
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

/** Throws a readable error for a malformed OPERATORS_JSON; returns null when it is unset. */
export function parseOperators(raw: string | undefined): Operator[] | null {
  if (!raw || !raw.trim()) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("OPERATORS_JSON is not valid JSON.");
  }
  if (!Array.isArray(data) || data.length === 0) throw new Error("OPERATORS_JSON must be a non-empty array.");
  const seen = new Set<string>();
  return data.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    const name = typeof e?.name === "string" ? e.name.trim().toLowerCase() : "";
    if (!NAME_RE.test(name)) {
      throw new Error(`OPERATORS_JSON[${i}]: name must be 1-32 chars of a-z, 0-9, dot, dash or underscore.`);
    }
    if (seen.has(name)) throw new Error(`OPERATORS_JSON: duplicate operator "${name}".`);
    seen.add(name);
    if (typeof e.passwordHash !== "string" || !e.passwordHash.startsWith("scrypt$")) {
      throw new Error(`OPERATORS_JSON[${i}] (${name}): passwordHash must come from npm run hash-password.`);
    }
    const totpSecret = typeof e.totpSecret === "string" && e.totpSecret ? e.totpSecret : undefined;
    return { name, passwordHash: e.passwordHash, ...(totpSecret ? { totpSecret } : {}) };
  });
}

/** True when sign-in asks for a username. */
export function usesNamedOperators(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.OPERATORS_JSON && env.OPERATORS_JSON.trim());
}

/** Username shape safe to store and filter on; anything else becomes "invalid". */
export function normalizeUsername(raw: string): string {
  const name = raw.trim().toLowerCase();
  return NAME_RE.test(name) ? name : "invalid";
}

// A real hash to burn the same CPU on when the username doesn't exist, so
// response time doesn't reveal which names are valid.
export const DUMMY_HASH =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** Returns the operator's name on success, null on any failure. */
export function authenticate(
  input: { username: string; password: string; code: string },
  env: Record<string, string | undefined> = process.env
): string | null {
  const operators = parseOperators(env.OPERATORS_JSON);
  if (!operators) {
    const passwordOk = verifyPassword(input.password, env.OPERATOR_PASSWORD_HASH);
    const totp = env.OPERATOR_TOTP_SECRET;
    const totpOk = totp ? verifyTotp(totp, input.code) : true;
    return passwordOk && totpOk ? LEGACY_OPERATOR : null;
  }
  const name = normalizeUsername(input.username);
  const op = operators.find((o) => o.name === name);
  const passwordOk = verifyPassword(input.password, op?.passwordHash ?? DUMMY_HASH);
  const totpOk = op?.totpSecret ? verifyTotp(op.totpSecret, input.code) : true;
  return op && passwordOk && totpOk ? op.name : null;
}
