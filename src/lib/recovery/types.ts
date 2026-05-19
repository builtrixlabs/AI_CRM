/**
 * D-616 — Customer Recovery Team queue.
 *
 * Closed catalogs for the queue's reason + resolution enums. Both are
 * mirrored in the migration's CHECK constraints; a vitest in
 * tests/lib/recovery/sweep.test.ts pins the literal arrays so drift
 * between TS + SQL is caught at unit-test time.
 */

export const RECOVERY_REASONS = [
  "lost",
  "on_hold",
  "stale_contacted",
  "stale_qualified",
] as const;

export type RecoveryReason = (typeof RECOVERY_REASONS)[number];

export const RECOVERY_RESOLUTIONS = [
  "won_back",
  "unreachable",
  "confirmed_lost",
] as const;

export type RecoveryResolution = (typeof RECOVERY_RESOLUTIONS)[number];

/** Stale threshold for contacted/qualified leads (D-322 covers the 7-day
 *  window on new/contacted; D-616 picks up at 14d for the deeper recovery
 *  window). Exported so tests + future per-org overrides reference one
 *  constant. */
export const STALE_RECOVERY_DAYS = 14;

export type RecoveryQueueRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  recovery_reason: RecoveryReason;
  added_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  resolution: RecoveryResolution | null;
  note: string | null;
};

export type RecoveryQueueListRow = RecoveryQueueRow & {
  /** Joined from nodes.label for the table render. */
  lead_label: string | null;
  /** Joined from nodes.state — read-only context. */
  lead_state: string | null;
};

export type RecoveryListBucket = "open" | "mine" | "resolved";

export type RecoveryListFilters = {
  bucket: RecoveryListBucket;
  reason?: RecoveryReason;
};
