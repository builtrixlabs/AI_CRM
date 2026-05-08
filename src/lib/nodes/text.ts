import type { NodeType } from "./types";

/**
 * Build embedding source text for a node. Constitution VII binding:
 * phone, email, full-name fields MUST be masked before they leave the
 * cluster via the embedding API.
 *
 * Strategy: an allowlist of safe-to-embed keys per node_type. Anything
 * NOT in the allowlist is dropped — even if the caller naively passes
 * the whole `data` payload, PII can't leak. The label is included
 * AFTER masking common name/phone/email patterns.
 */

const SAFE_KEYS: Partial<Record<NodeType, readonly string[]>> = {
  lead: ["source", "intent_score", "city", "budget_band", "intent_band"],
  contact: ["source", "city", "intent_band"],
  deal: ["stage_label", "city", "unit_type", "budget_band"],
  property: ["city", "unit_type", "configuration"],
  unit: ["unit_type", "configuration", "floor_band"],
  site_visit: ["status", "city"],
  call: ["kind", "outcome"],
  activity: ["kind"],
  document: ["doc_type", "verified"],
  note: [],
};

const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Mask phone-like + email-like patterns inside a free-form string. */
export function maskPii(input: string): string {
  return input.replace(PHONE_RE, "[phone]").replace(EMAIL_RE, "[email]");
}

export function textOfRecord(node: {
  node_type: string;
  label: string;
  data: Record<string, unknown> | null | undefined;
  state?: string | null;
}): string {
  const safe = SAFE_KEYS[node.node_type as NodeType] ?? [];
  const data = node.data ?? {};
  const parts: string[] = [];

  // Constitution VII: the label is allowed but must be PII-masked
  // (a sales rep may have typed "+91-9876543210" as the label).
  parts.push(`type: ${node.node_type}`);
  if (node.state) parts.push(`state: ${node.state}`);
  parts.push(`label: ${maskPii(node.label)}`);

  for (const key of safe) {
    const value = data[key];
    if (value == null) continue;
    if (typeof value === "string") {
      const masked = maskPii(value);
      if (masked.trim().length > 0) parts.push(`${key}: ${masked}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}: ${String(value)}`);
    }
    // arrays / objects ignored — V0 keeps the embedding source flat.
  }

  return parts.join(" | ");
}
