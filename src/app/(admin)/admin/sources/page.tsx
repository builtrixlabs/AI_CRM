import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listEndpointsForOrg } from "@/lib/sources/webform/tokens";
import { sourcesFormAction } from "./actions";
import { IssueEndpointDialog } from "./issue-endpoint-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function AdminSourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("sources:manage")) redirect("/403");

  const endpoints = await listEndpointsForOrg(user.org_id);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Lead sources</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Webform endpoints — issue a token, then POST leads to{" "}
          <code>/api/leads/ingest/&lt;token&gt;</code>. Tokens are shown once
          on creation; revoke + reissue if you need to rotate.
        </p>
      </header>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Webform endpoints</h2>
          <IssueEndpointDialog />
        </div>
        <Separator className="my-3" />
        <ul data-testid="webform-endpoints-list" className="space-y-2">
          {endpoints.length === 0 ? (
            <li className="text-sm text-neutral-500">
              No webform endpoints yet. Issue one above to start receiving leads.
            </li>
          ) : (
            endpoints.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {e.label}{" "}
                    {!e.is_active && (
                      <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">
                        revoked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono">
                    {e.token_prefix}…
                  </div>
                  <div className="text-xs text-neutral-500">
                    {e.received_count} lead(s) ·{" "}
                    {e.last_received_at
                      ? `last ${dateFmt.format(new Date(e.last_received_at))}`
                      : "no traffic yet"}{" "}
                    · created {dateFmt.format(new Date(e.created_at))}
                  </div>
                </div>
                {e.is_active && (
                  <form action={sourcesFormAction}>
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={e.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      data-testid={`endpoint-revoke-${e.id}`}
                    >
                      Revoke
                    </Button>
                  </form>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
