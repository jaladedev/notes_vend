// Copy of the school app's lib/platformAuth.ts signing half. Both sides share
// one fixed test vector (tests/sign.test.ts here, tests/platform-auth.test.ts
// there) so they cannot drift apart silently.
import { createHmac } from "node:crypto";

export function signPlatformRequest(input: {
  secret: string;
  timestamp: number;
  method: string;
  pathAndQuery: string;
  body: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.method.toUpperCase()}.${input.pathAndQuery}.${input.body}`)
    .digest("hex");
}
