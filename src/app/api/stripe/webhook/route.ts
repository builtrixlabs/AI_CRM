import { NextResponse, type NextRequest } from "next/server";
import { withApiAudit } from "@/lib/api/audit-wrapper";
import { verifyWebhookSignature } from "@/lib/billing/stripe";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/billing/webhook-handlers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Stripe signature verification needs the *raw* body — read as text.
  const rawBody = await req.text();

  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_signature",
        message: err instanceof Error ? err.message : "verify_failed",
      },
      { status: 400 }
    );
  }

  // Idempotency check: if event_id is already logged, we already processed
  // it — ack 200 without re-running the handler.
  const admin = getSupabaseAdmin();
  const existing = await admin
    .from("stripe_event_log")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (existing.data) {
    return NextResponse.json({ ok: true, replay: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event, admin);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event, admin);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event, admin);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event, admin);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event, admin);
        break;
      default:
        // Stripe expects 200 for non-fatal acks even on unsubscribed events.
        return NextResponse.json(
          { ok: true, ignored: event.type },
          { status: 200 }
        );
    }
  } catch (err) {
    // Don't log the event — Stripe will retry, and we want the handler to
    // re-run. Handlers are idempotent at the DB layer (UPDATE with
    // deterministic target), so re-running is safe.
    return NextResponse.json(
      {
        error: "handler_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }

  // Handler succeeded — log to mark this event as processed. PK conflict
  // here is a benign race (two concurrent deliveries of the same event);
  // we already updated the DB so return 200.
  const { error: insErr } = await admin.from("stripe_event_log").insert({
    event_id: event.id,
    event_type: event.type,
    payload: event,
  });
  if (insErr && insErr.code !== "23505") {
    // Log INSERT failed for a non-conflict reason — handler completed
    // but the marker is missing. Stripe will retry; the next attempt
    // will re-run the handler (idempotent).
    return NextResponse.json(
      { error: "log_insert_failed", message: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export const POST = withApiAudit(handler, { permission: "billing.webhook" });
