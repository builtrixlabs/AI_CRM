/**
 * Authoritative node / edge / signal type literals for the graph data model.
 * These ratify into baseline/110-graph-data-model.md at the end of D-002 and
 * cannot change without an amendment directive (Constitution VI).
 */

export const NODE_TYPES = [
  "lead",
  "contact",
  "deal",
  // RE inventory hierarchy (D-420). `property` retained for backward compat
  // with D-320 catalog rows; new inventory created under `project` + `tower`.
  "project",
  "tower",
  "property",
  "unit",
  "site_visit",
  "call",
  "activity",
  "document",
  "note",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  "belongs_to",
  "related_to",
  "sourced_from",
  "attended",
  "mentioned_in",
  "duplicate_of",
  "merged_into",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

export const SIGNAL_TYPES = [
  "intent",
  "engagement",
  "budget_match",
  "velocity",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const CREATED_VIA = [
  "manual",
  "call_audit",
  "whatsapp",
  "email",
  "api_sync",
  "ai_extraction",
  "import",
  "cp_portal",
  "mih_event",
  "system",
] as const;

export type CreatedVia = (typeof CREATED_VIA)[number];

/**
 * Reserved subkey on every node's `data` jsonb for L1 custom fields (D-112).
 * Type-level docs only — schemas don't enforce its shape until D-112 ships
 * the custom_fields metadata table.
 */
export const CUSTOM_FIELDS_KEY = "custom" as const;
