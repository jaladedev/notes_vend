// One JSON line per operator action, to stdout (your host's log drain / Vercel
// logs). It is NOT a tamper-proof store: for a durable audit trail, ship these
// lines somewhere append-only.
export function audit(action: string, detail: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind: "platform.audit", action, ...detail }));
}
