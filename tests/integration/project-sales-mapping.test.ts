/**
 * D-608 integration test — project_sales_assignments against a live
 * Supabase. Excluded from the default vitest run; runs with SUPABASE_*
 * env + all migrations applied (incl. 20260514150000).
 *
 * Proves: the resolve + on-leave fallback (AC-2), the partial-unique
 * "one primary" index (AC-4), and RLS cross-tenant isolation (AC-3).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
  provisionUser,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";
import { createNode } from "@/lib/nodes/api";
import {
  addAssignment,
  setPrimaryRep,
  resolveSalesRepForProject,
} from "@/lib/projects/sales-mapping";

const SLUG_A = `psm-a-${Date.now()}`;
const SLUG_B = `psm-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let wsA: string;
let projectA: string;
let adminA: ProvisionedUser;
let primaryRep: ProvisionedUser;
let fallbackRep: ProvisionedUser;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  await provisionWorkspace(orgB, "ws-b");
  adminA = await provisionUser({
    email: `psm-admin-${Date.now()}@test.builtrix.in`,
    password: "T3st-psm-admin",
    base_role: "org_admin",
    organization_id: orgA,
  });
  primaryRep = await provisionUser({
    email: `psm-primary-${Date.now()}@test.builtrix.in`,
    password: "T3st-psm-pri",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  fallbackRep = await provisionUser({
    email: `psm-fallback-${Date.now()}@test.builtrix.in`,
    password: "T3st-psm-fb",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  const project = await createNode(
    {
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "project",
      label: "Demo Project A",
      data: { name: "Demo Project A", city: "Bengaluru" },
      created_by: adminA.user_id,
      created_via: "manual",
    },
    adminClient,
  );
  projectA = project.id;
}, 90_000);

afterAll(async () => {
  await adminClient
    .from("project_sales_assignments")
    .delete()
    .eq("organization_id", orgA);
  for (const u of [adminA, primaryRep, fallbackRep]) {
    if (u) await adminClient.auth.admin.deleteUser(u.user_id).catch(() => {});
  }
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 90_000);

describe("project_sales_assignments — resolve + on-leave fallback (AC-2)", () => {
  it("resolves the primary, then falls back when the primary goes on leave", async () => {
    await addAssignment(
      {
        organization_id: orgA,
        project_id: projectA,
        sales_rep_id: primaryRep.user_id,
        created_by: adminA.user_id,
      },
      adminClient,
    );
    await addAssignment(
      {
        organization_id: orgA,
        project_id: projectA,
        sales_rep_id: fallbackRep.user_id,
        created_by: adminA.user_id,
      },
      adminClient,
    );
    const setP = await setPrimaryRep(
      {
        organization_id: orgA,
        project_id: projectA,
        sales_rep_id: primaryRep.user_id,
      },
      adminClient,
    );
    expect(setP.ok).toBe(true);

    const r1 = await resolveSalesRepForProject(orgA, projectA, adminClient);
    expect(r1?.sales_rep_id).toBe(primaryRep.user_id);
    expect(r1?.is_primary).toBe(true);

    await adminClient
      .from("profiles")
      .update({ on_leave: true })
      .eq("id", primaryRep.user_id);
    const r2 = await resolveSalesRepForProject(orgA, projectA, adminClient);
    expect(r2?.sales_rep_id).toBe(fallbackRep.user_id);
    expect(r2?.fallback).toBe(true);

    await adminClient
      .from("profiles")
      .update({ on_leave: false })
      .eq("id", primaryRep.user_id);
  });

  it("the partial unique index forbids two primaries for one project (AC-4)", async () => {
    // primaryRep is already primary; setting fallbackRep primary directly
    // (bypassing setPrimaryRep's clear-then-set) must hit a 23505.
    const { error } = await adminClient
      .from("project_sales_assignments")
      .update({ is_primary: true })
      .eq("organization_id", orgA)
      .eq("project_id", projectA)
      .eq("sales_rep_id", fallbackRep.user_id);
    expect(error).not.toBeNull();
  });
});

describe("project_sales_assignments — RLS cross-tenant isolation (AC-3)", () => {
  it("an org-B user cannot SELECT org A's assignments", async () => {
    const adminB = await provisionUser({
      email: `psm-bview-${Date.now()}@test.builtrix.in`,
      password: "T3st-psm-bv",
      base_role: "org_admin",
      organization_id: orgB,
    });
    const bClient = await userClient(adminB);
    const { data } = await bClient
      .from("project_sales_assignments")
      .select("id")
      .eq("organization_id", orgA);
    expect(data ?? []).toEqual([]);
    await adminClient.auth.admin.deleteUser(adminB.user_id).catch(() => {});
  });
});
