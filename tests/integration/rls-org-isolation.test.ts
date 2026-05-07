/**
 * D-001 / B7 — cross-tenant data isolation via RLS.
 * Spec AC-9: sales_rep in Org A SELECTs profiles → only Org A rows.
 *
 * Requires the custom_access_token_hook to be enabled so the JWT carries
 * organization_id. Without it, auth.org_id() returns NULL and tests fail.
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

const SLUG_A = "test-iso-a";
const SLUG_B = "test-iso-b";

let orgA: string;
let orgB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;

beforeAll(async () => {
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);

  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);

  repA = await provisionUser({
    email: `rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });
}, 30_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
});

describe("RLS — org isolation", () => {
  it("AC-9: rep A sees only Org A's profiles", async () => {
    const c = await userClient(repA);
    const { data, error } = await c.from("profiles").select("id, organization_id");
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    // Should see at least their own profile, all in Org A.
    expect(data!.length).toBeGreaterThanOrEqual(1);
    for (const row of data!) {
      expect(row.organization_id).toBe(orgA);
    }
  });

  it("AC-9 (mirror): rep B sees only Org B's profiles", async () => {
    const c = await userClient(repB);
    const { data, error } = await c.from("profiles").select("id, organization_id");
    expect(error).toBeNull();
    for (const row of data!) {
      expect(row.organization_id).toBe(orgB);
    }
  });

  it("rep A cannot read Org B's organizations row", async () => {
    const c = await userClient(repA);
    const { data } = await c
      .from("organizations")
      .select("id")
      .eq("id", orgB);
    expect(data?.length ?? 0).toBe(0);
  });
});
