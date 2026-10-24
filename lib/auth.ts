import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, readSessionOperator } from "@/lib/session";

export async function currentOperator(): Promise<string | null> {
  const jar = await cookies();
  return readSessionOperator(process.env.SESSION_SECRET, jar.get(SESSION_COOKIE)?.value);
}

export async function isOperator(): Promise<boolean> {
  return (await currentOperator()) !== null;
}

/** Call at the top of every page and server action. Returns the operator's name. */
export async function requireOperator(): Promise<string> {
  const name = await currentOperator();
  if (!name) redirect("/login");
  return name;
}

export async function startSession(operator: string): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(secret, undefined, operator), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
