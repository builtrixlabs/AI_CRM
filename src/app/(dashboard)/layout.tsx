import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadDialogProvider } from "@/components/dashboard/new-lead-dialog-context";
import { CommandPalette } from "@/components/cmdk/command-palette";

/**
 * Dashboard route-group layout. Mounts the NewLeadDialog provider
 * (so the Cmd+K palette + the dashboard's "+ New lead" button can
 * both call openDialog()) and the global CommandPalette component
 * (gates command visibility by the user's resolved permissions).
 *
 * Cmd+K is only mounted on (dashboard)/* in V0; admin / platform /
 * settings inherit V1's hoisted root-layout provider. Documented in
 * directives/008-cmdk-bounded-catalog.md.
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
      {children}
      <CommandPalette visiblePerms={permsArray} />
    </NewLeadDialogProvider>
  );
}
