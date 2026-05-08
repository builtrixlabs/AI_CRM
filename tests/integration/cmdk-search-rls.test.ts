/**
 * D-008 / cmdk-search-rls — searchLeads is RLS-scoped to the caller's
 * tenant. Two orgs, each with one rep + one seeded lead. Each rep's
 * search returns ONLY their own org's lead.
 *
 * Spec AC-15 + AC-17.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { searchLeadsByClient } from "@/app/(dashboard)/dashboard/_actions/searchLeads";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  provisionWorkspace,
  supabaseUrl,
  supabaseAnonKey,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `cmdk-rls-a-${Date.now()}`;
const SLUG_B = `cmdk-rls-b-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let clientA: SupabaseClient;
let clientB: SupabaseClient;

async function makeAuthedClient(user: ProvisionedUser): Promise<SupabaseClient> {
  const c = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");

  repA = await provisionUser({
    email: `cmdk-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-cmdk-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `cmdk-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-cmdk-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });

  // Seed one lead per org with a recognizable label for the search query.
  await adminClient.from("nodes").insert([
    {
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "lead",
      label: "AlphaSharma A",
      data: { phone: "+91-9000000001", source: "walkin" },
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
      label: "AlphaSharma B",
      data: { phone: "+91-9000000002", source: "walkin" },
      state: "new",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    },
  ]);

  clientA = await makeAuthedClient(repA);
  clientB = await makeAuthedClient(repB);
}, 90_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 60_000);

describe("searchLeadsByClient RLS isolation (D-008 AC-15, AC-17)", () => {
  it("rep A sees only Org A's lead when searching 'AlphaSharma'", async () => {
    const r = await searchLeadsByClient(clientA, "AlphaSharma");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results.length).toBeGreaterThan(0);
      for (const hit of r.results) {
        expect(hit.label.endsWith("A")).toBe(true);
      }
    }
  }, 60_000);

  it("rep B sees only Org B's lead when searching 'AlphaSharma'", async () => {
    const r = await searchLeadsByClient(clientB, "AlphaSharma");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results.length).toBeGreaterThan(0);
      for (const hit of r.results) {
        expect(hit.label.endsWith("B")).toBe(true);
      }
    }
  }, 60_000);

  it("validation error on empty query (regardless of tenant)", async () => {
    const r = await searchLeadsByClient(clientA, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  }, 60_000);

  it("rep A's phone search hits both label AND data->>phone columns", async () => {
    const r = await searchLeadsByClient(clientA, "9000000001");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results.length).toBe(1);
      expect(r.results[0]!.label).toBe("AlphaSharma A");
    }
  }, 60_000);
});
