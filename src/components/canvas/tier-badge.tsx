import type { AgentTier } from "@/lib/canvas/types";
import { Badge } from "@/components/ui/badge";

const TIER_COLOR: Record<AgentTier, string> = {
  T0: "bg-neutral-200 text-neutral-800",
  T1: "bg-blue-100 text-blue-900",
  T2: "bg-emerald-100 text-emerald-900",
  T3: "bg-amber-100 text-amber-900",
  T4: "bg-rose-100 text-rose-900",
};

export function TierBadge({ tier }: { tier: AgentTier | null }) {
  if (!tier) return null;
  return (
    <Badge
      data-testid="tier-badge"
      data-tier={tier}
      className={`${TIER_COLOR[tier]} border-transparent`}
    >
      {tier}
    </Badge>
  );
}
