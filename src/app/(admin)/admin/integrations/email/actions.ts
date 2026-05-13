"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptJson, decryptJson } from "@/lib/comms/encryption";
import {
  resendTestPing,
  type ResendCredentials,
} from "@/lib/comms/email/providers/resend";

const SUPPORTED_PROVIDERS = ["resend"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

type SaveResult = { ok: true } | { ok: false; error: string };
type PingResult = { ok: boolean; message: string };

/**
 * D-434 — save (or upsert) the per-org email provider configuration.
 *
 * Partial cred updates allowed when a row already exists: blank api_key
 * reuses the saved value. Lets an org_admin update from_email/from_name
 * without re-pasting the API key.
 */
export async function saveEmailConfig(form: FormData): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };

  const provider = String(form.get("provider") ?? "");
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, error: `provider_unsupported:${provider}` };
  }
  const api_key = String(form.get("api_key") ?? "").trim();
  const from_email = String(form.get("from_email") ?? "").trim();
  const from_name = String(form.get("from_name") ?? "").trim() || null;

  if (!from_email) return { ok: false, error: "from_email_required" };

  const admin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await admin
    .from("org_email_config")
    .select("encrypted_credentials")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };

  let credentials: ResendCredentials;
  if (api_key) {
    credentials = { api_key };
  } else if (existing?.encrypted_credentials) {
    try {
      const saved = decryptJson<ResendCredentials>(
        existing.encrypted_credentials,
      );
      credentials = { api_key: saved.api_key };
    } catch {
      return {
        ok: false,
        error: "decryption_failed — re-paste api_key",
      };
    }
  } else {
    return { ok: false, error: "api_key_required" };
  }

  let encrypted_credentials;
  try {
    encrypted_credentials = encryptJson(credentials);
  } catch (e) {
    return {
      ok: false,
      error: `encryption_failed:${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const now = new Date().toISOString();
  const row = {
    organization_id: user.org_id,
    provider: provider as SupportedProvider,
    encrypted_credentials,
    from_email,
    from_name,
    is_active: true,
    created_by: user.user.id,
    updated_by: user.user.id,
    updated_at: now,
  };

  const { error: writeErr } = await admin
    .from("org_email_config")
    .upsert(row, { onConflict: "organization_id" });

  if (writeErr) return { ok: false, error: `db_error:${writeErr.message}` };

  revalidatePath("/admin/integrations/email");
  return { ok: true };
}

export async function testEmailPing(): Promise<PingResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, message: "no_org" };

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_email_config")
    .select("encrypted_credentials, provider")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, message: `db_error:${readErr.message}` };
  if (!row?.encrypted_credentials)
    return { ok: false, message: "no_credentials_saved" };
  if (row.provider !== "resend") {
    return {
      ok: false,
      message: `provider_not_yet_supported:${row.provider}`,
    };
  }

  let creds: ResendCredentials;
  try {
    creds = decryptJson<ResendCredentials>(row.encrypted_credentials);
  } catch {
    return { ok: false, message: "decryption_failed" };
  }

  const ping = await resendTestPing(creds);

  await admin
    .from("org_email_config")
    .update({
      test_ping_at: new Date().toISOString(),
      test_ping_ok: ping.ok,
      test_ping_message: ping.message,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);

  revalidatePath("/admin/integrations/email");
  return ping;
}

export async function deactivateEmail(): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("org_email_config")
    .update({
      is_active: false,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/email");
  return { ok: true };
}
