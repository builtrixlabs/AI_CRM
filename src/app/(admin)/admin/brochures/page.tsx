import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listBrochures } from "@/lib/brochures/repository";
import { listProjects } from "@/lib/projects/sales-mapping";
import { BrochureManager } from "@/components/brochures/brochure-manager";

export const dynamic = "force-dynamic";

/** D-607 — Brochure Repository. Org admin uploads project collateral with
 *  structured metadata; the Brochure Agent (D-600) picks from this. */
export default async function AdminBrochuresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("brochures:upload")) redirect("/403");

  const canDelete = perms.has("brochures:delete");
  const [brochures, projects] = await Promise.all([
    listBrochures(user.org_id),
    listProjects(user.org_id),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Brochures</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Upload project collateral — floor plans, price sheets, brochures —
          and tag each with the project, BHK, and budget band. The Brochure
          Agent picks the right document by matching this metadata to what a
          customer asked for on a call.
        </p>
      </header>

      <div className="mt-6">
        <BrochureManager
          brochures={brochures}
          projects={projects}
          canDelete={canDelete}
        />
      </div>
    </main>
  );
}
