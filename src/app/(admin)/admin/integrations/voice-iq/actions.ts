"use server";

import { createHmac, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { effectivePermissions, BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  canRotate,
  getVoiceIqSecret,
  rotateVoiceIqSecret,
} from "@/lib/integrations/voice-iq/secret";

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: "permission" | "validation" | "rate_limit" | "internal"; message?: string };

async function ensureCallerCan(
  permission: "integrations:voice_iq:manage"
): Promise<
  | { ok: true; user_id: string; org_id: string }
  | { ok: false; error: "permission" }
> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return { ok: false, error: "permission" };

  const perms = effectivePermissions({
    base_role: user.profile.base_role,
    bridge_app_roles: user.app_roles
      .filter((a) => a.app_role !== undefined)
      .map((a) => a.app_role),
    org_allow_overrides: [],
    org_deny_overrides: [],
  });
  // `effectivePermissions` returns base+bridge perms; since this permission
  // sits on org_owner/org_admin/super_admin via the static catalog above,
  // checking the base role's permission set is enough for v2 demo lens.
  const baseHas = BASE_ROLE_PERMS[user.profile.base_role].has(permission);
  if (!perms.has(permission) && !baseHas) {
    return { ok: false, error: "permission" };
  }
  return { ok: true, user_id: user.user.id, org_id: user.org_id };
}

export async function rotateVoiceIqSecretAction(): Promise<ActionResult<{ last4: string; rotated_at: string }>> {
  const gate = await ensureCallerCan("integrations:voice_iq:manage");
  if (!gate.ok) return { ok: false, error: "permission" };

  const cooldown = await canRotate(gate.org_id);
  if (!cooldown.allowed) {
    return {
      ok: false,
      error: "rate_limit",
      message: `wait ${cooldown.wait_seconds}s before rotating again`,
    };
  }

  try {
    const result = await rotateVoiceIqSecret({
      organization_id: gate.org_id,
      actor_id: gate.user_id,
    });
    revalidatePath("/admin/integrations/voice-iq");
    return { ok: true, last4: result.last4, rotated_at: result.rotated_at };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "internal", message };
  }
}

function inboxUrl(): string {
  // Vercel exposes VERCEL_URL on previews; fall back to NEXT_PUBLIC_APP_URL,
  // then to localhost for dev. The actual UI displays this URL for the
  // operator to paste into Voice IQ; the test-ping action posts to it
  // server-side.
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";
  return `${fromEnv.replace(/\/$/, "")}/api/events/inbox`;
}

export async function pingVoiceIqInboxAction(): Promise<
  ActionResult<{ status: number; latency_ms: number; body_preview: string }>
> {
  const gate = await ensureCallerCan("integrations:voice_iq:manage");
  if (!gate.ok) return { ok: false, error: "permission" };

  const secret = await getVoiceIqSecret(gate.org_id);
  if (!secret) {
    return {
      ok: false,
      error: "validation",
      message: "secret not configured — rotate first",
    };
  }

  // Synthetic envelope. Lead is a ping target — handler will reject as
  // "lead not found" but the HMAC + transport hop succeed. That's enough
  // signal that the connection works.
  const envelope = {
    event_id: `ping-${randomUUID()}`,
    organization_id: gate.org_id,
    event_kind: "call.audited",
    source_product: "voice_iq",
    ts: new Date().toISOString(),
    payload: {
      lead_id: "00000000-0000-0000-0000-000000000000",
      workspace_id: "00000000-0000-0000-0000-000000000000",
      duration_seconds: 0,
      direction: "inbound",
      schema_version: "v2",
    },
  };
  const raw = JSON.stringify(envelope);
  const sig = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

  const url = inboxUrl();
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-builtrix-signature": `sha256=${sig}`,
      },
      body: raw,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "internal", message: `fetch failed: ${message}` };
  }
  const latency_ms = Date.now() - t0;
  const body = await res.text();
  const body_preview = body.length > 240 ? body.slice(0, 240) + "…" : body;

  // Audit row regardless of outcome.
  const supabase = getSupabaseAdmin();
  await supabase.from("audit_log").insert({
    actor_id: gate.user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: gate.org_id,
    workspace_id: null,
    table_name: "org_integration_secrets",
    record_id: gate.org_id,
    action: "voice_iq_test_ping",
    compiled_artifact: {
      url,
      status: res.status,
      latency_ms,
      event_id: envelope.event_id,
    },
  });

  revalidatePath("/admin/integrations/voice-iq");
  return { ok: true, status: res.status, latency_ms, body_preview };
}

export async function getInboxUrlAction(): Promise<ActionResult<{ url: string }>> {
  const gate = await ensureCallerCan("integrations:voice_iq:manage");
  if (!gate.ok) return { ok: false, error: "permission" };
  return { ok: true, url: inboxUrl() };
}
