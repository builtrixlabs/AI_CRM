/**
 * D-604 — Marketing Intelligence Hub inbound lead API.
 *
 * POST /api/sister/v1/leads — implements docs/baselines/122-mih-inbound-contract.md.
 *
 * Three fail-closed auth layers (baseline 122 §9):
 *   1. D-440 Bearer token resolves (org_id, product_kind) — 401 on bad token.
 *   2. body.organization_id MUST equal the token's org — 403 on mismatch.
 *   3. product_kind MUST be 'marketing_intelligence_hub' — 403 on mismatch.
 *
 * Then: per-org KV rate limit (100/sec, fail-open) → 429; Zod validation
 * → 400; dispatch to ingestMihLead → 201 { lead_id, status, allocated_to_user_id }.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { ZodError } from "zod";
import { authenticateSisterProductRequest } from "@/lib/auth/sister-product-auth";
import { createLimiter } from "@/lib/auth/rate-limit";
import { mihLeadInboundSchema } from "@/lib/integrations/mih/schema";
import { ingestMihLead, logMihInbound } from "@/lib/integrations/mih/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-org 100 leads/sec (baseline 122 §6). Module-level singleton —
// KV-backed in prod, in-memory fallback in dev/test.
const mihLimiter = createLimiter({
  capacity: 100,
  window_ms: 1000,
  key_prefix: "mih_leads",
});

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Layer 1 — D-440 Bearer token ──────────────────────────────────────
  const auth = await authenticateSisterProductRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  // ── Layer 3 (product) — MIH tokens only (baseline 122 §1, §9) ──────────
  if (auth.product_kind !== "marketing_intelligence_hub") {
    return NextResponse.json(
      { ok: false, error: "wrong_product_kind" },
      { status: 403 },
    );
  }

  // ── Body parse + Zod validation (baseline 122 §2) ─────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = mihLeadInboundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation",
        fieldErrors: fieldErrorsFromZod(parsed.error),
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // ── Layer 2 — envelope org MUST equal the token's org (baseline 122 §9) ─
  if (payload.organization_id !== auth.org_id) {
    return NextResponse.json(
      { ok: false, error: "cross_tenant_violation" },
      { status: 403 },
    );
  }

  // ── Per-org rate limit (baseline 122 §6). Fail-open on limiter error ──
  try {
    const rl = await mihLimiter.consume(auth.org_id);
    if (!rl.allowed) {
      await logMihInbound({
        organization_id: auth.org_id,
        payload,
        status: "rate_limited",
        reason: "per-org rate limit exceeded",
      });
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        {
          status: 429,
          headers: {
            "retry-after": String(
              Math.max(1, Math.ceil(rl.retry_after_ms / 1000)),
            ),
          },
        },
      );
    }
  } catch (err) {
    // Fail-open — a lead lost on paid marketing spend is worse than a
    // brief rate-limit bypass (baseline 122 §6).
    // eslint-disable-next-line no-console
    console.warn(
      "[mih/leads] rate limiter unavailable, failing open",
      err instanceof Error ? err.message : err,
    );
  }

  // ── Ingest (dedup → create | merge) ───────────────────────────────────
  const result = await ingestMihLead({
    organization_id: auth.org_id,
    payload,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, message: result.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      lead_id: result.lead_id,
      status: result.status,
      // D-610 fills this asynchronously via the lead.created event.
      allocated_to_user_id: null,
    },
    { status: 201 },
  );
}
