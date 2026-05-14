import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  listEffectiveDirectives,
  listRecentInvocations,
  type EffectiveDirective,
  type RecentInvocationRow,
} from "@/lib/doe/authoring";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { directiveFormAction } from "./actions";
import { NewDirectiveDialog } from "./new-directive-dialog";

export const dynamic = "force-dynamic";

const ORIGIN_LABEL: Record<EffectiveDirective["origin"], string> = {
  platform_default: "Platform default",
  override: "Override",
  custom: "Custom",
};

const OUTCOME_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  dispatched: "default",
  skipped_condition: "outline",
  skipped_disabled: "outline",
  skipped_idempotent: "outline",
  rate_limited: "destructive",
  failed_tier_ceiling: "destructive",
  pending_approval: "secondary",
  error: "destructive",
};

function lastFiredFor(
  directive_id: string,
  invocations: RecentInvocationRow[],
): string | null {
  for (const inv of invocations) {
    if (inv.directive_id === directive_id && inv.outcome === "dispatched") {
      return inv.ts;
    }
  }
  return null;
}

function fires24hFor(
  directive_id: string,
  invocations: RecentInvocationRow[],
  now_ms: number,
): number {
  const cutoff = now_ms - 24 * 60 * 60 * 1000;
  let n = 0;
  for (const inv of invocations) {
    if (inv.directive_id !== directive_id) continue;
    if (inv.outcome !== "dispatched") continue;
    if (new Date(inv.ts).getTime() < cutoff) continue;
    n += 1;
  }
  return n;
}

export default async function AdminDirectivesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("directives:author")) redirect("/403");

  const [directives, invocations] = await Promise.all([
    listEffectiveDirectives(user.org_id),
    listRecentInvocations(user.org_id, 50),
  ]);

  const now_ms = Date.now();

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Workflows</h1>
          <p className="text-sm text-neutral-600">
            Automation rules — &quot;when X happens, do Y&quot;. Platform defaults are
            inherited; toggle off any you don&apos;t want, or author your own.
          </p>
        </div>
        <NewDirectiveDialog />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Active AI workflows
        </h2>
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Last fired</TableHead>
                <TableHead className="text-right">24h fires</TableHead>
                <TableHead className="text-right">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directives.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-neutral-500 py-8 text-center"
                  >
                    No AI workflows. Author one above to get started.
                  </TableCell>
                </TableRow>
              )}
              {directives.map((d) => {
                const lastFired = lastFiredFor(d.id, invocations);
                const fires24h = fires24hFor(d.id, invocations, now_ms);
                return (
                  <TableRow
                    key={`${d.code}-${d.organization_id ?? "platform"}`}
                    data-enabled={d.enabled}
                    className={d.enabled ? "" : "opacity-50"}
                  >
                    <TableCell className="font-mono text-xs">{d.code}</TableCell>
                    <TableCell className="font-medium">{d.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {d.trigger_kind}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {d.action_kind}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-neutral-600">
                      {ORIGIN_LABEL[d.origin]}
                    </TableCell>
                    <TableCell className="text-right text-xs text-neutral-500 tabular-nums">
                      {lastFired
                        ? new Date(lastFired).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fires24h}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={directiveFormAction}>
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="code" value={d.code} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={d.enabled ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          aria-checked={d.enabled}
                          aria-label={`Toggle ${d.code} ${d.enabled ? "off" : "on"}`}
                          className={`inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                            d.enabled
                              ? "bg-neutral-900 border-neutral-900"
                              : "bg-neutral-200 border-neutral-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              d.enabled ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Recent fires
        </h2>
        <p className="text-xs text-neutral-500">
          Last 50 runs across all AI workflows in this org.
        </p>
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Subject</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invocations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-neutral-500 py-8 text-center"
                  >
                    No AI workflow runs yet. Triggers will populate this as
                    your data flows in.
                  </TableCell>
                </TableRow>
              )}
              {invocations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-xs text-neutral-500 tabular-nums">
                    {new Date(inv.ts).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{inv.code}</TableCell>
                  <TableCell className="text-sm">{inv.display_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={OUTCOME_BADGE[inv.outcome] ?? "outline"}
                      className="font-mono text-[10px]"
                    >
                      {inv.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-neutral-500">
                    {inv.subject_node_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
