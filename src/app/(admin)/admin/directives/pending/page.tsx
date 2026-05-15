import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listPendingWorkflows } from "@/lib/doe/authoring";
import { PendingQueueItem } from "./pending-queue";

export const dynamic = "force-dynamic";

export default async function PendingWorkflowsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("directives:approve")) redirect("/403");

  const pending = await listPendingWorkflows(user.org_id);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI Workflows — pending approval
        </h1>
        <p className="text-sm text-neutral-600">
          Workflows authored by managers wait here for org-admin approval
          before they go live. Approve to activate, or reject with a reason.
          Every decision is audit-logged.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pending ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No workflows waiting for approval.
            </p>
          ) : (
            pending.map((w) => <PendingQueueItem key={w.id} workflow={w} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
