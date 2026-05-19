import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadDialogProvider } from "@/components/dashboard/new-lead-dialog-context";
import { CommandPalette } from "@/components/cmdk/command-palette";
import { BuiltrixCommandSidebar } from "@/components/shell/builtrix-command-sidebar";
import { BuiltrixCommandTopbar } from "@/components/shell/builtrix-command-topbar";
import { resolveRoleTier, formatRoleLabel } from "@/lib/auth/role-tier";

/**
 * Dashboard (Command) surface — Builtrix Design System "Command" UI kit.
 *
 * v6.2.2 reskin:
 *   - 240px labeled sidebar (indigo-800) with role-aware nav (agent vs
 *     manager vs admin) — replaces the prior 56px icon-only rail.
 *   - 64px white topbar with breadcrumb + centered search-as-palette-trigger
 *     + role chip + workspace label + bell + sign-out + avatar.
 *   - Light Builtrix surface by default (cloud-50 body). Dark mode still
 *     available via user theme preference; tokens defined in globals.css
 *     handle the swap.
 *
 * The existing NewLeadDialogProvider + CommandPalette stay mounted so
 * Cmd+K continues to work from anywhere inside the shell — the topbar
 * search button is just a clickable mirror of that hotkey.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const permsArray: string[] = user ? Array.from(resolveForUser(user)) : [];
  const tier = resolveRoleTier(user?.profile?.base_role ?? null);
  const roleLabel = formatRoleLabel(user?.profile?.base_role ?? null);
  const displayName = user?.profile?.display_name ?? null;

  return (
    <NewLeadDialogProvider>
      <div className="bcmd-shell flex">
        <BuiltrixCommandSidebar
          tier={tier}
          roleLabel={roleLabel}
          displayName={displayName}
          permissions={permsArray}
        />
        <div className="flex min-h-screen flex-1 flex-col min-w-0">
          <BuiltrixCommandTopbar
            tier={tier}
            roleLabel={roleLabel}
            displayName={displayName}
          />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette visiblePerms={permsArray} />
    </NewLeadDialogProvider>
  );
}
