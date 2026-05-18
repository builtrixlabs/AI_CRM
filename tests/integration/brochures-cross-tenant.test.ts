/**
 * D-607 integration test — the `brochures` table against a live Supabase.
 * Excluded from the default vitest run; runs with SUPABASE_* env + all
 * migrations applied (incl. 20260514170000_brochures.sql).
 *
 * Proves AC-5 cross-org isolation: the org filter on the service-role
 * reads (listBrochures / findBrochuresForAgent) AND the RLS policy on
 * `brochures` both fence org A's caller out of org B's rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionUser,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";
import { createBrochure, findBrochuresForAgent, listBrochures } from "@/lib/brochures/repository";

const SLUG_A = `broc-a-${Date.now()}`;
const SLUG_B = `broc-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let adminA: ProvisionedUser;
let repA: ProvisionedUser;
let adminB: ProvisionedUser;
let brochureA: string;
let brochureB: string;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  adminA = await provisionUser({
    email: `broc-admin-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-broc-admin-a",
    base_role: "org_admin",
    organization_id: orgA,
  });
  repA = await provisionUser({
    email: `broc-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-broc-rep-a",
    base_role: "presales_rep",
    organization_id: orgA,
  });
  adminB = await provisionUser({
    email: `broc-admin-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-broc-admin-b",
    base_role: "org_admin",
    organization_id: orgB,
  });

  const a = await createBrochure(
    {
      organization_id: orgA,
      uploaded_by: adminA.user_id,
      document_type: "floor_plan",
      title: "Org A — 3BHK floor plan",
      file_path: `${orgA}/seed/a.pdf`,
      file_size_bytes: 1024,
      mime_type: "application/pdf",
      metadata: { bhk: 3, budget_band: "1.5-2Cr", tags: [] },
    },
    adminClient,
  );
  const b = await createBrochure(
    {
      organization_id: orgB,
      uploaded_by: adminB.user_id,
      document_type: "floor_plan",
      title: "Org B — 3BHK floor plan",
      file_path: `${orgB}/seed/b.pdf`,
      file_size_bytes: 1024,
      mime_type: "application/pdf",
      metadata: { bhk: 3, budget_band: "1.5-2Cr", tags: [] },
    },
    adminClient,
  );
  if (!a.ok || !b.ok) throw new Error("seed createBrochure failed");
  brochureA = a.id;
  brochureB = b.id;
}, 90_000);

afterAll(async () => {
  await adminClient.from("brochures").delete().eq("organization_id", orgA);
  await adminClient.from("brochures").delete().eq("organization_id", orgB);
  for (const u of [adminA, repA, adminB]) {
    if (u) await adminClient.auth.admin.deleteUser(u.user_id).catch(() => {});
  }
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 90_000);

describe("brochures — cross-tenant isolation (AC-5)", () => {
  it("listBrochures for org A returns only org A's brochures", async () => {
    const rows = await listBrochures(orgA, adminClient);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(brochureA);
    expect(ids).not.toContain(brochureB);
  });

  it("findBrochuresForAgent for org A never returns org B's matching rows", async () => {
    // Org B's brochure is an identical bhk=3 / 1.5-2Cr match — the only
    // thing keeping it out of org A's results is the org filter.
    const matches = await findBrochuresForAgent(
      { organization_id: orgA, bhk: 3, budget_band: "1.5-2Cr" },
      adminClient,
    );
    const ids = matches.map((m) => m.id);
    expect(ids).toContain(brochureA);
    expect(ids).not.toContain(brochureB);
  });

  it("org A's authenticated client cannot SELECT org B's brochure (RLS)", async () => {
    const cA = await userClient(repA);
    const { data } = await cA
      .from("brochures")
      .select("id")
      .eq("id", brochureB);
    expect(data ?? []).toHaveLength(0);
  });

  it("org A's authenticated client CAN see its own brochure (RLS positive control)", async () => {
    const cA = await userClient(repA);
    const { data } = await cA
      .from("brochures")
      .select("id")
      .eq("id", brochureA);
    expect((data ?? []).map((r) => r.id)).toEqual([brochureA]);
  });
});
