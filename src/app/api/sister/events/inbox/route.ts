/**
 * D-443 — sister-product inbound event endpoint.
 *
 * Auth: Bearer token issued by D-440. Three layers of fail-closed:
 *   1. Token must verify (not revoked) — 401 if not.
 *   2. Envelope.organization_id must equal token's org_id — 403 if not.
 *   3. Envelope.source_product must align with token.product_kind —
 *      403 if mismatched (post_sales_crm token can only post
 *      post_sales.*; lead_sources can only post lead.ingested).
 *
 * Routing is delegated to the existing dispatchInboxEvent (which now
 * knows about the 4 sister-product kinds — D-443 inbox.ts patch).
 * Idempotency: per-(org, event_id) via event_inbox_log.
 */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateSisterProductRequest } from "@/lib/auth/sister-product-auth";
import { dispatchInboxEvent } from "@/lib/events/inbox";
import type { BuiltrixEvent } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sources = "post_sales_crm" | "lead_sources";

const ALLOWED_SOURCE_BY_PRODUCT: Record<string, Sources> = {
  post_sales_crm: "post_sales_crm",
  lead_sources: "lead_sources",
  legal_auditor: "legal_auditor" as Sources,
};

const ALLOWED_KIND_PREFIX: Record<string, string[]> = {
  post_sales_crm: ["post_sales."],
  lead_sources: ["lead.ingested"],
  legal_auditor: ["legal."],
};

function kindIsAllowed(product_kind: string, kind: string): boolean {
  const prefixes = ALLOWED_KIND_PREFIX[product_kind] ?? [];
  return prefixes.some((p) => kind === p || kind.startsWith(p));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateSisterProductRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  let envelope: BuiltrixEvent;
  try {
    envelope = (await req.json()) as BuiltrixEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // Layer 2 — envelope org must match token org.
  if (envelope.organization_id !== auth.org_id) {
    return NextResponse.json(
      { ok: false, error: "cross_tenant_violation" },
      { status: 403 },
    );
  }

  // Layer 3a — source_product must match token's product_kind.
  const expectedSource = ALLOWED_SOURCE_BY_PRODUCT[auth.product_kind];
  if (
    !expectedSource ||
    (envelope.source_product as unknown as string) !== expectedSource
  ) {
    return NextResponse.json(
      { ok: false, error: "source_product_mismatch" },
      { status: 403 },
    );
  }

  // Layer 3b — event_kind must be one this product is allowed to post.
  if (!kindIsAllowed(auth.product_kind, envelope.event_kind)) {
    return NextResponse.json(
      { ok: false, error: "event_kind_not_allowed_for_product" },
      { status: 403 },
    );
  }

  if (!envelope.event_id) {
    return NextResponse.json(
      { ok: false, error: "missing_event_id" },
      { status: 400 },
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
