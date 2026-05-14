/**
 * D-610 integration test — MIH → pre-sales allocation against a live
 * Supabase. Excluded from the default vitest run; runs with SUPABASE_*
 * env + all migrations applied (incl. 20260514160000).
 *
 * Proves AC-1 (round-robin across a team → distinct reps) and AC-4
 * (cross-tenant: org A's rules never touch an org B lead).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
  provisionUser,
  type ProvisionedUser,
} from "./helpers/setup";
import { allocateLead } from "@/lib/leads/allocation-engine";
import {
  createAllocationRule,
  createTeam,
  addTeamMember,
} from "@/lib/leads/allocation-admin";

const SLUG_A = `mtp-a-${Date.now()}`;
const SLUG_B = `mtp-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let adminA: ProvisionedUser;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let repC: ProvisionedUser;
let teamId: string;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");

  const stamp = Date.now();
  adminA = await provisionUser({
    email: `mtp-admin-${stamp}@test.builtrix.in`,
    password: "T3st-mtp-admin",
    base_role: "org_admin",
    organization_id: orgA,
  });
  repA = await provisionUser({
    email: `mtp-rep-a-${stamp}@test.builtrix.in`,
    password: "T3st-mtp-a",
    base_role: "presales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `mtp-rep-b-${stamp}@test.builtrix.in`,
    password: "T3st-mtp-b",
    base_role: "presales_rep",
    organization_id: orgA,
  });
  repC = await provisionUser({
    email: `mtp-rep-c-${stamp}@test.builtrix.in`,
    password: "T3st-mtp-c",
    base_role: "presales_rep",
    organization_id: orgA,
  });

  const team = await createTeam(
    { organization_id: orgA, name: "Senior team", created_by: adminA.user_id },
    adminClient,
  );
  if (!team.ok || !team.id) throw new Error("team create failed");
  teamId = team.id;
  for (const r of [repA, repB, repC]) {
    await addTeamMember(
      {
        organization_id: orgA,
        team_id: teamId,
        profile_id: r.user_id,
        created_by: adminA.user_id,
      },
      adminClient,
    );
  }

  await createAllocationRule(
    {
      organization_id: orgA,
      name: "All MIH leads → senior round-robin",
      priority: 100,
      conditions: {},
      target_kind: "team_round_robin",
      target_team_id: teamId,
      created_by: adminA.user_id,
    },
    adminClient,
  );
}, 120_000);

afterAll(async () => {
  await adminClient
    .from("lead_allocation_rules")
    .delete()
    .eq("organization_id", orgA);
  await adminClient
    .from("lead_allocation_state")
    .delete()
    .eq("organization_id", orgA);
  await adminClient
    .from("team_members")
    .delete()
    .eq("organization_id", orgA);
  for (const u of [adminA, repA, repB, repC]) {
    if (u) await adminClient.auth.admin.deleteUser(u.user_id).catch(() => {});
  }
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 120_000);

async function makeLead(
  org: string,
  ws: string,
  createdBy: string,
): Promise<string> {
  const { data, error } = await adminClient
    .from("nodes")
    .insert({
      organization_id: org,
      workspace_id: ws,
      node_type: "lead",
      label: "Integration Lead",
      state: "new",
      data: {
        phone: `+9198${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, "0")}`,
        source: "meta_lead_ads",
        source_channel: "paid_social",
        preference: { bhk: 3 },
      },
      created_by: createdBy,
      created_via: "api_sync",
      updated_by: createdBy,
      updated_via: "api_sync",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("mih-to-presales — round-robin allocation (AC-1)", () => {
  it("three leads round-robin to three distinct reps", async () => {
    const assigned: string[] = [];
    for (let i = 0; i < 3; i++) {
      const leadId = await makeLead(orgA, wsA, adminA.user_id);
      const r = await allocateLead(
        { lead_id: leadId, organization_id: orgA, workspace_id: wsA },
        adminClient,
      );
      expect(r.ok && r.outcome === "allocated").toBe(true);
      if (r.ok && r.outcome === "allocated") assigned.push(r.sales_rep_id);
    }
    expect(new Set(assigned).size).toBe(3);
  });
});

describe("mih-to-presales — cross-tenant isolation (AC-4)", () => {
  it("org A's rules never allocate an org B lead", async () => {
    const leadB = await makeLead(orgB, wsB, adminA.user_id);
    const r = await allocateLead(
      { lead_id: leadB, organization_id: orgB, workspace_id: wsB },
      adminClient,
    );
    // org B has no rules → unmatched (org A's rule is invisible to it).
    expect(r).toEqual({ ok: true, outcome: "unmatched" });
    await adminClient.from("nodes").delete().eq("id", leadB);
  });
});
