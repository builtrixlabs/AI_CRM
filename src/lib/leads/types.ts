/**
 * Lead state catalog. Single source of truth for the LeadState type.
 *
 * Mirrors `ALLOWED_STATES.lead` from `src/lib/nodes/states.ts` (D-002).
 * The catalog is asserted equal in tests/lib/leads/transitions.test.ts
 * to prevent drift between the node-states module and the lead-domain
 * lifecycle.
 */
export const LEAD_STATES = [
  "new",
  "contacted",
  "qualified",
  "lost",
  "on_hold",
  "junk",
] as const;

export type LeadState = (typeof LEAD_STATES)[number];
