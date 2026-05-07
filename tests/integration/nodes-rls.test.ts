/**
 * D-002 / B7 — RLS isolation for nodes / edges / node_signals.
 * Spec AC-8 .. AC-12.
 *
 * Two orgs, each with one sales_rep; each rep creates a node in their own
 * org via service-role; verifies cross-tenant read returns 0.
 * Then verifies super_admin sees 0 from each table.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const SLUG_A = "test-nodes-a";
const SLUG_B = "test-nodes-b";

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let superAdmin: ProvisionedUser;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

beforeAll(async () => {
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
  // Clean dangling super_admin from prior runs.
  const { data: prior } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", "nodes-platform-tester@test.builtrix.in")
    .maybeSingle();
  if (prior) await deleteAuthUser(prior.id);

  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");

  repA = await provisionUser({
    email: `nodes-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `nodes-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });
  superAdmin = await provisionUser({
    email: "nodes-platform-tester@test.builtrix.in",
    password: "T3st-pass-super",
    base_role: "super_admin",
    organization_id: null,
  });

  // Seed one node per org via service-role (bypasses RLS).
  await adminClient.from("nodes").insert([
    {
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "lead",
      label: "Lead Org A",
      data: { phone: "+919999900001", source: "walkin" },
      state: "new",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    },
    {
      organization_id: orgB,
      workspace_id: wsB,
      node_type: "lead",
      label: "Lead Org B",
      data: { phone: "+919999900002", source: "walkin" },
      state: "new",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    },
  ]);
}, 60_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  if (superAdmin) await deleteAuthUser(superAdmin.user_id);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
});

describe("nodes RLS — org isolation", () => {
  it("AC-8: rep A SELECTs nodes → only Org A's node", async () => {
    const c = await userClient(repA);
    const { data, error } = await c
      .from("nodes")
      .select("id, organization_id, label");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].organization_id).toBe(orgA);
  });

  it("AC-8 (mirror): rep B sees only Org B's node", async () => {
    const c = await userClient(repB);
    const { data } = await c
      .from("nodes")
      .select("id, organization_id, label");
    expect(data?.length).toBe(1);
    expect(data?.[0].organization_id).toBe(orgB);
  });

  it("AC-12: super_admin SELECTs nodes → 0 rows from operational orgs", async () => {
    const c = await userClient(superAdmin);
    const { data } = await c
      .from("nodes")
      .select("id, organization_id")
      .not("organization_id", "is", null);
    expect(data?.length ?? 0).toBe(0);
  });
});

describe("edges and node_signals RLS — same isolation pattern", () => {
  it("rep A SELECTs edges → 0 (none seeded yet, but query must return cleanly)", async () => {
    const c = await userClient(repA);
    const { data, error } = await c.from("edges").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("super_admin SELECTs edges and node_signals → 0", async () => {
    const c = await userClient(superAdmin);
    const e = await c.from("edges").select("id");
    const s = await c.from("node_signals").select("id");
    expect(e.data?.length ?? 0).toBe(0);
    expect(s.data?.length ?? 0).toBe(0);
  });
});

describe("embedding_queue is service-role-only", () => {
  it("AC-13: rep A SELECTs embedding_queue → 0 rows (no auth policy)", async () => {
    const c = await userClient(repA);
    const { data, error } = await c.from("embedding_queue").select("id");
    // Either: 0 rows (RLS no-policy default deny) OR an explicit error.
    if (error) {
      expect(error.message).toMatch(/policy|permission|rls/i);
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });
});
