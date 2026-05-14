import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  listProjectAssignments,
  listOrgReps,
} from "@/lib/projects/sales-mapping";
import { SalesTeamManager } from "@/components/projects/sales-team-manager";

export const dynamic = "force-dynamic";

/** D-608 — per-project sales-team configuration. */
export default async function ProjectSalesTeamPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("projects:assign_sales")) redirect("/403");

  // Resolve the project node — org-scoped (the filter is the tenant guard).
  const { data: projectRow } = await getSupabaseAdmin()
    .from("nodes")
    .select("id, label, data")
    .eq("id", id)
    .eq("node_type", "project")
    .eq("organization_id", user.org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!projectRow) notFound();
  const project = projectRow as {
    id: string;
    label: string;
    data: Record<string, unknown> | null;
  };
  const projectName =
    (typeof project.data?.name === "string" && project.data.name) ||
    project.label;

  const [assignments, reps] = await Promise.all([
    listProjectAssignments(user.org_id, id),
    listOrgReps(user.org_id),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header>
        <Link
          href="/admin/projects"
          className="text-xs text-neutral-500 underline"
        >
          ← All projects
        </Link>
        <h1
          className="mt-2 text-2xl font-semibold"
          data-testid="project-sales-team-title"
        >
          {projectName} · Sales team
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Add sales reps and mark one as primary. The Site Visit Booking
          Agent assigns the primary rep — or the next available rep if the
          primary is on leave.
        </p>
      </header>

      <div className="mt-6">
        <SalesTeamManager
          projectId={id}
          assignments={assignments}
          reps={reps}
        />
      </div>
    </main>
  );
}
