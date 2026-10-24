# notes-platform

Central dashboard for every school running the notes app. See all schools'
subscription state, active users and schema version in one table, and
add/extend/remove a school's paid academic sessions.

It talks to each school only through that school's signed `/api/platform/*`
endpoints (see the school repo's README, "Central platform API"). It holds a
per-school secret, **never** a school's database keys.

## Configure

1. Generate operator sign-in values:
   `npm run hash-password -- 'a long passphrase'` prints
   `OPERATOR_PASSWORD_HASH`, `SESSION_SECRET` and `OPERATOR_TOTP_SECRET`.
   Add the TOTP secret to an authenticator app (manual entry, 6 digits, 30 s,
   SHA-1) and keep it in the env; sign-in then needs password + code. Leave
   `OPERATOR_TOTP_SECRET` unset to skip the code (not recommended).
2. On each school deployment set `PLATFORM_SECRET` (32+ random characters,
   different per school: `openssl rand -hex 32`).
3. Here, set `SCHOOLS_JSON` -- one entry per school, `secret` equal to that
   school's `PLATFORM_SECRET`:
   `[{"slug":"greenfield","name":"Greenfield Academy","baseUrl":"https://greenfield.example.com","secret":"..."}]`
4. `npm install --legacy-peer-deps && npm run build && npm start`
   (or deploy to Vercel with the same env vars).

The overview lists schools soonest-expiry first (unreachable ones on top), with the
session end, the last day of access (grace end when set) and days left, and counts
schools whose access ends within 30 days.

Each school must have applied migration `0036` for the subscription columns to
show; a school without it shows "0036 not applied?". Grace periods (a `grace`
state, grace days on the add-session form, the "access until" date) need
migration `0039` on the school. A school without it still works, but ignores
grace days; the dashboard tells you when that happens.

## What it does and doesn't protect

- Pages and server actions all re-check a signed, 8-hour, httpOnly,
  SameSite=Strict session cookie.
- `/login` has a flat 600 ms delay per attempt, **not** real rate limiting
  (serverless instances don't share memory). Put it behind your host's rate
  limiting, an IP allowlist or an access proxy (Cloudflare Access, Vercel
  deployment protection).
- One shared operator password, not per-person accounts.
- Operator actions are always written as JSON lines to stdout
  (`kind: "platform.audit"`). To also keep them durably, create a Supabase
  project in **your own** account (not a school's), run `supabase/audit_log.sql`
  in its SQL editor, and set `AUDIT_SUPABASE_URL` and
  `AUDIT_SUPABASE_SERVICE_KEY` here. The table is append-only (updates,
  deletes and truncates are rejected, even for the service key) and is shown
  on the dashboard's **Audit log** page. A failed write is logged and never
  blocks the action.
- "Remove" asks for no confirmation, and removing a school's last session
  turns its gating off.

## Develop

`npm test` (signing vector shared with the school app, TOTP RFC 6238 vectors,
session and registry parsing) and `npm run typecheck`.
