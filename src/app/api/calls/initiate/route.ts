/**
 * D-609 — POST /api/calls/initiate { lead_id }
 *
 * Thin auth/perm/parse glue. The rep must hold `calls:listen` AND have a
 * `profiles.phone` set (the "rep leg" of the bridge — read from the
 * authenticated user, never the request body). All telephony logic is in
 * src/lib/comms/telephony/click-to-call.ts.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { initiateClickToCall } from "@/lib/comms/telephony/click-to-call";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!user.org_id) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }
  if (!resolveForUser(user).has("calls:listen")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const repPhone = user.profile.phone;
  if (!repPhone || !repPhone.trim()) {
    return NextResponse.json({ error: "no_rep_phone" }, { status: 400 });
  }

  let body: { lead_id?: unknown };
  try {
    body = (await req.json()) as { lead_id?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
  if (!leadId) {
    return NextResponse.json({ error: "missing_lead_id" }, { status: 400 });
  }

  const result = await initiateClickToCall({
    organization_id: user.org_id,
    lead_id: leadId,
    from_user_id: user.user.id,
    from_phone_e164: repPhone.trim(),
  });

  if (!result.ok) {
    const status =
      result.reason === "lead_not_found"
        ? 404
        : result.reason === "no_lead_phone"
          ? 422
          : result.reason === "not_configured"
            ? 409
            : 502; // provider_error
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    provider_call_id: result.provider_call_id,
    activity_id: result.activity_id,
    provider: result.provider,
  });
}
