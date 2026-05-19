/**
 * D-616 integration test — the customer_recovery_queue against a live
 * Supabase. Excluded from the default vitest run; runs with SUPABASE_*
 * env + all migrations applied (incl. 20260519120000_customer_recovery.sql).
 *
 * Proves AC-5 cross-org isolation: the org filter on the service-role
 * reads (listRecoveryQueue) AND the RLS policy on customer_recovery_queue
 * both fence org A's caller out of org B's rows.
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
import {
  enqueueRecoveryCandidate,
  listRecoveryQueue,
} from "@/lib/recovery";

const SLUG_A = `rec-a-${Date.now()}`;
const SLUG_B = `rec-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let adminA: ProvisionedUser;
let repA: ProvisionedUser;
let adminB: ProvisionedUser;
let leadA: string;
let leadB: string;
let queueA: string;
let queueB: string;

async function insertLostLead(args: {
  organization_id: string;
  uploaded_by: string;
}): Promise<string> {
  const { data, error } = await adminClient
    .from("nodes")
    .insert({
      organization_id: args.organization_id,
      node_type: "lead",
      label: `Recovery-test lead ${args.organization_id.slice(0, 8)}`,
      state: "lost",
      data: { last_contact_at: new Date().toISOString() },
      created_by: args.uploaded_by,
      created_via: "system",
      updated_by: args.uploaded_by,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  adminA = await provisionUser({
    email: `rec-admin-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-rec-admin-a",
    base_role: "org_admin",
    organization_id: orgA,
  });
  repA = await provisionUser({
    email: `rec-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-rec-rep-a",
    base_role: "customer_recovery_rep",
    organization_id: orgA,
  });
  adminB = await provisionUser({
    email: `rec-admin-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-rec-admin-b",
    base_role: "org_admin",
    organization_id: orgB,
  });

  leadA = await insertLostLead({
    organization_id: orgA,
    uploaded_by: adminA.user_id,
  });
  leadB = await insertLostLead({
    organization_id: orgB,
    uploaded_by: adminB.user_id,
  });

  const enqA = await enqueueRecoveryCandidate(
    { lead_id: leadA, organization_id: orgA, recovery_reason: "lost" },
    adminClient,
  );
  const enqB = await enqueueRecoveryCandidate(
    { lead_id: leadB, organization_id: orgB, recovery_reason: "lost" },
    adminClient,
  );
  if (!enqA.ok || !enqB.ok) throw new Error("seed enqueueRecoveryCandidate failed");
  queueA = enqA.queue_id;
  queueB = enqB.queue_id;
}, 90_000);

afterAll(async () => {
  await adminClient
    .from("customer_recovery_queue")
    .delete()
    .eq("organization_id", orgA);
  await adminClient
    .from("customer_recovery_queue")
    .delete()
    .eq("organization_id", orgB);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgB);
  for (const u of [adminA, repA, adminB]) {
    if (u) await adminClient.auth.admin.deleteUser(u.user_id).catch(() => {});
  }
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 90_000);

describe("customer_recovery_queue — cross-tenant isolation (AC-5)", () => {
  it("listRecoveryQueue for org A returns only org A's rows", async () => {
    const rows = await listRecoveryQueue({
      organization_id: orgA,
      viewer_id: repA.user_id,
      filters: { bucket: "open" },
      client: adminClient,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(queueA);
    expect(ids).not.toContain(queueB);
  });

  it("org A's authenticated client cannot SELECT org B's queue row (RLS)", async () => {
    const cA = await userClient(repA);
    const { data } = await cA
      .from("customer_recovery_queue")
      .select("id")
      .eq("id", queueB);
    expect(data ?? []).toHaveLength(0);
  });

  it("org A's authenticated client CAN see its own queue row (RLS positive control)", async () => {
    const cA = await userClient(repA);
    const { data } = await cA
      .from("customer_recovery_queue")
      .select("id")
      .eq("id", queueA);
    expect((data ?? []).map((r) => r.id)).toEqual([queueA]);
  });

  it("partial-unique idx blocks a second open row for the same (org, lead)", async () => {
    const second = await enqueueRecoveryCandidate(
      { lead_id: leadA, organization_id: orgA, recovery_reason: "lost" },
      adminClient,
    );
    expect(second).toEqual({ ok: false, error: "already_queued" });
  });
});
