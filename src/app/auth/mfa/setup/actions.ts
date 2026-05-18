"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { mfaVerifyBucket } from "@/lib/auth/rate-limit";
import {
  decryptSecret,
  verifyCode,
  type MfaSecretPayload,
} from "@/lib/auth/totp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SETUP_PATH = "/auth/mfa/setup";

function safeReturn(returnTo: string): string {
  return typeof returnTo === "string" && returnTo.startsWith("/")
    ? returnTo
    : "/admin";
}

function setupRedirect(returnTo: string, error?: string): string {
  const params = new URLSearchParams({ return: returnTo });
  if (error) params.set("error", error);
  return `${SETUP_PATH}?${params.toString()}`;
}

export async function confirmEnrollmentAction(
  formData: FormData,
  returnTo: string
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  if (user.profile.mfa_enrolled_at) {
    redirect("/auth/mfa");
  }

  const ret = safeReturn(returnTo);
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    user.user.id;
  if (!(await mfaVerifyBucket.consume(ip)).allowed) {
    redirect(setupRedirect(ret, "rate_limited"));
  }

  const code = String(formData.get("code") ?? "").trim();
  const admin = getSupabaseAdmin();
  const { data: prof } = await admin
    .from("profiles")
    .select("mfa_secret")
    .eq("id", user.user.id)
    .maybeSingle();

  if (!prof?.mfa_secret) {
    redirect(setupRedirect(ret));
  }

  let secret_b32: string;
  try {
    secret_b32 = decryptSecret(prof.mfa_secret as MfaSecretPayload);
  } catch {
    redirect(setupRedirect(ret, "invalid_state"));
  }

  if (!verifyCode(secret_b32, code)) {
    await admin.from("audit_log").insert({
      actor_id: user.user.id,
      actor_type: "user",
      actor_role: "self",
      organization_id: user.org_id,
      workspace_id: null,
      table_name: "profiles",
      record_id: user.user.id,
      action: "mfa.verify_failed",
      diff: { method: "totp", phase: "enroll" },
    });
    redirect(setupRedirect(ret, "invalid_code"));
  }

  const now = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ mfa_enrolled_at: now, mfa_verified_at: now })
    .eq("id", user.user.id);

  await admin.from("audit_log").insert({
    actor_id: user.user.id,
    actor_type: "user",
    actor_role: "self",
    organization_id: user.org_id,
    workspace_id: null,
    table_name: "profiles",
    record_id: user.user.id,
    action: "mfa.enrolled",
    diff: { method: "totp" },
  });

  redirect(ret);
}
