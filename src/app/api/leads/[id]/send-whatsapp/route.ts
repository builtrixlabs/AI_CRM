/**
 * v6.2.2 — POST /api/leads/[id]/send-whatsapp
 *
 * Manual, on-demand WhatsApp template send from the lead workspace.
 * WABA: template-only, variable map provided by the caller, adapter
 * rejects unknown template ids (defense-in-depth).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { sendWhatsAppFromLead } from "@/lib/comms/whatsapp/send-from-lead";

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
    template_id?: unknown;
    variables?: unknown;
    language_code?: unknown;
    to_phone?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const template_id =
    typeof body.template_id === "string" ? body.template_id : "";
  const variables = isStringMap(body.variables) ? body.variables : {};
  const language_code =
    typeof body.language_code === "string" ? body.language_code : undefined;
  const to_phone_override =
    typeof body.to_phone === "string" ? body.to_phone : undefined;

  const result = await sendWhatsAppFromLead({
    organization_id: user.org_id,
    lead_id: leadId,
    from_user_id: user.user.id,
    template_id,
    variables,
    language_code,
    to_phone_override,
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
    template_id: result.template_id,
    activity_id: result.activity_id,
    provider: result.provider,
  });
}

function isStringMap(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null) return false;
  for (const value of Object.values(v as Record<string, unknown>)) {
    if (typeof value !== "string") return false;
  }
  return true;
}

function statusForReason(reason: string): number {
  switch (reason) {
    case "lead_not_found":
      return 404;
    case "no_lead_phone":
    case "missing_template":
      return 422;
    case "not_configured":
      return 409;
    default:
      return 502;
  }
}
