import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getVoiceIqSecretStatus } from "@/lib/integrations/voice-iq/secret";
import { listVoiceIqDeliveries } from "@/lib/integrations/voice-iq/delivery-log";
import { CopyButton, PingButton, RotateSecretButton } from "./voice-iq-form";

export const dynamic = "force-dynamic";

const PERMISSION = "integrations:voice_iq:manage" as const;

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function inboxUrl(): string {
  return `${appBase()}/api/events/inbox`;
}

function lookupUrl(): string {
  return `${appBase()}/api/admin/leads/lookup`;
}

function statusBadgeVariant(
  status: "ok" | "deduped" | "rejected" | "error"
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "ok") return "default";
  if (status === "deduped") return "secondary";
  if (status === "rejected") return "outline";
  return "destructive";
}

export default async function VoiceIqIntegrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has(PERMISSION)) {
    redirect("/403");
  }

  const [secret, deliveries] = await Promise.all([
    getVoiceIqSecretStatus(user.org_id),
    listVoiceIqDeliveries(user.org_id, 50),
  ]);

  const url = inboxUrl();
  const lookup = lookupUrl();
  const sourceLabel: Record<typeof secret.source, string> = {
    org: "per-org rotation",
    platform: "platform default",
    env: "env fallback",
    none: "not configured",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Voice IQ integration
        </h1>
        <p className="text-sm text-neutral-600">
          Inbound webhook from Voice IQ that turns each call analysis into a
          BANT-scored canvas update on the right lead. Configure the inbox URL
          + HMAC secret in Voice IQ&apos;s CRM connector, then send a test ping
          to verify the round-trip.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Inbox URL
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-neutral-50 px-2 py-1.5 text-xs font-mono break-all">
                  {url}
                </code>
                <CopyButton value={url} />
              </div>
              <p className="text-xs text-neutral-500">
                Voice IQ POSTs JSON envelopes here, HMAC-SHA256 signed in the{" "}
                <code className="font-mono">x-builtrix-signature</code> header.
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Lookup URL <span className="text-neutral-400">(read)</span>
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-neutral-50 px-2 py-1.5 text-xs font-mono break-all">
                  {lookup}
                </code>
                <CopyButton value={lookup} />
              </div>
              <p className="text-xs text-neutral-500">
                Voice IQ calls{" "}
                <code className="font-mono">
                  GET ?external_id=&amp;phone=&amp;org_id=
                </code>{" "}
                with{" "}
                <code className="font-mono">Authorization: Bearer &lt;secret&gt;</code>{" "}
                to resolve a lead before posting{" "}
                <code className="font-mono">call.audited</code>.
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                HMAC secret
              </p>
              <div className="flex items-center gap-3">
                {secret.is_set ? (
                  <Badge variant="secondary" className="font-mono">
                    ····{secret.last4}
                  </Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
                <span className="text-xs text-neutral-500">
                  {sourceLabel[secret.source]}
                </span>
              </div>
              {secret.rotated_at && (
                <p className="text-xs text-neutral-500">
                  Last rotated {new Date(secret.rotated_at).toLocaleString()}
                </p>
              )}
              <div className="pt-2">
                <RotateSecretButton />
              </div>
              <p className="text-xs text-neutral-500">
                Rotation generates a 32-byte hex secret, invalidates the cache,
                and writes one audit row. Existing-secret deliveries fail until
                Voice IQ&apos;s connector is updated.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test ping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">
              Sends a synthetic <code className="font-mono">call.audited</code>{" "}
              v2 envelope signed with the current secret. Round-trip latency
              and HTTP status are reported back so you can verify the wiring.
            </p>
            <PingButton />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Delivery log
            </h2>
            <p className="text-xs text-neutral-500">
              Last 50 events from Voice IQ for this org. Hot-loads on every
              page visit.
            </p>
          </div>
        </header>

        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Event id</TableHead>
                <TableHead>Reason / node</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-neutral-500 py-8 text-center text-sm"
                  >
                    No Voice IQ deliveries yet — send a test ping to verify the
                    wiring.
                  </TableCell>
                </TableRow>
              )}
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs text-neutral-600 whitespace-nowrap">
                    {new Date(d.ts).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {d.event_kind}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(d.status)}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-neutral-600 max-w-[180px] truncate">
                    {d.event_id}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-600 max-w-[260px] truncate">
                    {d.reason ?? d.resulting_node_id ?? ""}
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
