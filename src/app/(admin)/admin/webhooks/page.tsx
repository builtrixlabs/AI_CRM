import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { listDeliveries, listEndpoints } from "@/lib/admin/webhooks";
import { createWebhookAction } from "./actions";
import { StatusBadge, WebhookRowActions } from "./webhook-list";

export const dynamic = "force-dynamic";

const SUBSCRIBABLE_EVENTS = [
  "lead.created",
  "lead.state_changed",
  "deal.state_changed",
  "site_visit.state_changed",
  "call.audited",
];

export default async function WebhooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("settings:manage_integrations")) {
    redirect("/403");
  }
  const orgId: string = user.org_id;

  const endpoints = await listEndpoints(orgId);
  // Pull deliveries for the first few endpoints so the page renders something
  // useful even before "send test" is clicked.
  const deliveries = await Promise.all(
    endpoints.slice(0, 3).map((e) => listDeliveries(e.id, orgId, 5))
  );

  // Server Action wrapper that returns void (Next.js form-action contract).
  async function createWebhookFormAction(formData: FormData): Promise<void> {
    "use server";
    await createWebhookAction(formData);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-neutral-600">
          Outbound webhook endpoints. Real delivery worker is V3 — for v2 the
          &quot;Send test&quot; button writes a synthetic delivery row so you
          can see the surface end-to-end.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWebhookFormAction} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="webhook-name">Name</Label>
              <Input id="webhook-name" name="name" minLength={2} maxLength={80} required placeholder="Sales pipeline → Slack" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="webhook-url">URL</Label>
              <Input id="webhook-url" name="url" type="url" required placeholder="https://hooks.example.com/builtrix" />
            </div>
            <div className="space-y-1">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-2 text-sm">
                {SUBSCRIBABLE_EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-2 rounded-md border bg-white px-2 py-1">
                    <input type="checkbox" name="event" value={e} defaultChecked={e === "lead.created"} />
                    <span className="font-mono text-xs">{e}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Button type="submit">Create endpoint</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Registered endpoints
        </h2>
        {endpoints.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-neutral-600">
              No webhooks registered yet. Use the form above.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs break-all max-w-[260px]">
                      {row.url}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-600">
                      {row.events_subscribed.join(", ")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      ····{row.secret_last4}
                    </TableCell>
                    <TableCell>
                      <StatusBadge enabled={row.enabled} />
                    </TableCell>
                    <TableCell>
                      <WebhookRowActions row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {endpoints.slice(0, 3).map(async (e, i) => {
        const rows = deliveries[i] ?? [];
        return (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="text-base">
                Recent deliveries — {e.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  No deliveries yet. Click &quot;Send test&quot; to write a
                  stub row.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {rows.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between rounded-md border bg-white px-3 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <code className="font-mono text-xs">{d.event_kind}</code>
                        <span className="text-xs text-neutral-500">
                          {new Date(d.ts).toLocaleString()}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className="font-mono">HTTP {d.status_code}</span>
                        <span className="text-neutral-500">
                          {d.latency_ms ?? "—"}ms
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
