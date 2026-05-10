import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listUsersInOrg, workspaceCountsForUsers } from "@/lib/users/admin";
import type { AssignableBaseRole } from "@/lib/users/types";
import { usersFormAction } from "./actions";
import { InviteUserDialog } from "./invite-user-dialog";
import { RoleCell } from "./role-cell";

export const dynamic = "force-dynamic";

export default async function SettingsUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("settings:manage_users")) redirect("/403");

  const profiles = await listUsersInOrg(user.org_id);
  const wsCounts = await workspaceCountsForUsers(
    user.org_id,
    profiles.map((p) => p.id),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-neutral-600">
            People in this organization. Add, deactivate, or change roles.
          </p>
        </div>
        <InviteUserDialog />
      </header>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Workspaces</TableHead>
              <TableHead className="text-right">Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-neutral-500 py-8 text-center"
                >
                  No users yet. Invite your first teammate above.
                </TableCell>
              </TableRow>
            )}
            {profiles.map((p) => {
              const isSelf = p.id === user.user.id;
              const isPlatform =
                p.base_role === "super_admin" ||
                p.base_role === "service_account";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.display_name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-neutral-500">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-neutral-600">{p.email}</TableCell>
                  <TableCell>
                    <RoleCell
                      user_id={p.id}
                      current={p.base_role as AssignableBaseRole}
                      disabled={isSelf || isPlatform}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {wsCounts.get(p.id) ?? 0}
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500 tabular-nums">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {isSelf || isPlatform ? (
                      <span className="text-xs text-neutral-400">—</span>
                    ) : (
                      <form action={usersFormAction}>
                        <input
                          type="hidden"
                          name="intent"
                          value="deactivate"
                        />
                        <input type="hidden" name="user_id" value={p.id} />
                        <button
                          type="submit"
                          className="text-xs text-rose-700 hover:underline"
                          data-testid={`deactivate-${p.id}`}
                          aria-label={`Deactivate ${p.display_name}`}
                          onClick={(e) => {
                            if (
                              !confirm(
                                `Deactivate ${p.display_name}? They will lose access immediately.`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Deactivate
                        </button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Badge variant="secondary" className="text-xs">
        {profiles.length} user{profiles.length === 1 ? "" : "s"} active
      </Badge>
    </div>
  );
}
