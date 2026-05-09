import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listFlags } from "@/lib/platform/flags";
import { FlagEditor } from "./flag-row";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const flags = await listFlags();

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform settings
        </h1>
        <p className="text-sm text-neutral-600">
          Global feature flags + system constants. Every change writes one
          audit_log row.
        </p>
      </header>

      <div className="space-y-4">
        {flags.length === 0 && (
          <Card>
            <CardContent className="py-6 text-sm text-neutral-600">
              No flags seeded yet — run the migration to populate defaults.
            </CardContent>
          </Card>
        )}
        {flags.map((row) => (
          <Card key={row.key}>
            <CardHeader>
              <CardTitle className="text-base font-mono">{row.key}</CardTitle>
              {row.description && (
                <p className="text-xs text-neutral-600">{row.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <FlagEditor row={row} />
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                Last updated {new Date(row.updated_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
