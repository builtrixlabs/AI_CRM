import { Badge } from "@/components/ui/badge";

export type ComplianceProps = {
  rera_number?: string | null;
  gstin?: string | null;
  /** When true, condense to icon-only badges (used on list rows). */
  compact?: boolean;
};

function tail(value: string, n = 4): string {
  if (value.length <= n) return value;
  return value.slice(-n);
}

/**
 * Render RERA + GSTIN compliance status as a pair of badges.
 *
 * Real-estate-specific: RERA registration is non-negotiable for any
 * builder/broker selling apartments in India; GSTIN is the tax id for
 * billing. Both are captured at org-provision time (org_details onboarding
 * step) and visible from this single component everywhere.
 *
 * Set state: green-tint badge with last-4 of the value.
 * Unset state: neutral outline badge with "missing".
 */
export function ComplianceBadges({
  rera_number,
  gstin,
  compact = false,
}: ComplianceProps) {
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label="Org compliance status"
    >
      <Badge
        variant={rera_number ? "default" : "outline"}
        className={
          rera_number
            ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
            : "text-neutral-600"
        }
        aria-label={
          rera_number ? `RERA registered, ends in ${tail(rera_number)}` : "RERA missing"
        }
        title={rera_number ?? undefined}
      >
        {compact
          ? rera_number
            ? "RERA ✓"
            : "RERA ✗"
          : rera_number
            ? `RERA · ${tail(rera_number)}`
            : "RERA missing"}
      </Badge>
      <Badge
        variant={gstin ? "default" : "outline"}
        className={
          gstin
            ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
            : "text-neutral-600"
        }
        aria-label={gstin ? `GSTIN on file, ends in ${tail(gstin)}` : "GSTIN missing"}
        title={gstin ?? undefined}
      >
        {compact
          ? gstin
            ? "GSTIN ✓"
            : "GSTIN ✗"
          : gstin
            ? `GSTIN · ${tail(gstin)}`
            : "GSTIN missing"}
      </Badge>
    </div>
  );
}
