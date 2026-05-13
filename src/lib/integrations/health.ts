/**
 * D-439 — unified per-org integrations health summary.
 *
 * Read-only aggregator across the per-channel config tables each
 * D-433/434/435/432 directive owns. Returns one `ChannelHealth` row per
 * known channel; channels whose owning directive hasn't shipped yet
 * report `unavailable` so the UI dims their tile but still surfaces them
 * for visibility.
 *
 * The function intentionally does NOT hit upstream providers (Exotel,
 * Resend, MSG91, etc.). It reads the saved `test_ping_*` fields each
 * channel maintains and reports the most recent status. Live re-probes
 * are an operator-initiated action that lives on each channel's admin
 * page, not here.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ChannelId =
  | "telephony"
  | "email"
  | "sms"
  | "whatsapp"
  | "voice_iq";

export type ChannelStatus =
  | "healthy"
  | "warning"
  | "not_configured"
  | "unavailable";

export type ChannelHealth = {
  channel: ChannelId;
  status: ChannelStatus;
  detail: string;
  last_check_at: string | null;
};

type TelephonyRedacted = {
  is_configured: boolean | null;
  is_active: boolean | null;
  test_ping_at: string | null;
  test_ping_ok: boolean | null;
  test_ping_message: string | null;
} | null;

type SecretRedacted = {
  rotated_at: string | null;
} | null;

/**
 * Build a health row from a telephony config (D-433). Encapsulates the
 * `(is_configured, is_active, test_ping_ok)` truth table:
 *   - row missing or not configured       → not_configured
 *   - is_active=false                     → not_configured (deactivated)
 *   - active + test_ping_ok=true          → healthy
 *   - active + test_ping_ok=false         → warning (failed last ping)
 *   - active + never test-pinged          → warning (advise running test)
 */
export function buildTelephonyHealth(row: TelephonyRedacted): ChannelHealth {
  if (!row || !row.is_configured) {
    return {
      channel: "telephony",
      status: "not_configured",
      detail: "No credentials saved",
      last_check_at: null,
    };
  }
  if (!row.is_active) {
    return {
      channel: "telephony",
      status: "not_configured",
      detail: "Deactivated by org admin",
      last_check_at: row.test_ping_at,
    };
  }
  if (!row.test_ping_at) {
    return {
      channel: "telephony",
      status: "warning",
      detail: "Active but never test-pinged — run Test ping",
      last_check_at: null,
    };
  }
  if (!row.test_ping_ok) {
    return {
      channel: "telephony",
      status: "warning",
      detail: row.test_ping_message ?? "Last test ping failed",
      last_check_at: row.test_ping_at,
    };
  }
  return {
    channel: "telephony",
    status: "healthy",
    detail: "Test ping ok",
    last_check_at: row.test_ping_at,
  };
}

/**
 * Build a health row for Voice IQ. The voice_iq integration stores only an
 * HMAC secret; presence = healthy. No "active" notion because the secret
 * is consumed inline by incoming webhooks (no scheduled jobs to fail).
 */
export function buildVoiceIqHealth(row: SecretRedacted): ChannelHealth {
  if (!row) {
    return {
      channel: "voice_iq",
      status: "not_configured",
      detail: "HMAC secret not set",
      last_check_at: null,
    };
  }
  return {
    channel: "voice_iq",
    status: "healthy",
    detail: "HMAC secret configured",
    last_check_at: row.rotated_at,
  };
}

const UNAVAILABLE_LABELS: Record<ChannelId, string> = {
  email: "D-434 ships Resend per-org config",
  sms: "D-435 ships MSG91 + DLT per-org config",
  whatsapp: "D-432 ships Gupshup + Cloud API per-org config",
  telephony: "",
  voice_iq: "",
};

function unavailable(channel: ChannelId): ChannelHealth {
  return {
    channel,
    status: "unavailable",
    detail: UNAVAILABLE_LABELS[channel] || "coming soon",
    last_check_at: null,
  };
}

export async function getIntegrationsHealth(
  orgId: string,
): Promise<ChannelHealth[]> {
  const supabase = await createSupabaseServerClient();

  // Telephony (D-433) — redacted view, RLS-scoped to caller's org.
  const { data: telephony } = await supabase
    .from("org_telephony_config_redacted")
    .select(
      "is_configured, is_active, test_ping_at, test_ping_ok, test_ping_message",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  // Voice IQ (D-132) — redacted secret view.
  const { data: voiceIq } = await supabase
    .from("org_integration_secrets_redacted")
    .select("rotated_at")
    .eq("organization_id", orgId)
    .eq("kind", "voice_iq_inbox_secret")
    .maybeSingle();

  return [
    buildTelephonyHealth(telephony as TelephonyRedacted),
    unavailable("email"),
    unavailable("sms"),
    unavailable("whatsapp"),
    buildVoiceIqHealth(voiceIq as SecretRedacted),
  ];
}
