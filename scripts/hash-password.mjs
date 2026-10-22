// Prints the env values for operator sign-in. Usage:
//   npm run hash-password -- 'your passphrase'
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
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
console.log(`OPERATOR_PASSWORD_HASH=scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`OPERATOR_TOTP_SECRET=${totp}   # optional: add to your authenticator app, then keep it here`);
