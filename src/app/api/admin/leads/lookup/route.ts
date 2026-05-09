import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSecret } from "@/lib/secrets/getSecret";
import {
  findOrgByVoiceIqSecret,
  lookupLead,
} from "@/lib/integrations/voice-iq/lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const querySchema = z.object({
  external_id: z.string().min(1).max(200).optional(),
  phone: z.string().min(7).max(40).optional(),
  org_id: z.string().uuid(),
});

type AuthOk = { ok: true; organization_id: string; secret_source: "org" | "platform" };
type AuthFail = { ok: false; status: 401 | 404; error: string };

async function authBearer(req: NextRequest, claimedOrgId: string): Promise<AuthOk | AuthFail> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "missing_bearer" };
  }
  const token = header.slice(7).trim();
  if (token.length < 8) {
    return { ok: false, status: 401, error: "invalid_bearer" };
  }

  // 1. Try per-org match.
  const matchedOrg = await findOrgByVoiceIqSecret(token);
  if (matchedOrg) {
    if (matchedOrg !== claimedOrgId) {
      // Fail closed — caller is authentic but querying another org. Don't leak which.
      return { ok: false, status: 404, error: "not_found" };
    }
    return { ok: true, organization_id: matchedOrg, secret_source: "org" };
  }

  // 2. Fall back to platform default — must match exactly. Caller still has to
  //    pass the correct org_id (no cross-org reads).
  const platform = await getSecret("builtrix_event_inbox_secret");
  if (platform && platform === token) {
    return { ok: true, organization_id: claimedOrgId, secret_source: "platform" };
  }

  return { ok: false, status: 401, error: "invalid_bearer" };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    external_id: url.searchParams.get("external_id") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
    org_id: url.searchParams.get("org_id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_query", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  if (!parsed.data.external_id && !parsed.data.phone) {
    return NextResponse.json(
      { ok: false, error: "external_id_or_phone_required" },
      { status: 400 }
    );
  }

  const auth = await authBearer(req, parsed.data.org_id);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const client = getSupabaseAdmin();
  const result = await lookupLead(
    {
      organization_id: auth.organization_id,
      external_id: parsed.data.external_id ?? null,
      phone: parsed.data.phone ?? null,
    },
    client
  );

  // Audit every lookup — observability + abuse detection.
  await client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "voice_iq_lookup",
    organization_id: auth.organization_id,
    workspace_id: result?.workspace_id ?? null,
    table_name: "nodes",
    record_id: result?.lead_node_id ?? auth.organization_id,
    action: "leads_lookup_read",
    compiled_artifact: {
      query: {
        external_id: parsed.data.external_id ?? null,
        phone: parsed.data.phone ? "<redacted>" : null,
      },
      secret_source: auth.secret_source,
      result_status: result ? "found" : "not_found",
      result_node_id: result?.lead_node_id ?? null,
    },
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, lead_node_id: result.lead_node_id, workspace_id: result.workspace_id },
    { status: 200 }
  );
}
