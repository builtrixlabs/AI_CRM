/**
 * D-002 / B9 — every node mutation writes one audit_log row.
 * Spec AC-19, AC-20.
 *
 * Uses the real createNode / updateNodeData / softDeleteNode APIs against
 * the linked Supabase project. Verifies audit rows have the right action,
 * record_id, and diff shape.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNode, softDeleteNode, updateNodeData } from "@/lib/nodes/api";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionUser,
  provisionWorkspace,
  type ProvisionedUser,
} from "./helpers/setup";

// Unique slug per run — once audit_log has rows referencing this org we can't
// delete the org (audit_log FK + append-only trigger forbid both DELETE and
// the UPDATE that ON DELETE SET NULL would issue).
const SLUG = `test-audit-nodes-${Date.now()}`;

let orgId: string;
let workspaceId: string;
let actor: ProvisionedUser;
let nodeId: string;

beforeAll(async () => {
  await cleanupBySlug(SLUG);
  orgId = await provisionOrg(SLUG);
  workspaceId = await provisionWorkspace(orgId, "ws-audit");
  actor = await provisionUser({
    email: `audit-actor-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-audit",
    base_role: "sales_rep",
    organization_id: orgId,
  });
}, 30_000);

afterAll(async () => {
  await adminClient.from("nodes").delete().eq("organization_id", orgId);
  if (actor) {
    const { error } = await adminClient.auth.admin.deleteUser(actor.user_id);
    if (error) console.warn("audit cleanup deleteUser:", error.message);
  }
  await cleanupBySlug(SLUG);
});

describe("audit_log on node mutations", () => {
  it("AC-19: createNode writes one audit row with action='node_create'", async () => {
    const result = await createNode({
      organization_id: orgId,
      workspace_id: workspaceId,
      node_type: "lead",
      label: "Audit test lead",
      data: { phone: "+919999900088", source: "walkin" },
      state: "new",
      created_by: actor.user_id,
      created_via: "manual",
    });
    nodeId = result.id;

    const { data: rows, error } = await adminClient
      .from("audit_log")
      .select("action, record_id, diff, actor_id")
      .eq("table_name", "nodes")
      .eq("record_id", nodeId);
    expect(error).toBeNull();
    expect(rows?.length).toBe(1);
    expect(rows?.[0].action).toBe("node_create");
    expect(rows?.[0].actor_id).toBe(actor.user_id);
    const diff = rows?.[0].diff as { after: { phone: string } };
    expect(diff.after.phone).toBe("+919999900088");
  });

  it("AC-20: updateNodeData writes audit row with before/after diff", async () => {
    await updateNodeData({
      id: nodeId,
      partial: { notes: "callback Saturday" },
      updated_by: actor.user_id,
    });
    const { data: rows } = await adminClient
      .from("audit_log")
      .select("action, diff")
      .eq("record_id", nodeId)
      .eq("action", "node_update");
    expect(rows?.length).toBe(1);
    const diff = rows?.[0].diff as { before: unknown; after: unknown };
    expect(diff.before).toBeDefined();
    expect(diff.after).toBeDefined();
  });

  it("softDeleteNode writes audit row with action='node_delete'", async () => {
    await softDeleteNode({
      id: nodeId,
      deleted_by: actor.user_id,
      reason: "test cleanup",
    });
    const { data: rows } = await adminClient
      .from("audit_log")
      .select("action")
      .eq("record_id", nodeId)
      .eq("action", "node_delete");
    expect(rows?.length).toBe(1);
  });
});
