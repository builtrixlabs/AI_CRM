/**
 * D-433 — Exotel call-status webhook.
 *
 * Exotel POSTs call-status events here after a click-to-call dispatched
 * via this org's adapter. The org is identified via the `?org=<uuid>`
 * query string parameter on the StatusCallback URL the operator
 * configures in the Exotel dashboard.
 *
 * Authentication: HTTP Basic. The operator embeds api_key:api_token in
 * the StatusCallback URL — e.g.
 *
 *   https://<api_key>:<api_token>@crm.example.com/api/webhooks/telephony/exotel/call-status?org=<uuid>
 *
 * Exotel sets the Authorization header from the embedded creds. We
 * verify by constant-time-comparing the request's Authorization header
 * against the org's stored credentials.
 *
 * Scaffolding only — full wiring (Exotel status → CallStatus →
 * activity-stream event) lives in a separate dispatcher directive once
 * the inbound payload shape is locked against a real org's traffic.
 */

import { NextResponse } from "next/server";
import * as crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/comms/encryption";
import type { ExotelCredentials } from "@/lib/comms/telephony/providers/exotel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  if (!orgId || !UUID_RE.test(orgId)) {
    return NextResponse.json({ error: "missing_or_invalid_org" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("org_telephony_config")
    .select("encrypted_credentials, provider, is_active")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!row || !row.is_active) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }
  if (row.provider !== "exotel") {
    return NextResponse.json({ error: "wrong_provider" }, { status: 404 });
  }

  let creds: ExotelCredentials;
  try {
    creds = decryptJson<ExotelCredentials>(row.encrypted_credentials);
  } catch {
    return NextResponse.json({ error: "decryption_failed" }, { status: 500 });
  }

  const expected =
    "Basic " +
    Buffer.from(
      `${creds.api_key}:${creds.api_token}`,
      "utf8",
    ).toString("base64");
  const got = req.headers.get("authorization") ?? "";

  if (
    got.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Exotel posts form-urlencoded by default. We accept either form-encoded
  // or JSON in case the operator's flow profile differs.
  const ctype = req.headers.get("content-type") ?? "";
  let callSid: string | null = null;
  let callStatus = "";
  if (ctype.includes("application/json")) {
    const data = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    callSid = (data["CallSid"] as string | undefined) ?? null;
    callStatus = String(data["Status"] ?? "").toLowerCase();
  } else {
    const body = await req.text();
    const params = new URLSearchParams(body);
    callSid = params.get("CallSid");
    callStatus = (params.get("Status") ?? "").toLowerCase();
  }

  // Scaffolding — log + return 200. Full activity-stream wiring lands in
  // a follow-up directive.
  console.info("[exotel-webhook]", {
    orgId,
    callSid,
    callStatus,
  });

  return NextResponse.json({ ok: true });
}
