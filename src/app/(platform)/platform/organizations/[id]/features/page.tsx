import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgFeatureFlags } from "@/lib/platform/feature-flags";
import { FeatureFlagsEditor } from "./editor";

export const dynamic = "force-dynamic";

/**
 * D-606 — per-org feature flag matrix. Free-form key/value over
 * organizations.feature_flags jsonb.
 */
export default async function FeaturesPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/403");

  const { id } = await props.params;
  const { data: org } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();
  const orgRow = org as { id: string; name: string };

  const flags = await getOrgFeatureFlags(id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Feature flags — {orgRow.name}
        </h1>
        <p className="text-sm text-neutral-600">
          Per-org flag matrix. Toggling here persists to
          <code className="ml-1 font-mono text-xs">organizations.feature_flags</code>;
          libs read via <code className="font-mono text-xs">isFeatureEnabled(org, flag)</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active flags</CardTitle>
        </CardHeader>
        <CardContent>
          <FeatureFlagsEditor organizationId={orgRow.id} initial={flags} />
        </CardContent>
      </Card>
    </div>
  );
}
