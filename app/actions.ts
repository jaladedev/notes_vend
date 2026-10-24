"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, requireOperator, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";
import { getSchool } from "@/lib/schools";
import { addSubscription, removeSubscription } from "@/lib/schoolClient";
import { audit } from "@/lib/audit";

function back(path: string, kind: "error" | "ok", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const totpSecret = process.env.OPERATOR_TOTP_SECRET;

  // A flat delay on every attempt. In-memory counters don't survive
  // serverless instances, so put real rate limiting at the edge (see README).
  await new Promise((r) => setTimeout(r, 600));

  const passwordOk = verifyPassword(password, process.env.OPERATOR_PASSWORD_HASH);
  const totpOk = totpSecret ? verifyTotp(totpSecret, code) : true;
  if (!passwordOk || !totpOk) {
    await audit("login.failed");
    back("/login", "error", "Incorrect password or code.");
  }
  await startSession();
  await audit("login.ok");
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function addSubscriptionAction(formData: FormData) {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");
  const school = getSchool(slug);
  if (!school) back("/", "error", "Unknown school.");
  const path = `/schools/${slug}`;

  // Blank = let the school's default apply (7 days).
  const graceRaw = String(formData.get("graceDays") ?? "").trim();
  const graceDays = graceRaw === "" ? undefined : Number(graceRaw);
  if (graceDays !== undefined && (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 60)) {
    back(path, "error", "Grace days must be a whole number from 0 to 60.");
  }

  const input = {
    academicYear: String(formData.get("academicYear") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    note: String(formData.get("note") ?? "") || undefined,
    ...(graceDays === undefined ? {} : { graceDays }),
  };
  const result = await addSubscription(school, input);
  await audit("subscription.add", { school: slug, ...input, ok: result.ok, error: result.ok ? undefined : result.error });
  revalidatePath("/");
  revalidatePath(path);
  if (!result.ok) back(path, "error", result.error);
  // A school without migration 0039 ignores graceDays and returns no grace_days.
  if (graceDays !== undefined && result.data.subscription.grace_days === undefined) {
    back(path, "error", `Recorded ${input.academicYear}, but this school has not applied migration 0039, so the grace days were not saved.`);
  }
  back(path, "ok", `Recorded ${input.academicYear}.`);
}

export async function removeSubscriptionAction(formData: FormData) {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const school = getSchool(slug);
  if (!school) back("/", "error", "Unknown school.");
  const path = `/schools/${slug}`;

  const result = await removeSubscription(school, id);
  await audit("subscription.remove", { school: slug, id, ok: result.ok, error: result.ok ? undefined : result.error });
  revalidatePath("/");
  revalidatePath(path);
  if (!result.ok) back(path, "error", result.error);
  back(path, "ok", "Removed.");
}
