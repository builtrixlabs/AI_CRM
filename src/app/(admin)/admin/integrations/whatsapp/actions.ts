"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptJson, decryptJson } from "@/lib/comms/encryption";
import {
  gupshupTestPing,
  type GupshupCredentials,
} from "@/lib/comms/whatsapp/providers/gupshup";
import {
  cloudApiTestPing,
  type CloudApiCredentials,
} from "@/lib/comms/whatsapp/providers/cloud-api";

type SaveResult = { ok: true } | { ok: false; error: string };
type PingResult = { ok: boolean; message: string };

/**
 * D-432 — save (or upsert) the per-org WhatsApp endpoint configuration.
 *
 * If a V0 row already exists (from D-010 bootstrap), we UPDATE the new
 * D-432 columns. If not, we INSERT — picking the org's first workspace
 * as workspace_default_id. The legacy secret_sha256 stays unchanged on
 * existing rows and is set to a placeholder on new rows (the D-010
 * inbound webhook will refuse verification, which is correct until the
 * org configures inbound separately).
 */
export async function saveWhatsAppConfig(
  form: FormData,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };

  const provider = String(form.get("provider") ?? "");
  if (!["gupshup", "cloud_api"].includes(provider)) {
    return { ok: false, error: `provider_unsupported:${provider}` };
  }

  const admin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await admin
    .from("org_whatsapp_endpoints")
    .select("organization_id, encrypted_credentials, workspace_default_id")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };

  let credentials: GupshupCredentials | CloudApiCredentials;
  let from_phone_number_id: string | null = null;
  let from_display_number: string | null = null;

  if (provider === "gupshup") {
    const api_key = String(form.get("api_key") ?? "").trim();
    const app_name = String(form.get("app_name") ?? "").trim() || undefined;
    const display = String(form.get("from_display_number") ?? "").trim();
    if (!display) return { ok: false, error: "from_display_number_required" };
    if (api_key) {
      credentials = { api_key, app_name };
    } else if (existing?.encrypted_credentials) {
      try {
        const saved = decryptJson<GupshupCredentials>(
          existing.encrypted_credentials,
        );
        credentials = {
          api_key: saved.api_key,
          app_name: app_name ?? saved.app_name,
        };
      } catch {
        return { ok: false, error: "decryption_failed — re-paste api_key" };
      }
    } else {
      return { ok: false, error: "api_key_required" };
    }
    from_display_number = display;
  } else {
    const access_token = String(form.get("access_token") ?? "").trim();
    const phone_id = String(form.get("from_phone_number_id") ?? "").trim();
    if (!phone_id) return { ok: false, error: "from_phone_number_id_required" };
    if (access_token) {
      credentials = { access_token };
    } else if (existing?.encrypted_credentials) {
      try {
        const saved = decryptJson<CloudApiCredentials>(
          existing.encrypted_credentials,
        );
        credentials = { access_token: saved.access_token };
      } catch {
        return {
          ok: false,
          error: "decryption_failed — re-paste access_token",
        };
      }
    } else {
      return { ok: false, error: "access_token_required" };
    }
    from_phone_number_id = phone_id;
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
  if (existing) {
    const { error: writeErr } = await admin
      .from("org_whatsapp_endpoints")
      .update({
        provider,
        encrypted_credentials,
        from_phone_number_id,
        from_display_number,
        active: true,
        updated_by: user.user.id,
        updated_at: now,
      })
      .eq("organization_id", user.org_id);
    if (writeErr) return { ok: false, error: `db_error:${writeErr.message}` };
  } else {
    // No V0 row exists — pick the org's first workspace and bootstrap.
    const { data: ws } = await admin
      .from("workspaces")
      .select("id")
      .eq("organization_id", user.org_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!ws?.id) {
      return {
        ok: false,
        error:
          "no_workspace — provision at least one workspace before configuring WhatsApp",
      };
    }
    // Placeholder secret_sha256 until inbound webhook is configured separately.
    const placeholder = "00".repeat(32);
    const { error: writeErr } = await admin
      .from("org_whatsapp_endpoints")
      .insert({
        organization_id: user.org_id,
        workspace_default_id: ws.id,
        secret_sha256: placeholder,
        provider,
        encrypted_credentials,
        from_phone_number_id,
        from_display_number,
        active: true,
        created_by: user.user.id,
        updated_by: user.user.id,
      });
    if (writeErr) return { ok: false, error: `db_error:${writeErr.message}` };
  }

  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}

export async function testWhatsAppPing(): Promise<PingResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, message: "no_org" };

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_whatsapp_endpoints")
    .select(
      "encrypted_credentials, provider, from_phone_number_id, from_display_number",
    )
    .eq("organization_id", user.org_id)
    .maybeSingle();

  if (readErr) return { ok: false, message: `db_error:${readErr.message}` };
  if (!row?.encrypted_credentials || !row.provider) {
    return { ok: false, message: "no_credentials_saved" };
  }

  let ping: PingResult;
  if (row.provider === "gupshup") {
    let creds: GupshupCredentials;
    try {
      creds = decryptJson<GupshupCredentials>(row.encrypted_credentials);
    } catch {
      return { ok: false, message: "decryption_failed" };
    }
    ping = await gupshupTestPing(creds);
  } else if (row.provider === "cloud_api") {
    let creds: CloudApiCredentials;
    try {
      creds = decryptJson<CloudApiCredentials>(row.encrypted_credentials);
    } catch {
      return { ok: false, message: "decryption_failed" };
    }
    if (!row.from_phone_number_id) {
      return { ok: false, message: "missing from_phone_number_id" };
    }
    ping = await cloudApiTestPing(creds, row.from_phone_number_id);
  } else {
    return {
      ok: false,
      message: `provider_not_yet_supported:${row.provider}`,
    };
  }

  await admin
    .from("org_whatsapp_endpoints")
    .update({
      test_ping_at: new Date().toISOString(),
      test_ping_ok: ping.ok,
      test_ping_message: ping.message,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);

  revalidatePath("/admin/integrations/whatsapp");
  return ping;
}

export async function deactivateWhatsApp(): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("org_whatsapp_endpoints")
    .update({
      active: false,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}

export async function addApprovedTemplate(
  template_id: string,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const trimmed = template_id.trim();
  if (!trimmed) return { ok: false, error: "template_id_required" };

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_whatsapp_endpoints")
    .select("approved_template_ids")
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };
  if (!row) {
    return {
      ok: false,
      error: "save_credentials_first",
    };
  }
  const current: string[] = row.approved_template_ids ?? [];
  if (current.includes(trimmed)) {
    return { ok: true }; // idempotent
  }
  const next = [...current, trimmed];
  const { error } = await admin
    .from("org_whatsapp_endpoints")
    .update({
      approved_template_ids: next,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}

export async function removeApprovedTemplate(
  template_id: string,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user?.org_id) return { ok: false, error: "no_org" };
  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("org_whatsapp_endpoints")
    .select("approved_template_ids")
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (readErr) return { ok: false, error: `db_error:${readErr.message}` };
  if (!row) return { ok: true };
  const next = (row.approved_template_ids ?? []).filter(
    (t: string) => t !== template_id,
  );
  const { error } = await admin
    .from("org_whatsapp_endpoints")
    .update({
      approved_template_ids: next,
      updated_by: user.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.org_id);
  if (error) return { ok: false, error: `db_error:${error.message}` };
  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}
