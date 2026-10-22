import { redirect } from "next/navigation";
import { isOperator } from "@/lib/auth";
import { login } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isOperator()) redirect("/");
  const { error } = await searchParams;
  const needsCode = Boolean(process.env.OPERATOR_TOTP_SECRET);

  return (
    <main className="login">
      <div className="card">
        <h1>Schools platform</h1>
        <p className="soft">Operator sign-in</p>
        {error && <div className="msg err" role="alert">{error}</div>}
        <form action={login}>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required autoFocus />
          </label>
          {needsCode && (
            <label>
              Authenticator code
              <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required />
            </label>
          )}
          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  );
}
