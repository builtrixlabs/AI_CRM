"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptJson, decryptJson } from "@/lib/comms/encryption";
import {
  msg91TestPing,
  type Msg91Credentials,
} from "@/lib/comms/sms/providers/msg91";

const SUPPORTED_PROVIDERS = ["msg91"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

type SaveResult = { ok: true } | { ok: false; error: string };
type PingResult = { ok: boolean; message: string };

const VALID_CATEGORIES = new Set([
  "promotional",
  "transactional",
  "service",
]);

export async function saveSmsConfig(form: FormData): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };

  const provider = String(form.get("provider") ?? "");
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, error: `provider_unsupported:${provider}` };
  }
  const authkey = String(form.get("authkey") ?? "").trim();
  const sender_id = String(form.get("sender_id") ?? "").trim();
  const dlt_entity_id = String(form.get("dlt_entity_id") ?? "").trim();

  if (!sender_id) return { ok: false, error: "sender_id_required" };
  if (!dlt_entity_id) return { ok: false, error: "dlt_entity_id_required" };

  const admin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await admin
    .from("org_sms_config")
    .select("encrypted_credentials")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };

  let credentials: Msg91Credentials;
  if (authkey) {
    credentials = { authkey };
  } else if (existing?.encrypted_credentials) {
    try {
      const saved = decryptJson<Msg91Credentials>(
        existing.encrypted_credentials,
      );
      credentials = { authkey: saved.authkey };
    } catch {
      return {
        ok: false,
        error: "decryption_failed — re-paste authkey",
      };
    }
  } else {
    return { ok: false, error: "authkey_required" };
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
    sender_id,
    dlt_entity_id,
    is_active: true,
    created_by: user.user.id,
    updated_by: user.user.id,
    updated_at: now,
  };

  const { error: writeErr } = await admin
    .from("org_sms_config")
    .upsert(row, { onConflict: "organization_id" });

  if (writeErr) return { ok: false, error: `db_error:${writeErr.message}` };

  revalidatePath("/admin/integrations/sms");
  return { ok: true };
}

export async function testSmsPing(): Promise<PingResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, message: "no_org" };

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_sms_config")
    .select("encrypted_credentials, provider")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, message: `db_error:${readErr.message}` };
  if (!row?.encrypted_credentials)
    return { ok: false, message: "no_credentials_saved" };
  if (row.provider !== "msg91") {
    return {
      ok: false,
      message: `provider_not_yet_supported:${row.provider}`,
    };
  }

  let creds: Msg91Credentials;
  try {
    creds = decryptJson<Msg91Credentials>(row.encrypted_credentials);
  } catch {
    return { ok: false, message: "decryption_failed" };
  }

  const ping = await msg91TestPing(creds);

  await admin
    .from("org_sms_config")
    .update({
      test_ping_at: new Date().toISOString(),
      test_ping_ok: ping.ok,
      test_ping_message: ping.message,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);

  revalidatePath("/admin/integrations/sms");
  return ping;
}

export async function deactivateSms(): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("org_sms_config")
    .update({
      is_active: false,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/sms");
  return { ok: true };
}

export async function addDltTemplate(
  form: FormData,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };

  const template_id = String(form.get("template_id") ?? "").trim();
  const content = String(form.get("content") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();

  if (!template_id) return { ok: false, error: "template_id_required" };
  if (!content) return { ok: false, error: "content_required" };
  if (!VALID_CATEGORIES.has(category)) {
    return { ok: false, error: `invalid_category:${category}` };
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("dlt_templates").upsert(
    {
      organization_id: user.org_id,
      template_id,
      content,
      category,
      registered_at: new Date().toISOString(),
      created_by: user.user.id,
    },
    { onConflict: "organization_id,template_id" },
  );
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/sms");
  return { ok: true };
}

export async function removeDltTemplate(
  template_id: string,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  if (!template_id) return { ok: false, error: "template_id_required" };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("dlt_templates")
    .delete()
    .eq("organization_id", user.org_id)
    .eq("template_id", template_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/sms");
  return { ok: true };
}
