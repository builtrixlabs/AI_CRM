import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  listAllocationRules,
  listTeamsWithMembers,
} from "@/lib/leads/allocation-admin";
import { listOrgReps } from "@/lib/projects/sales-mapping";
import { AllocationManager } from "@/components/allocation/allocation-manager";

export const dynamic = "force-dynamic";

/** D-610 — pre-sales auto-allocation: teams, members, and rules. */
export default async function AllocationRulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("allocation_rules:manage")) redirect("/403");

  const [rules, teams, reps] = await Promise.all([
    listAllocationRules(user.org_id),
    listTeamsWithMembers(user.org_id),
    listOrgReps(user.org_id),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Lead allocation</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Configure how incoming leads (from the Marketing Intelligence Hub
          or the universal webform) route to presales reps. The
          auto-allocation engine runs on every new lead.
        </p>
      </header>
      <div className="mt-6">
        <AllocationManager rules={rules} teams={teams} reps={reps} />
      </div>
    </main>
  );
}
