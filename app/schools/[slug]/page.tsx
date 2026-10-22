import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { getSchool } from "@/lib/schools";
import { fetchStatus, listSubscriptions } from "@/lib/schoolClient";
import { stateLabel } from "@/lib/present";
import { addSubscriptionAction, removeSubscriptionAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireOperator();
  const { slug } = await params;
  const { error, ok } = await searchParams;
  const school = getSchool(slug);
  if (!school) notFound();

  const [status, subs] = await Promise.all([fetchStatus(school), listSubscriptions(school)]);
  const label = status.ok ? stateLabel(status.data.subscription) : null;

  return (
    <div className="wrap">
      <header className="bar">
        <div>
          <h1>{school.name}</h1>
          <span className="soft">{school.baseUrl}</span>
        </div>
        <Link href="/">← All schools</Link>
      </header>

      {error && <div className="msg err" role="alert">{error}</div>}
      {ok && <div className="msg good" role="status">{ok}</div>}

      <div className="card">
        {status.ok ? (
          <p style={{ margin: 0 }}>
            <span className={`pill ${label!.tone}`}>{label!.text}</span>{" "}
            <span className="soft">
              {status.data.subscription?.academicYear ? `${status.data.subscription.academicYear} · ends ${status.data.subscription.endsOn}` : "no session recorded"}
              {" · schema "}{status.data.latestMigration ?? "unknown"}
            </span>
          </p>
        ) : (
          <p style={{ margin: 0 }}><span className="pill bad">unreachable</span> <span className="soft">{status.error}</span></p>
        )}
      </div>

      <h2>Add or extend a session</h2>
      <div className="card">
        <form className="row" action={addSubscriptionAction}>
          <input type="hidden" name="slug" value={school.slug} />
          <label>Academic year<input name="academicYear" placeholder="2026/2027" required maxLength={40} /></label>
          <label>Starts<input name="startsOn" type="date" required /></label>
          <label>Ends<input name="endsOn" type="date" required /></label>
          <label>Note (optional)<input name="note" placeholder="Paid, ref 4471" maxLength={500} /></label>
          <button type="submit">Record</button>
        </form>
        <p className="soft" style={{ marginBottom: 0 }}>
          The first session recorded turns gating on for this school. To extend, add a session covering the new dates.
        </p>
      </div>

      <h2>Recorded sessions</h2>
      <div className="card tablewrap">
        {!subs.ok ? (
          <span className="soft">{subs.error}</span>
        ) : subs.data.subscriptions.length === 0 ? (
          <span className="soft">None yet. Gating is off for this school.</span>
        ) : (
          <table style={{ minWidth: 560 }}>
            <thead><tr><th>Session</th><th>Starts</th><th>Ends</th><th>Note</th><th /></tr></thead>
            <tbody>
              {subs.data.subscriptions.map((s) => (
                <tr key={s.id}>
                  <td>{s.academic_year}</td>
                  <td>{s.starts_on}</td>
                  <td>{s.ends_on}</td>
                  <td className="soft">{s.note ?? ""}</td>
                  <td>
                    <form action={removeSubscriptionAction}>
                      <input type="hidden" name="slug" value={school.slug} />
                      <input type="hidden" name="id" value={s.id} />
                      <button className="danger" type="submit">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {subs.ok && subs.data.subscriptions.length === 1 && (
          <p className="soft" style={{ marginBottom: 0 }}>Removing the last session turns gating off for this school.</p>
        )}
      </div>
    </div>
  );
}
