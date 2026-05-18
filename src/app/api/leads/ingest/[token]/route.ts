import { NextResponse, type NextRequest } from "next/server";
import { ingestLead } from "@/lib/sources/webform/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/leads/ingest/[token]
 *
 * Public webform ingestion endpoint. The token (per-org, generated via
 * /admin/sources) is the only auth. Validates payload via zod; on success
 * creates a lead node, on parse failure writes to leads_quarantine.
 *
 * Response codes:
 *   201 — lead created          { lead_id, endpoint_id }
 *   202 — quarantined           { quarantine_id, endpoint_id, reason }
 *   401 — invalid/inactive token
 *   400 — body wasn't valid JSON
 *   500 — internal failure
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await ingestLead({ token, payload_raw: payload });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: "internal",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }

  if (result.ok) {
    return NextResponse.json(
      { ok: true, lead_id: result.lead_id, endpoint_id: result.endpoint_id },
      { status: 201 },
    );
  }
  if (result.reason === "invalid_token") {
    return NextResponse.json(
      { ok: false, reason: "invalid_token" },
      { status: 401 },
    );
  }
  if (result.reason === "quarantined") {
    return NextResponse.json(
      {
        ok: false,
        reason: "quarantined",
        quarantine_id: result.quarantine_id,
        endpoint_id: result.endpoint_id,
      },
      { status: 202 },
    );
  }
  return NextResponse.json(
    { ok: false, reason: "internal", message: result.message ?? "Unknown" },
    { status: 500 },
  );
}
