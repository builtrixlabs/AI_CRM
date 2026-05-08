import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyWhatsAppSignature } from "@/lib/webhooks/whatsapp/signature";
import { upsertActivityFromWhatsApp } from "@/lib/webhooks/whatsapp/ingest";
import { recordIngestion } from "@/lib/webhooks/whatsapp/log";
import { maskPii } from "@/lib/nodes/text";
import { getSecret } from "@/lib/secrets/getSecret";
import type { WhatsAppInboundPayload } from "@/lib/webhooks/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-wa-signature";
const ORG_HEADER = "x-builtrix-org-id";

type ResolvedOrg = {
  organization_id: string;
  secret_sha256: string;
};

async function resolveOrgFromHeader(
  organization_id: string | null
): Promise<ResolvedOrg | null> {
  if (!organization_id) return null;
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("org_whatsapp_endpoints")
    .select("organization_id, secret_sha256")
    .eq("organization_id", organization_id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as ResolvedOrg;
}

async function resolveWebhookSecret(): Promise<string> {
  const v = await getSecret("whatsapp_webhook_secret");
  return v ?? "";
}

/**
 * POST /api/webhooks/whatsapp
 *
 * Headers:
 *   x-wa-signature   HMAC-SHA256 of the raw body, hex (or `sha256=<hex>`)
 *   x-builtrix-org-id  the org's id (uuid). Looked up against
 *                      org_whatsapp_endpoints to get the configured
 *                      secret + default workspace.
 *
 * Body (JSON):
 *   { wa_message_id, from_phone, to_phone, body, ts, raw? }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get(SIGNATURE_HEADER);
  const orgHeader = req.headers.get(ORG_HEADER);
  const raw = await req.text();

  // Single platform-wide secret. Resolved via getSecret(), which reads
  // platform_secrets first (set in /platform/settings/secrets) and
  // falls back to WHATSAPP_WEBHOOK_SECRET env var.
  const platformSecret = await resolveWebhookSecret();
  if (!verifyWhatsAppSignature(raw, sig, platformSecret)) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 }
    );
  }

  let body: WhatsAppInboundPayload;
  try {
    body = JSON.parse(raw) as WhatsAppInboundPayload;
  } catch {
    await recordIngestion({
      organization_id: orgHeader,
      workspace_id: null,
      wa_message_id: "<unparseable>",
      from_phone_e164: null,
      status: "rejected",
      reason: "invalid JSON",
    });
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  if (!body.wa_message_id || typeof body.wa_message_id !== "string") {
    await recordIngestion({
      organization_id: orgHeader,
      workspace_id: null,
      wa_message_id: "<missing>",
      from_phone_e164: null,
      status: "rejected",
      reason: "missing wa_message_id",
    });
    return NextResponse.json(
      { ok: false, error: "missing_wa_message_id" },
      { status: 400 }
    );
  }

  const resolved = await resolveOrgFromHeader(orgHeader);
  if (!resolved) {
    await recordIngestion({
      organization_id: orgHeader,
      workspace_id: null,
      wa_message_id: body.wa_message_id,
      from_phone_e164: null,
      status: "rejected",
      reason: "unknown organization",
    });
    return NextResponse.json(
      { ok: false, error: "unknown_organization" },
      { status: 400 }
    );
  }

  // Mask PII before any console line — the raw body is logged at INFO
  // by Vercel/Next.js framework hooks even without our explicit log.
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[whatsapp] inbound msg=${body.wa_message_id} from=${maskPii(body.from_phone ?? "")}`
    );
  }

  const result = await upsertActivityFromWhatsApp({
    payload: body,
    organization_id: resolved.organization_id,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      deduped: result.deduped,
      activity_id: result.activity_id,
      lead_id: result.lead_id,
      status: result.status,
    },
    { status: 200 }
  );
}
