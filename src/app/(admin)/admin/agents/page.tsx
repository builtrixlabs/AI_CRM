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
import { listAgentSurface } from "@/lib/agents/admin";
import { agentsFormAction } from "./actions";
import { TierCell } from "./tier-cell";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  "active" | "suspended" | "not_provisioned",
  "default" | "destructive" | "outline"
> = {
  active: "default",
  suspended: "destructive",
  not_provisioned: "outline",
};

const STATUS_LABEL: Record<"active" | "suspended" | "not_provisioned", string> = {
  active: "Active",
  suspended: "Suspended",
  not_provisioned: "Not provisioned",
};

export default async function AdminAgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("agents:provision")) redirect("/403");

  const surface = await listAgentSurface(user.org_id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AI agents</h1>
        <p className="text-sm text-neutral-600">
          Provision, suspend, or constrain the agents that act on your data.
          Suspended agents are skipped at runtime; tier overrides constrain
          what an agent is allowed to do.
        </p>
      </header>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Global max tier</TableHead>
              <TableHead>Override</TableHead>
              <TableHead>Effective tier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surface.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-neutral-500 py-8 text-center"
                >
                  No agents in the registry yet.
                </TableCell>
              </TableRow>
            )}
            {surface.map((row) => {
              const provisioned = row.config != null;
              return (
                <TableRow
                  key={row.agent_type}
                  data-status={row.status}
                  className={row.status === "suspended" ? "opacity-60" : ""}
                >
                  <TableCell>
                    <div className="font-medium">{row.display_name}</div>
                    <div className="font-mono text-[10px] text-neutral-500">
                      {row.agent_type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {row.max_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {provisioned ? (
                      <TierCell
                        agent_type={row.agent_type}
                        current={row.config?.max_tier_override ?? null}
                        global_max={row.max_tier}
                        disabled={row.status === "suspended"}
                      />
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.effective_max_tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!provisioned ? (
                      <form action={agentsFormAction}>
                        <input type="hidden" name="intent" value="provision" />
                        <input
                          type="hidden"
                          name="agent_type"
                          value={row.agent_type}
                        />
                        <button
                          type="submit"
                          className="text-xs text-neutral-900 hover:underline"
                          data-testid={`provision-${row.agent_type}`}
                        >
                          Provision →
                        </button>
                      </form>
                    ) : row.status === "suspended" ? (
                      <form action={agentsFormAction}>
                        <input type="hidden" name="intent" value="toggle" />
                        <input
                          type="hidden"
                          name="agent_type"
                          value={row.agent_type}
                        />
                        <input type="hidden" name="enabled" value="true" />
                        <button
                          type="submit"
                          className="text-xs text-emerald-700 hover:underline"
                          data-testid={`resume-${row.agent_type}`}
                        >
                          Resume
                        </button>
                      </form>
                    ) : (
                      <form action={agentsFormAction}>
                        <input type="hidden" name="intent" value="toggle" />
                        <input
                          type="hidden"
                          name="agent_type"
                          value={row.agent_type}
                        />
                        <input type="hidden" name="enabled" value="false" />
                        <button
                          type="submit"
                          className="text-xs text-rose-700 hover:underline"
                          data-testid={`suspend-${row.agent_type}`}
                          onClick={(e) => {
                            if (
                              !confirm(
                                `Suspend ${row.display_name}? It will stop running until you resume it.`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Suspend
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
    </div>
  );
}
