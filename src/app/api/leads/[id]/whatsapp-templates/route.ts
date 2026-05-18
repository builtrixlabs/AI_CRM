/**
 * v6.2.2 — GET /api/leads/[id]/whatsapp-templates
 *
 * Returns the org's approved WhatsApp template ids so the lead workspace
 * picker can render meaningful options. Lead id is in the path for
 * symmetry + future per-lead template filtering; the current
 * implementation is org-scoped.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listApprovedWhatsAppTemplates } from "@/lib/comms/whatsapp/send-from-lead";

export async function GET(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!user.org_id) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }
  // Reading the template list is read-tier: gate on the broadest perm
  // every operator already holds when they can see leads at all.
  if (!resolveForUser(user).has("activities:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const templates = await listApprovedWhatsAppTemplates(user.org_id);
  return NextResponse.json({ templates });
}
