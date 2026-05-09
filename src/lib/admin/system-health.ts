import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FailedDirective = {
  id: string;
  directive_id: string;
  ts: string;
  reason: string | null;
};

export type SystemHealth = {
  failed_directives: {
    count_7d: number;
    recent: FailedDirective[];
  };
  inbox_failures: {
    count_7d: number;
  };
  voice_iq_configured: boolean;
  whatsapp_configured: boolean;
  email_configured: boolean;
  /** Aggregate posture: "healthy" if all integrations configured AND no
   *  failures in 7d; "degraded" if some configured + some failures;
   *  "failing" if any integration unconfigured AND failures present. */
  posture: "healthy" | "degraded" | "failing";
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getSystemHealth(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<SystemHealth> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const failedRes = await client
    .from("directive_invocations")
    .select("id, directive_id, ts, details")
    .eq("organization_id", organization_id)
    .eq("outcome", "error")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(20);
  const failedRows =
    !failedRes.error && failedRes.data
      ? (failedRes.data as Array<{
          id: string;
          directive_id: string;
          ts: string;
          details: { reason?: string } | null;
        }>)
      : [];
  const recent = failedRows.slice(0, 5).map((r) => ({
    id: r.id,
    directive_id: r.directive_id,
    ts: r.ts,
    reason: r.details?.reason ?? null,
  }));

  const inboxRes = await client
    .from("event_inbox_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization_id)
    .eq("status", "error")
    .gte("ts", since);

  const viqRes = await client
    .from("org_integration_secrets")
    .select("organization_id")
    .eq("organization_id", organization_id)
    .eq("kind", "voice_iq_inbox_secret")
    .limit(1);
  const voice_iq_configured =
    !viqRes.error && viqRes.data ? viqRes.data.length > 0 : false;

  // WhatsApp: check org_whatsapp_endpoints if it exists. Tolerate absence.
  let whatsapp_configured = false;
  try {
    const waRes = await client
      .from("org_whatsapp_endpoints")
      .select("organization_id")
      .eq("organization_id", organization_id)
      .limit(1);
    whatsapp_configured =
      !waRes.error && waRes.data ? waRes.data.length > 0 : false;
  } catch {
    whatsapp_configured = false;
  }

  // Email: no integration table yet — V3.
  const email_configured = false;

  const failedTotal = failedRows.length + (inboxRes.count ?? 0);
  const allConfigured = voice_iq_configured && whatsapp_configured;
  let posture: SystemHealth["posture"] = "healthy";
  if (!allConfigured && failedTotal > 0) posture = "failing";
  else if (!allConfigured || failedTotal > 0) posture = "degraded";

  return {
    failed_directives: {
      count_7d: failedRows.length,
      recent,
    },
    inbox_failures: {
      count_7d: inboxRes.count ?? 0,
    },
    voice_iq_configured,
    whatsapp_configured,
    email_configured,
    posture,
  };
}
