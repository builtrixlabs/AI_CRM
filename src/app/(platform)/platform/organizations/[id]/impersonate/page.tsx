import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { StartImpersonationForm } from "./start-form";

export const dynamic = "force-dynamic";

/**
 * D-606 — start an impersonation session against the target org. Sets a
 * 30-min signed cookie, writes a row in super_admin_impersonation_log,
 * redirects to /admin where the banner takes over.
 */
export default async function StartImpersonationPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/403");

  const { id } = await props.params;
  const { data: org } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, name, slug")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const orgRow = org as { id: string; name: string; slug: string };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Start impersonation
        </h1>
        <p className="text-sm text-neutral-600">
          You will land on{" "}
          <span className="font-medium text-foreground">{orgRow.name}</span>'s
          {" "}/admin surface as their org admin for the next 30 minutes. Every
          action you take is audit-logged with both your super-admin id and
          the target org id (Constitution III).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session details</CardTitle>
        </CardHeader>
        <CardContent>
          <StartImpersonationForm organizationId={orgRow.id} />
        </CardContent>
      </Card>
    </div>
  );
}
