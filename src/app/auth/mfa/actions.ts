"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  decryptSecret,
  verifyCode,
  type MfaSecretPayload,
} from "@/lib/auth/totp";
import {
  markCodeUsed,
  RECOVERY_CODE_PATTERN,
} from "@/lib/auth/recovery-codes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MFA_PATH = "/auth/mfa";

function safeReturn(returnTo: string): string {
  return typeof returnTo === "string" && returnTo.startsWith("/")
    ? returnTo
    : "/admin";
}

function mfaRedirect(returnTo: string, error?: string): string {
  const params = new URLSearchParams({ return: returnTo });
  if (error) params.set("error", error);
  return `${MFA_PATH}?${params.toString()}`;
}

async function callerIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

async function bumpVerifiedAt(
  user_id: string,
  org_id: string | null,
  method: "totp" | "recovery_code",
  details: Record<string, unknown> = {}
): Promise<string> {
  const admin = getSupabaseAdmin();
  const verified_at = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ mfa_verified_at: verified_at })
    .eq("id", user_id);
  await admin.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "self",
    organization_id: org_id,
    workspace_id: null,
    table_name: "profiles",
    record_id: user_id,
    action: "mfa.verified",
    diff: { method, ...details },
  });
  return verified_at;
}

async function logVerifyFailed(
  user_id: string,
  org_id: string | null,
  method: "totp" | "recovery_code"
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "self",
    organization_id: org_id,
    workspace_id: null,
    table_name: "profiles",
    record_id: user_id,
    action: "mfa.verify_failed",
    diff: { method, phase: "verify" },
  });
}

export async function verifyTotpAction(
  formData: FormData,
  returnTo: string
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.profile.mfa_enrolled_at) {
    redirect(`/auth/mfa/setup?return=${encodeURIComponent(safeReturn(returnTo))}`);
  }

  const code = String(formData.get("code") ?? "").trim();
  const ret = safeReturn(returnTo);

  const admin = getSupabaseAdmin();
  const { data: prof } = await admin
    .from("profiles")
    .select("mfa_secret")
    .eq("id", user.user.id)
    .maybeSingle();

  if (!prof?.mfa_secret) {
    redirect(mfaRedirect(ret, "invalid_state"));
  }

  let secret_b32: string;
  try {
    secret_b32 = decryptSecret(prof.mfa_secret as MfaSecretPayload);
  } catch {
    redirect(mfaRedirect(ret, "invalid_state"));
  }

  if (!verifyCode(secret_b32, code)) {
    await logVerifyFailed(user.user.id, user.org_id, "totp");
    redirect(mfaRedirect(ret, "invalid_code"));
  }

  await bumpVerifiedAt(user.user.id, user.org_id, "totp");
  redirect(ret);
}

export async function verifyRecoveryAction(
  formData: FormData,
  returnTo: string
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.profile.mfa_enrolled_at) {
    redirect(`/auth/mfa/setup?return=${encodeURIComponent(safeReturn(returnTo))}`);
  }

  const code = String(formData.get("recovery_code") ?? "")
    .trim()
    .toUpperCase();
  const ret = safeReturn(returnTo);

  if (!RECOVERY_CODE_PATTERN.test(code)) {
    redirect(mfaRedirect(ret, "invalid_recovery"));
  }

  const ip = await callerIp();
  const result = await markCodeUsed(user.user.id, code, ip);
  if (!result.ok) {
    await logVerifyFailed(user.user.id, user.org_id, "recovery_code");
    redirect(
      mfaRedirect(
        ret,
        result.reason === "already_used" ? "recovery_used" : "invalid_recovery"
      )
    );
  }

  await bumpVerifiedAt(user.user.id, user.org_id, "recovery_code", {
    code_index: result.index,
  });
  redirect(ret);
}
