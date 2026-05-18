import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getCommandCenterData } from "@/lib/command-center/data";
import { resolveRoleTier } from "@/lib/auth/role-tier";
import { AgentDashboard } from "@/components/dashboard/agent-dashboard";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";

export const dynamic = "force-dynamic";

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * v6.2.2 — role-aware Builtrix Command home.
 * Routes by tier into either AgentDashboard (focused today view) or
 * ManagerDashboard (org/team rollup). Both consume the same role-scoped
 * `getCommandCenterData` payload — the data layer already narrows leads/
 * activities for rep-tier viewers via FULL_VISIBILITY_ROLES.
 */
export default async function CommandCenterHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="bcmd-card px-6 py-10 text-center">
          <h2 className="font-display text-lg font-semibold text-[var(--fg1)]">
            No organisation yet
          </h2>
          <p className="mt-2 font-sans text-sm text-[var(--fg3)]">
            Your account is not yet linked to an organisation. Contact your
            admin to be invited.
          </p>
        </div>
      </div>
    );
  }

  const data = await getCommandCenterData({
    user_id: user.user.id,
    organization_id: user.org_id,
    base_role: user.profile.base_role,
  });

  const greeting = greetingForHour(new Date().getHours());
  const firstName = user.profile.display_name?.split(" ")[0] ?? "operator";
  const tier = resolveRoleTier(user.profile.base_role);

  if (!data.has_any_data) {
    return <EmptyState />;
  }

  if (tier === "agent") {
    return (
      <AgentDashboard data={data} firstName={firstName} greeting={greeting} />
    );
  }

  return (
    <ManagerDashboard
      data={data}
      firstName={firstName}
      greeting={greeting}
      tierLabel={tier === "admin" ? "admin" : "manager"}
    />
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="bcmd-card px-6 py-12 text-center" data-testid="cc-empty-state">
        <h2 className="font-display text-lg font-semibold text-[var(--fg1)]">
          No leads yet
        </h2>
        <p className="mt-2 font-sans text-sm text-[var(--fg3)]">
          Connect the Marketing Intelligence Hub or use the universal
          webform endpoint to start ingesting leads.
        </p>
        <Link
          href="/admin/integrations"
          className="mt-4 inline-block font-display text-sm font-semibold text-[var(--amethyst-700)] underline"
        >
          Configure integrations →
        </Link>
      </div>
    </div>
  );
}
