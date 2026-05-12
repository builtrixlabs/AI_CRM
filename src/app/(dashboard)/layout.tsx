import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadDialogProvider } from "@/components/dashboard/new-lead-dialog-context";
import { CommandPalette } from "@/components/cmdk/command-palette";
import { CommandCenterSidebar } from "@/components/shell/command-center-sidebar";
import { CommandCenterTopbar } from "@/components/shell/command-center-topbar";
import { CommandBuiltrixBar } from "@/components/shell/command-builtrix-bar";

// (dashboard) is the Command Center surface. We force `.dark` on this
// subtree regardless of the user's profile preference — the Command
// Center is a fixed-aesthetic operational view, not a themable shell.
// Admin / platform / settings inherit the user's preferred theme via
// the root layout (D-501 will reskin them onto the light Builtrix base).
//
// Mounts the existing NewLeadDialogProvider + CommandPalette so Cmd+K
// keeps working from inside the new shell.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const permsArray: string[] = user ? Array.from(resolveForUser(user)) : [];

  return (
    <NewLeadDialogProvider>
      <div className="dark min-h-screen cc-bg-canvas text-foreground">
        <div className="flex min-h-screen">
          <CommandCenterSidebar />
          <div className="flex min-h-screen flex-1 flex-col min-w-0">
            <CommandCenterTopbar
              displayName={user?.profile?.display_name ?? null}
            />
            <main className="flex-1">{children}</main>
            <CommandBuiltrixBar />
          </div>
        </div>
      </div>
      <CommandPalette visiblePerms={permsArray} />
    </NewLeadDialogProvider>
  );
}
