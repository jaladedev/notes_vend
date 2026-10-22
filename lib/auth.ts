import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from "@/lib/session";

export async function isOperator(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(process.env.SESSION_SECRET, jar.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every page and server action. */
export async function requireOperator(): Promise<void> {
  if (!(await isOperator())) redirect("/login");
}

export async function startSession(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(secret), {
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
