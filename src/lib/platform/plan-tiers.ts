export type PlanTier = "starter" | "professional" | "enterprise" | "custom";

export type PlanTierLimits = {
  tier: PlanTier;
  display_name: string;
  monthly_price_inr: number | null; // null = "per contract"
  max_users: number;
  max_active_properties: number;
  max_bookings_per_month: number;
  max_channel_partners: number;
  features: string[];
};

/**
 * Hardcoded plan-tier reference for v2 demo. Real plan-CRUD table lands V3
 * (per directive 203 non-goals).
 */
export const PLAN_TIERS: Record<PlanTier, PlanTierLimits> = {
  starter: {
    tier: "starter",
    display_name: "Starter",
    monthly_price_inr: 0,
    max_users: 5,
    max_active_properties: 1,
    max_bookings_per_month: 50,
    max_channel_partners: 5,
    features: ["Lead canvas", "WhatsApp inbound", "Basic dashboards"],
  },
  professional: {
    tier: "professional",
    display_name: "Professional",
    monthly_price_inr: 14999,
    max_users: 25,
    max_active_properties: 10,
    max_bookings_per_month: 500,
    max_channel_partners: 50,
    features: [
      "Everything in Starter",
      "Voice IQ integration",
      "Custom dashboards + tables",
      "Stale-lead watcher",
    ],
  },
  enterprise: {
    tier: "enterprise",
    display_name: "Enterprise",
    monthly_price_inr: 49999,
    max_users: 999,
    max_active_properties: 999,
    max_bookings_per_month: 9999,
    max_channel_partners: 999,
    features: [
      "Everything in Professional",
      "Multi-workspace",
      "Custom outbound agents (T3)",
      "SOC2 audit log export",
      "Priority support",
    ],
  },
  custom: {
    tier: "custom",
    display_name: "Custom",
    monthly_price_inr: null,
    max_users: 0,
    max_active_properties: 0,
    max_bookings_per_month: 0,
    max_channel_partners: 0,
    features: ["Per-contract limits & features"],
  },
};

export const PLAN_TIER_ORDER: PlanTier[] = [
  "starter",
  "professional",
  "enterprise",
  "custom",
];
