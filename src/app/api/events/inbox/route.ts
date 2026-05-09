import { NextResponse, type NextRequest } from "next/server";
import { verifyWhatsAppSignature } from "@/lib/webhooks/whatsapp/signature";
import { dispatchInboxEvent, recordInboxIngestion } from "@/lib/events/inbox";
import { getSecret } from "@/lib/secrets/getSecret";
import { getVoiceIqSecret } from "@/lib/integrations/voice-iq/secret";
import type { BuiltrixEvent } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-builtrix-signature";

/**
 * Look up the right HMAC secret for the incoming envelope.
 *
 * Order:
 *   1. Per-org secret if envelope.organization_id is parseable AND a row
 *      exists in `org_integration_secrets` for `voice_iq_inbox_secret`.
 *   2. Platform default (`builtrix_event_inbox_secret`).
 *
 * If the body is unparseable or the org_id missing, fall back to the
 * platform default — the body validation upstream will reject the request
 * after signature passes.
 */
async function resolveSecret(rawBody: string): Promise<string> {
  try {
    const parsed = JSON.parse(rawBody) as { organization_id?: string };
    if (
      parsed &&
      typeof parsed.organization_id === "string" &&
      parsed.organization_id.length === 36
    ) {
      const orgSecret = await getVoiceIqSecret(parsed.organization_id);
      if (orgSecret) return orgSecret;
    }
  } catch {
    // unparseable JSON — proceed to platform default
  }
  return (await getSecret("builtrix_event_inbox_secret")) ?? "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get(SIGNATURE_HEADER);
  const raw = await req.text();
  const secret = await resolveSecret(raw);

  if (!verifyWhatsAppSignature(raw, sig, secret)) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 }
    );
  }

  let envelope: BuiltrixEvent;
  try {
    envelope = JSON.parse(raw) as BuiltrixEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  if (!envelope.event_id) {
    await recordInboxIngestion({
      organization_id: envelope.organization_id ?? null,
      event_id: "<missing>",
      event_kind: envelope.event_kind ?? "<missing>",
      source_product: envelope.source_product ?? "platform",
      status: "rejected",
      reason: "missing event_id",
    });
    return NextResponse.json(
      { ok: false, error: "missing_event_id" },
      { status: 400 }
    );
  }

  const result = await dispatchInboxEvent(envelope);

  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.status === "rejected" ? 400 : 500,
    });
  }
  return NextResponse.json(result, { status: 200 });
}
