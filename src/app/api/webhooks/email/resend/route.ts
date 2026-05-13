/**
 * D-434 — Resend delivery-receipt webhook.
 *
 * Scaffolding-only. Resend POSTs JSON envelopes here with delivery /
 * bounce / complaint events. We accept the body and log a structured
 * record so the operator can see traffic in the Vercel function log;
 * full activity-stream wiring lands with the dispatcher directive.
 *
 * Svix-style HMAC signature verification (svix-id / svix-timestamp /
 * svix-signature headers) is intentionally deferred — pre-shared
 * webhook signing secret will land alongside the dispatcher work that
 * actually consumes these events.
 */

import { NextResponse } from "next/server";

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
  };
};

export async function POST(req: Request) {
  let body: ResendEvent | null = null;
  try {
    body = (await req.json()) as ResendEvent;
  } catch {
    return NextResponse.json(
      { error: "invalid_json_body" },
      { status: 400 },
    );
  }

  if (!body || (typeof body !== "object")) {
    return NextResponse.json(
      { error: "missing_envelope" },
      { status: 400 },
    );
  }

  const type = body.type ?? null;
  const emailId = body.data?.email_id ?? null;
  const to = Array.isArray(body.data?.to)
    ? body.data?.to?.join(",")
    : (body.data?.to ?? null);

  console.info("[resend-webhook]", { type, emailId, to });

  return NextResponse.json({ ok: true });
}
