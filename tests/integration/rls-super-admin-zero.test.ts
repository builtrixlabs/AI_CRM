/**
 * D-001 / B8 — super_admin sees zero operational rows.
 * Spec AC-10: super_admin SELECTs from operational tables → 0 rows.
 *
 * The constitution declares super_admin has ZERO operational data access.
 * RLS achieves this by NOT having any super_admin-permissive policy on the
 * operational tables. auth.org_id() returns NULL for super_admin
 * (organization_id claim is empty), so all "= auth.org_id()" predicates fail.
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

const SLUG = "test-sa-zero";

let orgId: string;
let workspaceId: string;
let rep: ProvisionedUser;
let superAdmin: ProvisionedUser;

beforeAll(async () => {
  await cleanupBySlug(SLUG);
  // Make sure no leftover super-admin auth user
  const { data: prior } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", "platform-tester@test.builtrix.in")
    .maybeSingle();
  if (prior) await deleteAuthUser(prior.id);

  orgId = await provisionOrg(SLUG);
  workspaceId = await provisionWorkspace(orgId, "ws-1");

  rep = await provisionUser({
    email: `rep-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rep",
    base_role: "sales_rep",
    organization_id: orgId,
  });

  superAdmin = await provisionUser({
    email: "platform-tester@test.builtrix.in",
    password: "T3st-pass-super",
    base_role: "super_admin",
    organization_id: null,
  });
}, 30_000);

afterAll(async () => {
  if (rep) await deleteAuthUser(rep.user_id);
  if (superAdmin) await deleteAuthUser(superAdmin.user_id);
  await cleanupBySlug(SLUG);
});

describe("RLS — super_admin zero operational access", () => {
  it("AC-10a: super_admin SELECT profiles → 0 OPERATIONAL rows", async () => {
    // Constitution: super_admin has zero operational data access.
    // The super_admin's OWN profile (organization_id = NULL, visible via
    // profiles_select_self) is platform identity, not operational data.
    const c = await userClient(superAdmin);
    const { data, error } = await c
      .from("profiles")
      .select("id, organization_id")
      .not("organization_id", "is", null);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("AC-10b: super_admin SELECT organizations → 0 rows", async () => {
    const c = await userClient(superAdmin);
    const { data, error } = await c.from("organizations").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("AC-10c: super_admin SELECT workspaces → 0 rows", async () => {
    const c = await userClient(superAdmin);
    const { data, error } = await c.from("workspaces").select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("control: rep DOES see 1 organization (sanity check fixtures aren't empty)", async () => {
    const c = await userClient(rep);
    const { data } = await c.from("organizations").select("id");
    expect(data?.length).toBe(1);
    expect(data![0].id).toBe(orgId);
  });
});
