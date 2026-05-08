/**
 * D-009 / D1 — agent_tier ceiling DB trigger (belt-and-suspenders).
 *
 * Spec: the trigger on audit_log rejects INSERTs where the row's
 * agent_tier > the service-account's max_tier. Same posture as
 * D-007.9 (defense in depth on top of the runtime check).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
} from "./helpers/setup";

const SLUG = `d009-tier-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgId: string;
let wsId: string;
let agentId: string;

beforeAll(async () => {
  orgId = await provisionOrg(SLUG);
  wsId = await provisionWorkspace(orgId, "ws");

  // Seed a temporary T1-only agent service account for this test.
  const { data, error } = await adminClient
    .from("agent_service_accounts")
    .insert({
      agent_type: `tier_test_${Date.now()}`,
      display_name: "Tier Test Agent",
      max_tier: "T1",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (error) throw error;
  agentId = (data as { id: string }).id;
}, 60_000);

afterAll(async () => {
  if (agentId) {
    await adminClient.from("agent_service_accounts").delete().eq("id", agentId);
  }
  await cleanupBySlug(SLUG);
}, 30_000);

describe("audit_log agent-tier ceiling trigger", () => {
  it("permits T1 audit row for a T1-max agent", async () => {
    const { error } = await adminClient.from("audit_log").insert({
      actor_id: agentId,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: orgId,
      workspace_id: wsId,
      table_name: "nodes",
      record_id: SYSTEM_UUID,
      action: "agent_action",
      agent_tier: "T1",
      prompt_version: "v1",
    });
    expect(error).toBeNull();
  });

  it("rejects T2 audit row for a T1-max agent (DB belt)", async () => {
    const { error } = await adminClient.from("audit_log").insert({
      actor_id: agentId,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: orgId,
      workspace_id: wsId,
      table_name: "nodes",
      record_id: SYSTEM_UUID,
      action: "agent_action",
      agent_tier: "T2",
      prompt_version: "v1",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/exceeds service-account max_tier/);
  });

  it("rejects audit row for unknown actor_id (not a registered agent)", async () => {
    const { error } = await adminClient.from("audit_log").insert({
      actor_id: SYSTEM_UUID,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: orgId,
      workspace_id: wsId,
      table_name: "nodes",
      record_id: SYSTEM_UUID,
      action: "agent_action",
      agent_tier: "T1",
      prompt_version: "v1",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/not a registered agent/);
  });

  it("permits non-agent rows regardless of agent_tier value (skip-path)", async () => {
    const { error } = await adminClient.from("audit_log").insert({
      actor_id: SYSTEM_UUID,
      actor_type: "user",
      actor_role: "sales_rep",
      organization_id: orgId,
      workspace_id: wsId,
      table_name: "nodes",
      record_id: SYSTEM_UUID,
      action: "node_create",
      agent_tier: null, // null bypasses the check
    });
    expect(error).toBeNull();
  });
});
