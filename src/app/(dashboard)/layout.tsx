import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadDialogProvider } from "@/components/dashboard/new-lead-dialog-context";
import { CommandPalette } from "@/components/cmdk/command-palette";
import { UserMenu } from "@/components/auth/user-menu";

/**
 * Dashboard route-group layout. Mounts the NewLeadDialog provider
 * (so the Cmd+K palette + the dashboard's "+ New lead" button can
 * both call openDialog()) and the global CommandPalette component
 * (gates command visibility by the user's resolved permissions).
 *
 * Cmd+K is only mounted on (dashboard)/* in V0; admin / platform /
 * settings inherit V1's hoisted root-layout provider. Documented in
 * directives/008-cmdk-bounded-catalog.md.
 *
 * Header carries the UserMenu so any signed-in user (org member,
 * org_admin, channel_partner who routed through /dashboard) can reach
 * their profile or sign out without leaving the surface.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const permsArray: string[] = user
    ? Array.from(resolveForUser(user))
    : [];

  return (
    <NewLeadDialogProvider>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
            <Link
              href="/dashboard"
              className="font-semibold tracking-tight text-neutral-900"
            >
              Builtrix · Dashboard
            </Link>
            {user && (
              <UserMenu
                displayName={user.profile.display_name}
                email={user.user.email}
                settingsHref="/dashboard/settings"
                nameClassName="text-xs text-neutral-600"
                buttonClassName="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs hover:bg-neutral-100"
              />
            )}
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
      <CommandPalette visiblePerms={permsArray} />
    </NewLeadDialogProvider>
  );
}
