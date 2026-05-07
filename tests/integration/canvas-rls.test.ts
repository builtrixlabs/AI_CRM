/**
 * D-006 / canvas-rls — RLS isolation for getLeadCanvas across tenants.
 * Spec AC-19 (cross-tenant returns null), AC-14 (defense-in-depth at the
 * data layer; the canvas API returns null because the underlying SELECT
 * is filtered by app_org_id()).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeadCanvas } from "@/lib/canvas/api";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  provisionWorkspace,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `canvas-rls-a-${Date.now()}`;
const SLUG_B = `canvas-rls-b-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let leadAId: string;
let activityId: string;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");

  repA = await provisionUser({
    email: `canvas-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `canvas-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });

  // Seed a lead + an activity in workspace A, joined by an edge.
  const { data: leadRow, error: leadErr } = await adminClient
    .from("nodes")
    .insert({
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "lead",
      label: "Priya Sharma (RLS test)",
      data: { phone: "+91-9000000001", source: "magicbricks", intent_score: 70 },
      state: "qualified",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (leadErr) throw leadErr;
  leadAId = leadRow.id;

  const { data: activityRow, error: actErr } = await adminClient
    .from("nodes")
    .insert({
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "activity",
      label: "WhatsApp inbound",
      data: { kind: "whatsapp_inbound", text: "ping" },
      state: null,
      created_by: SYSTEM_UUID,
      created_via: "whatsapp",
      updated_by: SYSTEM_UUID,
      updated_via: "whatsapp",
    })
    .select("id")
    .single();
  if (actErr) throw actErr;
  activityId = activityRow.id;

  const { error: edgeErr } = await adminClient.from("edges").insert({
    organization_id: orgA,
    workspace_id: wsA,
    from_node_id: activityId,
    to_node_id: leadAId,
    edge_type: "mentioned_in",
    weight: 1,
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (edgeErr) throw edgeErr;
}, 90_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  // Best-effort: edges first, then nodes (audit_log immutability prevents
  // cleanly removing the parent org if any audit rows landed).
  await adminClient.from("edges").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 60_000);

describe("getLeadCanvas RLS — cross-tenant isolation", () => {
  it("rep A reads their own lead — gets canvas data with the activity", async () => {
    const c = await userClient(repA);
    const data = await getLeadCanvas(leadAId, c);
    expect(data).not.toBeNull();
    expect(data!.lead.id).toBe(leadAId);
    expect(data!.lead.organization_id).toBe(orgA);
    expect(data!.activities.length).toBe(1);
    expect(data!.activities[0]!.id).toBe(activityId);
  }, 60_000);

  it("rep B (different tenant) reads rep A's lead — null (RLS hides existence)", async () => {
    const c = await userClient(repB);
    const data = await getLeadCanvas(leadAId, c);
    expect(data).toBeNull();
  }, 60_000);

  it("rep A reads a non-existent lead — null", async () => {
    const c = await userClient(repA);
    const data = await getLeadCanvas(
      "00000000-0000-4000-8000-000000000000",
      c,
    );
    expect(data).toBeNull();
  }, 60_000);
});
