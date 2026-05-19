import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { endImpersonation } from "@/lib/platform/impersonation";

/**
 * D-606 — exit the active impersonation session. POST only; redirects
 * back to the org detail page (or the platform home if no context).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.impersonation) {
    return NextResponse.redirect(
      new URL(
        "/platform",
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      ),
    );
  }
  const target = user.impersonation.organization_id;
  await endImpersonation({
    super_admin_id: user.impersonation.impersonator_id,
    organization_id: target,
  });
  return NextResponse.redirect(
    new URL(
      `/platform/organizations/${target}`,
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    { status: 303 },
  );
}
