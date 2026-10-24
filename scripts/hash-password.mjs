// Prints the env values for operator sign-in. Usage:
//   npm run hash-password -- 'your passphrase'            single shared operator (legacy)
//   npm run hash-password -- 'your passphrase' --user ada  one entry for OPERATORS_JSON
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
const userFlag = process.argv.indexOf("--user");
const user = userFlag > -1 ? (process.argv[userFlag + 1] ?? "").trim().toLowerCase() : null;
if (!password || password.length < 12) {
  console.error("Give a passphrase of at least 12 characters: npm run hash-password -- 'your passphrase'");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let bits = 0, value = 0, totp = "";
for (const b of randomBytes(20)) {
  value = (value << 8) | b; bits += 8;
  while (bits >= 5) { totp += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
}
const passwordHash = `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
if (user !== null) {
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(user)) {
    console.error("--user must be 1-32 chars of a-z, 0-9, dot, dash or underscore.");
    process.exit(1);
  }
  console.log("# Add this object to the OPERATORS_JSON array (one entry per person):");
  console.log(JSON.stringify({ name: user, passwordHash, totpSecret: totp }));
  console.log(`# Add the totpSecret to ${user}'s authenticator app (manual entry, 6 digits, 30 s, SHA-1).`);
  console.log("# Also set SESSION_SECRET once (any 32+ chars): " + randomBytes(32).toString("hex"));
  process.exit(0);
}
console.log(`OPERATOR_PASSWORD_HASH=scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`OPERATOR_TOTP_SECRET=${totp}   # optional: add to your authenticator app, then keep it here`);
