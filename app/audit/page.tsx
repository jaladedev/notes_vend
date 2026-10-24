import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { listAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireOperator();
  const result = await listAudit();

  return (
    <div className="wrap">
      <header className="bar">
        <div>
          <h1>Audit log</h1>
          <span className="soft"><Link href="/">← Schools</Link> · latest 200 operator actions</span>
        </div>
      </header>

      {result === null && (
        <div className="card">
          No audit store configured. Actions are only written to stdout. Set AUDIT_SUPABASE_URL and
          AUDIT_SUPABASE_SERVICE_KEY (see README) to keep them here.
        </div>
      )}
      {result && "error" in result && <div className="msg err" role="alert">{result.error}</div>}
      {result && "rows" in result && (
        <div className="card tablewrap">
          <table>
            <thead><tr><th>When (UTC)</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {result.rows.length === 0 && (
                <tr><td colSpan={3} className="soft">Nothing recorded yet.</td></tr>
              )}
              {result.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.at.replace("T", " ").slice(0, 19)}</td>
                  <td>{r.action}</td>
                  <td className="soft">{JSON.stringify(r.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
