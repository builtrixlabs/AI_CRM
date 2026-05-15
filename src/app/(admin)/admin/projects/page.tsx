import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listProjects } from "@/lib/projects/sales-mapping";

export const dynamic = "force-dynamic";

/** D-608 — project list; each row links to its sales-team config. */
export default async function AdminProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("projects:assign_sales")) redirect("/403");

  const projects = await listProjects(user.org_id);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Configure which sales reps work which project. The Site Visit
          Booking Agent auto-assigns the primary rep.
        </p>
      </header>

      <ul className="mt-6 space-y-2" data-testid="admin-projects-list">
        {projects.length === 0 ? (
          <li
            className="rounded border border-neutral-200 px-4 py-6 text-sm text-neutral-500"
            data-testid="admin-projects-empty"
          >
            No projects yet. Project records are seeded via the demo seeder
            or operator import.
          </li>
        ) : (
          projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3"
              data-testid={`admin-project-${p.id}`}
            >
              <div>
                <div className="font-medium">{p.name}</div>
                {p.city ? (
                  <div className="text-xs text-neutral-500">{p.city}</div>
                ) : null}
              </div>
              <Link
                href={`/admin/projects/${p.id}/sales-team`}
                className="text-sm underline"
              >
                Sales team →
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
