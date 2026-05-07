/**
 * D-004 / A3 — RLS for subscriptions + support_tickets.
 *
 * Verifies:
 *   - Subscription seeded for Org A is visible to Org A's rep, invisible to Org B's.
 *   - super_admin sees zero rows from both new tables (no permissive policy).
 *   - Authenticated users cannot INSERT into subscriptions (service-role only).
 *   - Authenticated users CAN INSERT into support_tickets (their own org).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `test-platform-a-${Date.now()}`;
const SLUG_B = `test-platform-b-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgA: string;
let orgB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let superAdmin: ProvisionedUser;

beforeAll(async () => {
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
  const { data: prior } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", "platform-tables-tester@test.builtrix.in")
    .maybeSingle();
  if (prior) await deleteAuthUser(prior.id);

  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);

  repA = await provisionUser({
    email: `platform-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-platform-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `platform-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-platform-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });
  superAdmin = await provisionUser({
    email: "platform-tables-tester@test.builtrix.in",
    password: "T3st-pass-platform-super",
    base_role: "super_admin",
    organization_id: null,
  });

  // Seed one subscription per org (service-role).
  await adminClient.from("subscriptions").insert([
    {
      organization_id: orgA,
      plan_tier: "starter",
      status: "active",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    },
    {
      organization_id: orgB,
      plan_tier: "professional",
      status: "active",
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
  await adminClient.from("subscriptions").delete().eq("organization_id", orgA);
  await adminClient.from("subscriptions").delete().eq("organization_id", orgB);
  await adminClient.from("support_tickets").delete().eq("organization_id", orgA);
  await adminClient.from("support_tickets").delete().eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
});

describe("subscriptions RLS", () => {
  it("rep A sees only Org A's subscription", async () => {
    const c = await userClient(repA);
    const { data, error } = await c
      .from("subscriptions")
      .select("organization_id, plan_tier");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].organization_id).toBe(orgA);
    expect(data?.[0].plan_tier).toBe("starter");
  });

  it("rep B sees only Org B's subscription", async () => {
    const c = await userClient(repB);
    const { data } = await c.from("subscriptions").select("plan_tier");
    expect(data?.length).toBe(1);
    expect(data?.[0].plan_tier).toBe("professional");
  });

  it("super_admin SELECT subscriptions → 0 rows for operational orgs", async () => {
    const c = await userClient(superAdmin);
    const { data } = await c.from("subscriptions").select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  it("authenticated user INSERT into subscriptions is rejected (no auth INSERT policy)", async () => {
    const c = await userClient(repA);
    const { error } = await c.from("subscriptions").insert({
      organization_id: orgA,
      plan_tier: "enterprise",
      status: "active",
      created_by: repA.user_id,
      created_via: "manual",
      updated_by: repA.user_id,
      updated_via: "manual",
    });
    // Either RLS rejects with an error OR the row count is 0.
    if (error) {
      expect(error.message).toMatch(/policy|permission|rls/i);
    } else {
      const after = await adminClient
        .from("subscriptions")
        .select("plan_tier")
        .eq("organization_id", orgA)
        .single();
      expect(after.data?.plan_tier).toBe("starter"); // unchanged
    }
  });
});

describe("support_tickets RLS", () => {
  it("authenticated user CAN insert a ticket for their own org", async () => {
    const c = await userClient(repA);
    const { data, error } = await c
      .from("support_tickets")
      .insert({
        organization_id: orgA,
        raised_by: repA.user_id,
        subject: "Test ticket",
        body: "Smoke check from D-004 RLS test",
        priority: "normal",
        status: "open",
        created_by: repA.user_id,
        created_via: "manual",
        updated_by: repA.user_id,
        updated_via: "manual",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("rep A reads only Org A's tickets", async () => {
    const c = await userClient(repA);
    const { data } = await c.from("support_tickets").select("organization_id");
    expect(data?.length).toBeGreaterThanOrEqual(1);
    for (const row of data!) {
      expect(row.organization_id).toBe(orgA);
    }
  });

  it("super_admin SELECT support_tickets → 0 rows", async () => {
    const c = await userClient(superAdmin);
    const { data } = await c.from("support_tickets").select("id");
    expect(data?.length ?? 0).toBe(0);
  });
});
