/**
 * v6.2.2 — POST /api/leads/[id]/send-email
 *
 * Manual, on-demand email send from the lead workspace. Mirrors D-609's
 * /api/calls/initiate: auth → perm → orchestrator → typed result → status.
 * All business logic in src/lib/comms/email/send-from-lead.ts.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { sendEmailFromLead } from "@/lib/comms/email/send-from-lead";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!user.org_id) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }
  if (!resolveForUser(user).has("activities:create")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: leadId } = await ctx.params;
  if (!leadId) {
    return NextResponse.json({ error: "missing_lead_id" }, { status: 400 });
  }

  let body: {
    subject?: unknown;
    body_text?: unknown;
    body_html?: unknown;
    to?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject : "";
  const body_text = typeof body.body_text === "string" ? body.body_text : "";
  const body_html =
    typeof body.body_html === "string" ? body.body_html : undefined;
  const to_override = typeof body.to === "string" ? body.to : undefined;

  const result = await sendEmailFromLead({
    organization_id: user.org_id,
    lead_id: leadId,
    from_user_id: user.user.id,
    subject,
    body_text,
    body_html,
    to_override,
  });

  if (!result.ok) {
    const status = statusForReason(result.reason);
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    provider_message_id: result.provider_message_id,
    activity_id: result.activity_id,
    provider: result.provider,
  });
}

function statusForReason(reason: string): number {
  switch (reason) {
    case "lead_not_found":
      return 404;
    case "no_lead_email":
    case "missing_subject":
    case "missing_body":
      return 422;
    case "not_configured":
      return 409;
    default:
      return 502;
  }
}
