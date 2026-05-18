import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSystemHealth } from "@/lib/admin/system-health";

export const dynamic = "force-dynamic";

const POSTURE_TINT: Record<"healthy" | "degraded" | "failing", string> = {
  healthy: "bg-emerald-100 text-emerald-900 border-emerald-200",
  degraded: "bg-amber-100 text-amber-900 border-amber-200",
  failing: "bg-rose-100 text-rose-900 border-rose-200",
};

function ConfiguredBadge({ ok }: { ok: boolean }) {
  return (
    <Badge
      variant={ok ? "default" : "outline"}
      className={
        ok
          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
          : "text-neutral-600"
      }
    >
      {ok ? "Configured" : "Not configured"}
    </Badge>
  );
}

export default async function SystemHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (
    !BASE_ROLE_PERMS[user.profile.base_role].has("audit:view") &&
    user.profile.base_role !== "org_admin" &&
    user.profile.base_role !== "org_owner"
  ) {
    redirect("/403");
  }

  const h = await getSystemHealth(user.org_id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">System health</h1>
        <p className="text-sm text-neutral-600">
          Background jobs + integration status, last 7 days.
        </p>
      </header>

      <div className={`rounded-md border p-4 ${POSTURE_TINT[h.posture]}`}>
        <p className="text-sm font-medium uppercase tracking-wide">
          Posture: {h.posture}
        </p>
        <p className="text-xs">
          {h.failed_directives.count_7d} failed AI workflow runs ·{" "}
          {h.inbox_failures.count_7d} inbox errors · {" "}
          {[h.voice_iq_configured, h.whatsapp_configured, h.email_configured].filter(Boolean).length}/3
          integrations configured
        </p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice IQ</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfiguredBadge ok={h.voice_iq_configured} />
            {!h.voice_iq_configured && (
              <p className="text-xs text-neutral-500 pt-2">
                Wire it from{" "}
                <code className="font-mono">/admin/integrations/voice-iq</code>.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">WhatsApp</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfiguredBadge ok={h.whatsapp_configured} />
            {!h.whatsapp_configured && (
              <p className="text-xs text-neutral-500 pt-2">
                Provider config not yet wired (V3).
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfiguredBadge ok={h.email_configured} />
            <p className="text-xs text-neutral-500 pt-2">
              Email integration lands V3.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Failed AI workflow runs (7d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {h.failed_directives.count_7d === 0 ? (
            <p className="text-sm text-neutral-600">
              No failures in the last 7 days. ✓
            </p>
          ) : (
            <ul className="space-y-2">
              {h.failed_directives.recent.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border bg-white p-3 text-sm"
                >
                  <p className="font-mono text-xs text-neutral-500">
                    {new Date(f.ts).toLocaleString()} ·{" "}
                    {f.directive_id.slice(0, 8)}…
                  </p>
                  <p className="text-neutral-800 pt-1">
                    {f.reason ?? "(no reason recorded)"}
                  </p>
                </li>
              ))}
              {h.failed_directives.count_7d > h.failed_directives.recent.length && (
                <li className="text-xs text-neutral-500">
                  + {h.failed_directives.count_7d - h.failed_directives.recent.length}{" "}
                  more
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
