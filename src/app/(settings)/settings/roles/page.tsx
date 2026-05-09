import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaFreshnessBanner } from "@/components/auth/mfa-freshness-banner";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { isDemoBypassActive as _isDemoBypassActive, isMfaFresh } from "@/lib/auth/mfa";
import {
  BASE_ROLE_PERMS,
  PERMISSIONS,
  type Permission,
} from "@/lib/auth/rbac";
import {
  GRANTABLE_APP_ROLES,
  type AppRole,
} from "@/lib/auth/types";
import {
  effectiveStateFor,
  listOverrides,
} from "@/lib/auth/role-overrides";
import { OverrideRow } from "./override-row";

export const dynamic = "force-dynamic";

// Permission groupings — lifted from rbac.ts comments. Visual-only.
const PERMISSION_GROUPS: Array<{ label: string; prefix: string[] }> = [
  { label: "Platform tier", prefix: ["platform:", "organizations:", "platform_analytics", "platform_tickets"] },
  { label: "Org account plane", prefix: ["settings:", "integrations:", "subscriptions:", "billing:", "templates:", "apps:", "dashboards:", "tables:", "agents:", "directives:", "support:", "audit:"] },
  { label: "Leads", prefix: ["leads:"] },
  { label: "Deals", prefix: ["deals:"] },
  { label: "Contacts", prefix: ["contacts:"] },
  { label: "Properties / units", prefix: ["properties:", "units:"] },
  { label: "Activities / calls / campaigns", prefix: ["activities:", "calls:", "campaigns:"] },
  { label: "Site visits", prefix: ["site_visits:"] },
  { label: "Documents / notes", prefix: ["documents:", "notes:"] },
  { label: "Channel partner", prefix: ["cp:"] },
];

function groupOf(p: string): string {
  for (const g of PERMISSION_GROUPS) {
    if (g.prefix.some((pre) => p.startsWith(pre))) return g.label;
  }
  return "Other";
}

function isAppRole(r: string): r is AppRole {
  return (GRANTABLE_APP_ROLES as ReadonlyArray<string>).includes(r);
}

export default async function RolesPage(props: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("settings:manage_roles")) {
    redirect("/403");
  }

  const sp = await props.searchParams;
  const role: AppRole = isAppRole(sp.role ?? "") ? (sp.role as AppRole) : "manager";

  const [overrides, demoBypass] = await Promise.all([
    listOverrides(user.org_id),
    _isDemoBypassActive(),
  ]);
  const fresh = isMfaFresh(user.profile.mfa_verified_at ?? null);
  const overrideMap = new Map<string, "allow" | "deny">();
  for (const o of overrides) {
    if (o.role === role) {
      overrideMap.set(o.permission, o.mode);
    }
  }

  // Bucket permissions by group, in catalog order.
  const grouped = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const g = groupOf(p);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(p);
  }

  return (
    <div className="space-y-6">
      <MfaFreshnessBanner
        verified_at={user.profile.mfa_verified_at ?? null}
        fresh={fresh}
        demo_bypass={demoBypass}
        return_to="/settings/roles"
      />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
        <p className="text-sm text-neutral-600">
          Per-role permission overrides. Allow / deny with reason; defaults
          come from the role catalog. Every change is audit-logged.
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500 mr-1">Role:</span>
        {GRANTABLE_APP_ROLES.map((r) => (
          <Link
            key={r}
            href={`/settings/roles?role=${r}`}
            className={`px-2 py-1 rounded-md border ${
              role === r
                ? "bg-neutral-900 text-white border-neutral-900"
                : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {r}
          </Link>
        ))}
      </nav>

      {Array.from(grouped.entries()).map(([groupLabel, perms]) => (
        <Card key={groupLabel}>
          <CardHeader>
            <CardTitle className="text-base">{groupLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {perms.map((p) => {
              const ovr = overrideMap.get(p) ?? null;
              const state = effectiveStateFor(role, p, ovr);
              return (
                <OverrideRow
                  key={p}
                  role={role}
                  permission={p}
                  granted={state.granted}
                  default_granted={state.default_granted}
                  override={state.override}
                  platform_only={state.platform_only}
                />
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
