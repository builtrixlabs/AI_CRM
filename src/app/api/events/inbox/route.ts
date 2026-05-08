import { NextResponse, type NextRequest } from "next/server";
import { verifyWhatsAppSignature } from "@/lib/webhooks/whatsapp/signature";
import { dispatchInboxEvent, recordInboxIngestion } from "@/lib/events/inbox";
import { getSecret } from "@/lib/secrets/getSecret";
import type { BuiltrixEvent } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-builtrix-signature";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get(SIGNATURE_HEADER);
  const raw = await req.text();
  const secret = (await getSecret("builtrix_event_inbox_secret")) ?? "";

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
