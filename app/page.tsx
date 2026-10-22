import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { getSchools, type School } from "@/lib/schools";
import { fetchStatus } from "@/lib/schoolClient";
import { newestMigration, stateLabel } from "@/lib/present";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireOperator();
  const { error } = await searchParams;

  let schools: School[];
  let configError: string | null = null;
  try {
    schools = getSchools();
  } catch (e) {
    schools = [];
    configError = e instanceof Error ? e.message : "SCHOOLS_JSON is invalid.";
  }

  // One slow or dead school must not block the rest: each call has its own timeout.
  const rows = await Promise.all(schools.map(async (school) => ({ school, result: await fetchStatus(school) })));
  const newest = newestMigration(rows.map((r) => (r.result.ok ? r.result.data.latestMigration : null)));

  const counts = { active: 0, attention: 0, unreachable: 0 };
  for (const { result } of rows) {
    if (!result.ok) counts.unreachable++;
    else {
      const tone = stateLabel(result.data.subscription).tone;
      if (tone === "ok" || tone === "off") counts.active++;
      else counts.attention++;
    }
  }

  return (
    <div className="wrap">
      <header className="bar">
        <div>
          <h1>Schools platform</h1>
          <span className="soft">
            {rows.length} school{rows.length === 1 ? "" : "s"} · {counts.attention} need attention · {counts.unreachable} unreachable
          </span>
        </div>
        <form action={logout}><button className="ghost" type="submit">Sign out</button></form>
      </header>

      {error && <div className="msg err" role="alert">{error}</div>}
      {configError && <div className="msg err" role="alert">{configError}</div>}
      {!configError && rows.length === 0 && (
        <div className="card">No schools yet. Add them to SCHOOLS_JSON (see README).</div>
      )}

      {rows.length > 0 && (
        <div className="card tablewrap">
          <table>
            <thead>
              <tr>
                <th>School</th><th>Subscription</th><th>Session</th><th>Ends</th><th>Active users</th><th>Schema</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ school, result }) => {
                if (!result.ok) {
                  return (
                    <tr key={school.slug}>
                      <td><Link href={`/schools/${school.slug}`}>{school.name}</Link></td>
                      <td colSpan={5}><span className="pill bad">unreachable</span> <span className="soft">{result.error}</span></td>
                    </tr>
                  );
                }
                const d = result.data;
                const label = stateLabel(d.subscription);
                const u = d.activeUsers;
                const behind = newest && d.latestMigration !== newest;
                return (
                  <tr key={school.slug}>
                    <td><Link href={`/schools/${school.slug}`}>{school.name}</Link></td>
                    <td>
                      <span className={`pill ${label.tone}`}>{label.text}</span>
                      {d.subscriptionError && <div className="soft">0036 not applied?</div>}
                    </td>
                    <td>{d.subscription?.academicYear ?? <span className="soft">—</span>}</td>
                    <td>{d.subscription?.endsOn ?? <span className="soft">—</span>}</td>
                    <td className="soft">{u.teacher ?? 0} teachers · {u.student ?? 0} students · {u.parent ?? 0} parents</td>
                    <td>
                      <span className={behind ? "warn" : "soft"}>{d.latestMigration ?? "—"}</span>
                      {behind && <div className="warn" style={{ fontSize: 12 }}>behind {newest}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
