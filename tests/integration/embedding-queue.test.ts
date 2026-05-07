/**
 * D-002 / B8 — embedding_queue trigger.
 * Spec AC-7: nodes INSERT or UPDATE OF (data, label) enqueues a row in
 * embedding_queue with reason='insert' or 'update' respectively.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
} from "./helpers/setup";

const SLUG = "test-embedding-queue";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgId: string;
let workspaceId: string;
let nodeId: string;

beforeAll(async () => {
  await cleanupBySlug(SLUG);
  orgId = await provisionOrg(SLUG);
  workspaceId = await provisionWorkspace(orgId, "ws-eq");
}, 30_000);

afterAll(async () => {
  // Clean up any leftover nodes (cascades to embedding_queue).
  await adminClient.from("nodes").delete().eq("organization_id", orgId);
  await cleanupBySlug(SLUG);
});

describe("embedding_queue trigger", () => {
  it("nodes INSERT enqueues exactly 1 row with reason='insert'", async () => {
    const before = await adminClient
      .from("embedding_queue")
      .select("id", { count: "exact", head: true });
    const beforeCount = before.count ?? 0;

    const { data, error } = await adminClient
      .from("nodes")
      .insert({
        organization_id: orgId,
        workspace_id: workspaceId,
        node_type: "lead",
        label: "Test Lead",
        data: { phone: "+919999900099", source: "walkin" },
        state: "new",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    nodeId = data!.id;

    const queued = await adminClient
      .from("embedding_queue")
      .select("id, reason, status")
      .eq("node_id", nodeId);
    expect(queued.error).toBeNull();
    expect(queued.data?.length).toBe(1);
    expect(queued.data?.[0].reason).toBe("insert");
    expect(queued.data?.[0].status).toBe("pending");

    const after = await adminClient
      .from("embedding_queue")
      .select("id", { count: "exact", head: true });
    expect((after.count ?? 0) - beforeCount).toBe(1);
  });

  it("nodes UPDATE OF data triggers another queue row with reason='update'", async () => {
    const { error } = await adminClient
      .from("nodes")
      .update({
        data: { phone: "+919999900099", source: "walkin", notes: "callback" },
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .eq("id", nodeId);
    expect(error).toBeNull();

    const queued = await adminClient
      .from("embedding_queue")
      .select("reason, status")
      .eq("node_id", nodeId);
    expect(queued.data?.length).toBe(2); // 1 from INSERT + 1 from UPDATE OF data
    expect(queued.data?.map((r) => r.reason).sort()).toEqual([
      "insert",
      "update",
    ]);
  });

  it("UPDATE OF only state (not data/label) does NOT enqueue a row", async () => {
    const { error } = await adminClient
      .from("nodes")
      .update({
        state: "contacted",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .eq("id", nodeId);
    expect(error).toBeNull();

    const queued = await adminClient
      .from("embedding_queue")
      .select("reason")
      .eq("node_id", nodeId);
    // Still 2 rows from prior — state-only update doesn't fire the trigger.
    expect(queued.data?.length).toBe(2);
  });
});
