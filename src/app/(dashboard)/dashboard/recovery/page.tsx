import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listRecoveryQueue } from "@/lib/recovery/queue";
import { RECOVERY_REASONS, type RecoveryListBucket, type RecoveryReason } from "@/lib/recovery/types";
import { RecoveryFilterBar } from "@/components/recovery/recovery-filter-bar";
import { RecoveryQueueTable } from "@/components/recovery/recovery-queue-table";

export const dynamic = "force-dynamic";

const VALID_BUCKETS: ReadonlySet<RecoveryListBucket> = new Set<RecoveryListBucket>([
  "open",
  "mine",
  "resolved",
]);
const VALID_REASONS: ReadonlySet<RecoveryReason> = new Set(RECOVERY_REASONS);

/**
 * D-616 — /dashboard/recovery. The customer-recovery rep's primary
 * surface. Mirrors the /dashboard/site-visits list-page shape.
 */
export default async function RecoveryPage(props: {
  searchParams: Promise<{ bucket?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return (
      <main className="mx-auto max-w-5xl p-12">
        <p className="text-sm text-muted-foreground">
          Your account is not yet linked to an organization. Contact your admin.
        </p>
      </main>
    );
  }
  const perms = resolveForUser(user);
  if (!perms.has("recovery:view")) redirect("/403");

  const sp = await props.searchParams;
  const bucket: RecoveryListBucket =
    sp.bucket && VALID_BUCKETS.has(sp.bucket as RecoveryListBucket)
      ? (sp.bucket as RecoveryListBucket)
      : "open";
  const reason: RecoveryReason | undefined =
    sp.reason && VALID_REASONS.has(sp.reason as RecoveryReason)
      ? (sp.reason as RecoveryReason)
      : undefined;

  const rows = await listRecoveryQueue({
    organization_id: user.org_id,
    viewer_id: user.user.id,
    filters: { bucket, reason },
  });

  const canClaim = perms.has("recovery:claim");
  const canResolve = perms.has("recovery:resolve");

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="recovery-title"
        >
          Customer Recovery
        </h1>
        <p className="text-sm text-muted-foreground">
          Cold and lost leads queued for a re-engagement attempt. Claim a row to
          work it, resolve it when you have an outcome.
        </p>
      </header>

      <RecoveryFilterBar />

      <RecoveryQueueTable
        rows={rows}
        viewerId={user.user.id}
        canClaim={canClaim}
        canResolve={canResolve}
      />
    </main>
  );
}
