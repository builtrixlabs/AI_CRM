import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listSecretStatus } from "@/lib/secrets/queries";
import { SecretsTable } from "./secret-form";

export const dynamic = "force-dynamic";

export default async function PlatformSecretsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const rows = await listSecretStatus();

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform secrets
        </h1>
        <p className="text-sm text-neutral-600">
          Provider API keys + webhook signing secrets used by the AI runtime.
          Values stored in <code className="font-mono">platform_secrets</code>{" "}
          take priority over Vercel environment variables. Last-4 of saved
          values shown for verification; full values are write-only.
        </p>
      </header>

      <SecretsTable rows={rows} />

      <section className="text-xs text-neutral-500 space-y-1">
        <p>
          <strong>Resolution order at runtime:</strong> DB row →{" "}
          <code className="font-mono">process.env</code> fallback → boot
          error.
        </p>
        <p>
          Every save writes one{" "}
          <code className="font-mono">audit_log</code> row with{" "}
          <code className="font-mono">action=&apos;platform_secret_rotated&apos;</code>;
          the raw value is never logged.
        </p>
      </section>
    </div>
  );
}
