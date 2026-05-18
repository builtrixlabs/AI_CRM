/**
 * D-604 integration test — MIH inbound API against a live Supabase.
 * Excluded from the default vitest run (tests/integration/**); runs with
 * SUPABASE_* env + all migrations applied (incl. 20260514140000).
 *
 * Proves baseline 122 §9 cross-tenant isolation (AC-8) + §5 idempotency
 * end-to-end through the real route handler.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
  provisionUser,
  type ProvisionedUser,
} from "./helpers/setup";
import { issueToken } from "@/lib/integrations/sister-products/token";
import { POST } from "@/app/api/sister/v1/leads/route";

const SLUG_A = `mih-a-${Date.now()}`;
const SLUG_B = `mih-b-${Date.now()}`;

let orgA: string;
let orgB: string;
let tokenA: string;
let adminUserA: ProvisionedUser;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  await provisionWorkspace(orgA, "ws-a");
  await provisionWorkspace(orgB, "ws-b");
  adminUserA = await provisionUser({
    email: `mih-admin-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-mih-a",
    base_role: "org_admin",
    organization_id: orgA,
  });
  const issued = await issueToken(adminClient, {
    organization_id: orgA,
    product_kind: "marketing_intelligence_hub",
    created_by: adminUserA.user_id,
  });
  tokenA = issued.token;
}, 60_000);

afterAll(async () => {
  await adminClient.from("mih_inbound_log").delete().eq("organization_id", orgA);
  await adminClient.from("mih_inbound_log").delete().eq("organization_id", orgB);
  await adminClient
    .from("org_sister_product_tokens")
    .delete()
    .eq("organization_id", orgA);
  if (adminUserA) {
    await adminClient.auth.admin.deleteUser(adminUserA.user_id).catch(() => {});
  }
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 60_000);

function mihRequest(token: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/sister/v1/leads", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function payloadFor(
  org: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization_id: org,
    external_id: `ext-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: "Integration Lead",
    phone_e164: `+9198${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, "0")}`,
    source: "meta_lead_ads",
    source_channel: "paid_social",
    source_received_at: new Date().toISOString(),
    preference: { bhk: 3 },
    raw_payload: { test: true },
    ...over,
  };
}

describe("POST /api/sister/v1/leads — cross-tenant isolation (AC-8)", () => {
  it("a valid MIH token creates a lead in its own org", async () => {
    const body = payloadFor(orgA);
    const res = await POST(mihRequest(tokenA, body));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("created");

    const { data } = await adminClient
      .from("nodes")
      .select("organization_id, source_external_id")
      .eq("id", json.lead_id)
      .maybeSingle();
    expect(data?.organization_id).toBe(orgA);
    expect(data?.source_external_id).toBe(body.external_id);
  });

  it("org A's token cannot create a lead in org B (envelope mismatch → 403)", async () => {
    const res = await POST(mihRequest(tokenA, payloadFor(orgB)));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("cross_tenant_violation");
  });

  it("a missing Bearer token → 401", async () => {
    const res = await POST(mihRequest(null, payloadFor(orgA)));
    expect(res.status).toBe(401);
  });

  it("is idempotent — replaying an external_id merges, no second row", async () => {
    const body = payloadFor(orgA);
    const first = await POST(mihRequest(tokenA, body));
    const firstJson = await first.json();
    const second = await POST(mihRequest(tokenA, body));
    const secondJson = await second.json();
    expect(secondJson.status).toBe("duplicate_merged");
    expect(secondJson.lead_id).toBe(firstJson.lead_id);

    const { count } = await adminClient
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA)
      .eq("source_external_id", body.external_id);
    expect(count).toBe(1);
  });
});
