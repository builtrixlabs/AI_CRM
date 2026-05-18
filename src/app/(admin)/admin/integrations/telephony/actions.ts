"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptJson, decryptJson } from "@/lib/comms/encryption";
import {
  exotelTestPing,
  type ExotelCredentials,
} from "@/lib/comms/telephony/providers/exotel";

const SUPPORTED_PROVIDERS = ["exotel"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

type SaveResult = { ok: true } | { ok: false; error: string };
type PingResult = { ok: boolean; message: string };

/**
 * D-433 — save (or upsert) the per-org telephony provider configuration.
 *
 * Allows partial cred updates when an existing row is present: blank
 * inputs reuse the previously-saved value. This lets an org_admin update
 * virtual_number without re-pasting the API key.
 *
 * Writes via getSupabaseAdmin() because RLS denies authenticated INSERT/
 * UPDATE on org_telephony_config (service-role-only by design).
 */
export async function saveTelephonyConfig(
  form: FormData,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };

  const provider = String(form.get("provider") ?? "");
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, error: `provider_unsupported:${provider}` };
  }
  const account_sid = String(form.get("account_sid") ?? "").trim();
  const api_key = String(form.get("api_key") ?? "").trim();
  const api_token = String(form.get("api_token") ?? "").trim();
  const virtual_number = String(form.get("virtual_number") ?? "").trim();

  if (!virtual_number) return { ok: false, error: "virtual_number_required" };

  const admin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await admin
    .from("org_telephony_config")
    .select("encrypted_credentials")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };

  let credentials: ExotelCredentials;
  if (account_sid && api_key && api_token) {
    credentials = { account_sid, api_key, api_token };
  } else if (existing?.encrypted_credentials) {
    try {
      const saved = decryptJson<ExotelCredentials>(
        existing.encrypted_credentials,
      );
      credentials = {
        account_sid: account_sid || saved.account_sid,
        api_key: api_key || saved.api_key,
        api_token: api_token || saved.api_token,
      };
    } catch {
      return {
        ok: false,
        error: "decryption_failed — re-paste all three credential fields",
      };
    }
  } else {
    return { ok: false, error: "credentials_required" };
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
    virtual_number,
    is_active: true,
    created_by: user.user.id,
    updated_by: user.user.id,
    updated_at: now,
  };

  const { error: writeErr } = await admin
    .from("org_telephony_config")
    .upsert(row, { onConflict: "organization_id" });

  if (writeErr) return { ok: false, error: `db_error:${writeErr.message}` };

  revalidatePath("/admin/integrations/telephony");
  return { ok: true };
}

export async function testTelephonyPing(): Promise<PingResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, message: "no_org" };

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_telephony_config")
    .select("encrypted_credentials, provider")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, message: `db_error:${readErr.message}` };
  if (!row?.encrypted_credentials)
    return { ok: false, message: "no_credentials_saved" };
  if (row.provider !== "exotel") {
    return { ok: false, message: `provider_not_yet_supported:${row.provider}` };
  }

  let creds: ExotelCredentials;
  try {
    creds = decryptJson<ExotelCredentials>(row.encrypted_credentials);
  } catch {
    return { ok: false, message: "decryption_failed" };
  }

  const ping = await exotelTestPing(creds);

  await admin
    .from("org_telephony_config")
    .update({
      test_ping_at: new Date().toISOString(),
      test_ping_ok: ping.ok,
      test_ping_message: ping.message,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);

  revalidatePath("/admin/integrations/telephony");
  return ping;
}

export async function deactivateTelephony(): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("org_telephony_config")
    .update({
      is_active: false,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/telephony");
  return { ok: true };
}
