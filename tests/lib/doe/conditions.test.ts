import { describe, expect, it } from "vitest";
import { evaluateCondition } from "@/lib/doe/conditions";
import type { DirectiveRow, Trigger } from "@/lib/doe/types";

const ORG = "11111111-2222-4333-8444-555555555555";

function row(partial: Partial<DirectiveRow>): DirectiveRow {
  return {
    id: partial.id ?? "dir-1",
    organization_id: partial.organization_id ?? null,
    code: partial.code ?? "D-XX",
    display_name: partial.display_name ?? "Test directive",
    trigger_kind: partial.trigger_kind ?? "lead.created",
    trigger_config: partial.trigger_config ?? {},
    action_kind: partial.action_kind ?? "surface_on_canvas",
    action_config: partial.action_config ?? {},
    tier: partial.tier ?? "T0",
    enabled: partial.enabled ?? true,
  };
}

function trig(partial: Partial<Trigger>): Trigger {
  return {
    kind: partial.kind ?? "lead.created",
    trigger_id: partial.trigger_id ?? "t-1",
    organization_id: partial.organization_id ?? ORG,
    workspace_id: partial.workspace_id ?? null,
    subject_node_id: partial.subject_node_id ?? null,
    payload: partial.payload ?? {},
  };
}

describe("evaluateCondition", () => {
  it("returns ok when no constraints are set", () => {
    expect(evaluateCondition(row({}), trig({}))).toEqual({ ok: true });
  });

  it("matches exact `to` state", () => {
    const d = row({ trigger_config: { to: "negotiation" } });
    expect(evaluateCondition(d, trig({ payload: { to: "negotiation" } }))).toEqual({ ok: true });
    expect(evaluateCondition(d, trig({ payload: { to: "qualified" } })).ok).toBe(false);
  });

  it("matches exact `source` (D-15 walk-in)", () => {
    const d = row({ trigger_config: { source: "walkin" } });
    expect(evaluateCondition(d, trig({ payload: { source: "walkin" } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { source: "magicbricks" } })).ok).toBe(false);
  });

  it("respects threshold (gte)", () => {
    const d = row({ trigger_config: { threshold: 75 } });
    expect(evaluateCondition(d, trig({ payload: { value: 75 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { value: 76 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { value: 50 } })).ok).toBe(false);
    expect(evaluateCondition(d, trig({ payload: {} })).ok).toBe(false);
  });

  it("uses `score` when `value` is absent", () => {
    const d = row({ trigger_config: { threshold: 80 } });
    expect(evaluateCondition(d, trig({ payload: { score: 85 } })).ok).toBe(true);
  });

  it("respects min_score (D-14 senior rep route)", () => {
    const d = row({ trigger_config: { min_score: 80 } });
    expect(evaluateCondition(d, trig({ payload: { score: 90 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { score: 60 } })).ok).toBe(false);
  });

  it("respects idle_hours (gte)", () => {
    const d = row({ trigger_config: { idle_hours: 24 } });
    expect(evaluateCondition(d, trig({ payload: { idle_hours: 25 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { idle_hours: 23 } })).ok).toBe(false);
  });

  it("respects hours_until window (D-03/D-04)", () => {
    const d = row({ trigger_config: { hours_until: 24 } });
    expect(evaluateCondition(d, trig({ payload: { hours_until: 24 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { hours_until: 24.4 } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { hours_until: 23 } })).ok).toBe(false);
  });

  it("rejects when objection mismatches (D-09 price-only)", () => {
    const d = row({ trigger_config: { objection: "price" } });
    expect(evaluateCondition(d, trig({ payload: { objection: "price" } })).ok).toBe(true);
    expect(evaluateCondition(d, trig({ payload: { objection: "amenity" } })).ok).toBe(false);
  });
});
