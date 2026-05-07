/**
 * D-003 / B4 — role_permission_overrides end-to-end.
 * Spec AC-10..AC-14.
 *
 * Verifies:
 *   1. Inserting an allow row makes the permission appear in the resolver
 *      output for that role + org.
 *   2. Inserting a deny row removes a base permission.
 *   3. Inserting a PLATFORM_ONLY allow is rejected by the guard trigger
 *      with SQLSTATE 42501.
 *   4. RLS isolates rows by org; super_admin sees zero.
 *   5. UPDATE that flips deny -> allow on a PLATFORM_ONLY perm is also
 *      rejected.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { effectivePermissions } from "@/lib/auth/rbac";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `test-rpo-a-${Date.now()}`;
const SLUG_B = `test-rpo-b-${Date.now()}`;
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
    .eq("email", "rpo-platform-tester@test.builtrix.in")
    .maybeSingle();
  if (prior) await deleteAuthUser(prior.id);

  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);

  repA = await provisionUser({
    email: `rpo-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rpo-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `rpo-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rpo-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });
  superAdmin = await provisionUser({
    email: "rpo-platform-tester@test.builtrix.in",
    password: "T3st-pass-rpo-super",
    base_role: "super_admin",
    organization_id: null,
  });
}, 60_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  if (superAdmin) await deleteAuthUser(superAdmin.user_id);
  await adminClient
    .from("role_permission_overrides")
    .delete()
    .eq("organization_id", orgA);
  await adminClient
    .from("role_permission_overrides")
    .delete()
    .eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
});

describe("role_permission_overrides — happy paths feed the resolver", () => {
  it("allow override grants a perm not in the base sales_rep set", async () => {
    const { error } = await adminClient
      .from("role_permission_overrides")
      .insert({
        organization_id: orgA,
        role: "sales_rep",
        permission: "leads:bulk_import",
        mode: "allow",
        reason: "Pilot org allows bulk-import for reps during migration",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      });
    expect(error).toBeNull();

    // Pull the override and feed it into the resolver
    const { data: rows } = await adminClient
      .from("role_permission_overrides")
      .select("permission, mode")
      .eq("organization_id", orgA)
      .eq("role", "sales_rep");
    const allows = (rows ?? [])
      .filter((r) => r.mode === "allow")
      .map((r) => r.permission as never);
    const denies = (rows ?? [])
      .filter((r) => r.mode === "deny")
      .map((r) => r.permission as never);

    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: allows,
      org_deny_overrides: denies,
    });
    expect(perms.has("leads:bulk_import")).toBe(true);
  });

  it("deny override removes a base permission", async () => {
    const { error } = await adminClient
      .from("role_permission_overrides")
      .insert({
        organization_id: orgA,
        role: "sales_rep",
        permission: "leads:view",
        mode: "deny",
        reason: "Pilot disables direct lead view; reps go through the canvas",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      });
    expect(error).toBeNull();

    const { data: rows } = await adminClient
      .from("role_permission_overrides")
      .select("permission, mode")
      .eq("organization_id", orgA)
      .eq("role", "sales_rep");
    const denies = (rows ?? [])
      .filter((r) => r.mode === "deny")
      .map((r) => r.permission as never);

    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: denies,
    });
    expect(perms.has("leads:view")).toBe(false);
  });
});

describe("role_permission_overrides — guard trigger rejects PLATFORM_ONLY allow", () => {
  it("INSERT allow on platform:manage for org_admin is rejected with 42501", async () => {
    const { error } = await adminClient
      .from("role_permission_overrides")
      .insert({
        organization_id: orgA,
        role: "org_admin",
        permission: "platform:manage",
        mode: "allow",
        reason: "Should be rejected — platform-only perm",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/PLATFORM_ONLY|insufficient_privilege/i);
    expect(error?.code).toBe("42501");
  });

  it("INSERT deny on platform:manage is allowed (only allow is rejected)", async () => {
    const { error } = await adminClient
      .from("role_permission_overrides")
      .insert({
        organization_id: orgA,
        role: "org_admin",
        permission: "platform:manage",
        mode: "deny",
        reason: "Belt-and-suspenders deny — also blocks via override",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      });
    expect(error).toBeNull();
  });

  it("UPDATE deny -> allow on a PLATFORM_ONLY permission is also rejected", async () => {
    // Create a deny override that we can try to flip
    const ins = await adminClient
      .from("role_permission_overrides")
      .insert({
        organization_id: orgA,
        role: "org_admin",
        permission: "organizations:create",
        mode: "deny",
        reason: "Initial deny",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    const id = ins.data!.id;

    const upd = await adminClient
      .from("role_permission_overrides")
      .update({
        mode: "allow",
        reason: "Try to flip — should be rejected",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .eq("id", id);
    expect(upd.error).not.toBeNull();
    expect(upd.error?.code).toBe("42501");
  });
});

describe("role_permission_overrides — RLS org isolation", () => {
  it("rep A SELECT returns only Org A's overrides", async () => {
    const c = await userClient(repA);
    const { data, error } = await c
      .from("role_permission_overrides")
      .select("organization_id");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    for (const row of data!) {
      expect(row.organization_id).toBe(orgA);
    }
  });

  it("rep B SELECT returns 0 (no overrides seeded for Org B)", async () => {
    const c = await userClient(repB);
    const { data } = await c.from("role_permission_overrides").select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  it("super_admin SELECT returns 0 rows from operational orgs", async () => {
    const c = await userClient(superAdmin);
    const { data } = await c
      .from("role_permission_overrides")
      .select("id, organization_id")
      .not("organization_id", "is", null);
    expect(data?.length ?? 0).toBe(0);
  });
});
