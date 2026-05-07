/**
 * D-007 / lead-create-edit-transition — integration covering AC-6, AC-9,
 * AC-15, AC-17 against the real Supabase project.
 *
 * Flow:
 *   1. seed sales_rep + workspace_id + bridge row
 *   2. createLead → assert nodes row + audit row (action='node_create')
 *   3. updateLead via D-002's updateNodeData → assert state untouched,
 *      data merged, audit row (action='node_update')
 *   4. transition new → contacted → qualified → lost(reason)
 *      → assert state changes, 3 audit rows with diff: { from, to, reason? }
 *   5. cross-tenant rep can't transition the lead
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLead, transitionLead } from "@/lib/leads/api";
import { updateNodeData } from "@/lib/nodes/api";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  provisionWorkspace,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `d007-a-${Date.now()}`;
const SLUG_B = `d007-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let leadId: string;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");
  repA = await provisionUser({
    email: `d007-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-d007-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `d007-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-d007-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });
}, 90_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 60_000);

describe("D-007 lead lifecycle integration", () => {
  it("createLead → inserts a 'new' lead row + writes one audit row", async () => {
    const result = await createLead({
      organization_id: orgA,
      workspace_id: wsA,
      created_by: repA.user_id,
      data: {
        phone: "+91-9000077777",
        source: "magicbricks",
        notes: "RERA-tagged lead",
      },
    });
    leadId = result.id;
    expect(leadId).toMatch(/[0-9a-f-]{36}/i);

    const node = await adminClient
      .from("nodes")
      .select("id, node_type, state, data, organization_id, workspace_id, created_via, created_by")
      .eq("id", leadId)
      .single();
    expect(node.error).toBeNull();
    expect(node.data!.node_type).toBe("lead");
    expect(node.data!.state).toBe("new");
    expect(node.data!.organization_id).toBe(orgA);
    expect(node.data!.workspace_id).toBe(wsA);
    expect(node.data!.created_via).toBe("manual");
    expect(node.data!.created_by).toBe(repA.user_id);

    const audit = await adminClient
      .from("audit_log")
      .select("action, actor_id, record_id, table_name")
      .eq("record_id", leadId)
      .eq("action", "node_create");
    expect((audit.data ?? []).length).toBe(1);
  }, 60_000);

  it("updateNodeData → updates data + writes one audit row (action='node_update')", async () => {
    await updateNodeData({
      id: leadId,
      partial: { notes: "follow-up scheduled" },
      updated_by: repA.user_id,
      updated_via: "manual",
    });
    const node = await adminClient
      .from("nodes")
      .select("data, state")
      .eq("id", leadId)
      .single();
    expect((node.data!.data as { notes?: string }).notes).toBe(
      "follow-up scheduled",
    );
    expect(node.data!.state).toBe("new"); // state untouched

    const audit = await adminClient
      .from("audit_log")
      .select("action")
      .eq("record_id", leadId)
      .eq("action", "node_update");
    expect((audit.data ?? []).length).toBe(1);
  }, 60_000);

  it("transition new → contacted writes audit row with diff:{from,to}", async () => {
    await transitionLead({
      lead_id: leadId,
      target_state: "contacted",
      actor: repA.user_id,
      caller_org_id: orgA,
    });
    const node = await adminClient
      .from("nodes")
      .select("state")
      .eq("id", leadId)
      .single();
    expect(node.data!.state).toBe("contacted");

    const audit = await adminClient
      .from("audit_log")
      .select("action, diff")
      .eq("record_id", leadId)
      .eq("action", "state_change")
      .order("ts", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data!.diff).toEqual({ from: "new", to: "contacted" });
  }, 60_000);

  it("transition contacted → qualified", async () => {
    await transitionLead({
      lead_id: leadId,
      target_state: "qualified",
      actor: repA.user_id,
      caller_org_id: orgA,
    });
    const node = await adminClient
      .from("nodes")
      .select("state")
      .eq("id", leadId)
      .single();
    expect(node.data!.state).toBe("qualified");
  }, 60_000);

  it("transition qualified → lost(reason) writes diff:{from,to,reason}", async () => {
    await transitionLead({
      lead_id: leadId,
      target_state: "lost",
      actor: repA.user_id,
      caller_org_id: orgA,
      reason: "duplicate of #4221",
    });
    const node = await adminClient
      .from("nodes")
      .select("state")
      .eq("id", leadId)
      .single();
    expect(node.data!.state).toBe("lost");

    const audit = await adminClient
      .from("audit_log")
      .select("action, diff")
      .eq("record_id", leadId)
      .eq("action", "state_change")
      .order("ts", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data!.diff).toEqual({
      from: "qualified",
      to: "lost",
      reason: "duplicate of #4221",
    });
  }, 60_000);

  it("illegal transition (lost → new) throws IllegalTransitionError", async () => {
    await expect(
      transitionLead({
        lead_id: leadId,
        target_state: "new",
        caller_org_id: orgA,
        actor: repA.user_id,
      }),
    ).rejects.toThrow(/Illegal/i);
  }, 60_000);

  it("cross-tenant: transitionLead with mismatched caller_org_id rejects with 'not found' and DB unchanged", async () => {
    // Seed a lead in Org B; rep A (Org A) attempts to transition it.
    const seeded = await adminClient
      .from("nodes")
      .insert({
        organization_id: orgB,
        workspace_id: wsB,
        node_type: "lead",
        label: "Rep B lead",
        data: { phone: "+91-9111111111", source: "walkin" },
        state: "new",
        created_by: repB.user_id,
        created_via: "manual",
        updated_by: repB.user_id,
        updated_via: "manual",
      })
      .select("id")
      .single();
    const otherLeadId = (seeded.data as { id: string }).id;

    // Tenant-isolation contract (D-007.9): the helper filters by
    // caller_org_id. Rep A (Org A) supplying Org B's lead_id must be
    // rejected with "not found" — no existence leak, no mutation.
    await expect(
      transitionLead({
        lead_id: otherLeadId,
        target_state: "contacted",
        actor: repA.user_id,
        caller_org_id: orgA,
      }),
    ).rejects.toThrow(/not found/i);

    // Sanity: the lead's state is unchanged.
    const node = await adminClient
      .from("nodes")
      .select("state")
      .eq("id", otherLeadId)
      .single();
    expect(node.data!.state).toBe("new");

    // And the legitimate owner can still transition it.
    await transitionLead({
      lead_id: otherLeadId,
      target_state: "contacted",
      actor: repB.user_id,
      caller_org_id: orgB,
    });
    const node2 = await adminClient
      .from("nodes")
      .select("state")
      .eq("id", otherLeadId)
      .single();
    expect(node2.data!.state).toBe("contacted");
  }, 60_000);
});
