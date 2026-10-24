"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { endSession, requireOperator, startSession } from "@/lib/auth";
import { authenticate, normalizeUsername, usesNamedOperators, LEGACY_OPERATOR } from "@/lib/operators";
import { clientIp, currentCounts, isLimited, recordFailureInMemory, WINDOW_MINUTES } from "@/lib/loginLimit";
import { getSchool } from "@/lib/schools";
import { addSubscription, removeSubscription } from "@/lib/schoolClient";
import { audit } from "@/lib/audit";

function back(path: string, kind: "error" | "ok", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const named = usesNamedOperators();
  const username = named ? normalizeUsername(String(formData.get("username") ?? "")) : LEGACY_OPERATOR;
  const ip = clientIp(await headers());

  // Too many recent failures from this address (or for this username from
  // it): refuse before even checking the password. Counts are shared through
  // the audit store; see lib/loginLimit.ts.
  if (isLimited(await currentCounts(username, ip))) {
    await audit("login.locked", { operator: username, ip });
    back("/login", "error", `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes.`);
  }

  // Small flat delay on every attempt, on top of the limit above.
  await new Promise((r) => setTimeout(r, 600));

  const operator = authenticate({ username, password, code });
  if (!operator) {
    recordFailureInMemory(username, ip);
    await audit("login.failed", { operator: username, ip });
    back("/login", "error", "Incorrect username, password or code.");
  }
  await startSession(operator);
  await audit("login.ok", { operator, ip });
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function addSubscriptionAction(formData: FormData) {
  const operator = await requireOperator();
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
  await audit("subscription.add", { operator, school: slug, ...input, ok: result.ok, error: result.ok ? undefined : result.error });
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
  const operator = await requireOperator();
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const school = getSchool(slug);
  if (!school) back("/", "error", "Unknown school.");
  const path = `/schools/${slug}`;

  const result = await removeSubscription(school, id);
  await audit("subscription.remove", { operator, school: slug, id, ok: result.ok, error: result.ok ? undefined : result.error });
  revalidatePath("/");
  revalidatePath(path);
  if (!result.ok) back(path, "error", result.error);
  back(path, "ok", "Removed.");
}
