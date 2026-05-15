/**
 * D-614 — agent_message_policies integration tests against live Supabase.
 * Confirms resolveSendPolicy reads the table, the (org, agent_kind) PK
 * upserts in place, the mode CHECK holds, and policy is org-isolated.
 *
 * Requires migration 20260515120000_agent_message_policies.sql applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSendPolicy } from "@/lib/agents/send-policy";
import { adminClient, provisionOrg } from "./helpers/setup";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

describe("agent_message_policies — D-614 send policy (live Supabase)", () => {
  let orgA: string;
  let orgB: string;
  const slugA = `amp-a-${Date.now()}`;
  const slugB = `amp-b-${Date.now()}`;

  beforeAll(async () => {
    orgA = await provisionOrg(slugA);
    orgB = await provisionOrg(slugB);
  }, 60_000);

  afterAll(async () => {
    await adminClient
      .from("agent_message_policies")
      .delete()
      .in("organization_id", [orgA, orgB]);
    await adminClient.from("organizations").delete().eq("id", orgA);
    await adminClient.from("organizations").delete().eq("id", orgB);
  });

  it("resolveSendPolicy returns require_approval when no row exists (AC-1)", async () => {
    const policy = await resolveSendPolicy(orgA, "brochure_send", adminClient);
    expect(policy).toBe("require_approval");
  });

  it("resolveSendPolicy returns the stored mode after a row is set", async () => {
    const { error } = await adminClient
      .from("agent_message_policies")
      .insert({
        organization_id: orgA,
        agent_kind: "brochure_send",
        mode: "auto_send",
        updated_by: SYSTEM_UUID,
      });
    expect(error).toBeNull();

    const policy = await resolveSendPolicy(orgA, "brochure_send", adminClient);
    expect(policy).toBe("auto_send");
  });

  it("a policy row for org A does not affect org B (AC-6)", async () => {
    const a = await resolveSendPolicy(orgA, "brochure_send", adminClient);
    const b = await resolveSendPolicy(orgB, "brochure_send", adminClient);
    expect(a).toBe("auto_send");
    expect(b).toBe("require_approval");
  });

  it("the (org, agent_kind) PK upserts in place — one row per pair", async () => {
    await adminClient.from("agent_message_policies").upsert(
      {
        organization_id: orgA,
        agent_kind: "brochure_send",
        mode: "require_approval",
        updated_by: SYSTEM_UUID,
      },
      { onConflict: "organization_id,agent_kind" },
    );
    const { data } = await adminClient
      .from("agent_message_policies")
      .select("mode")
      .eq("organization_id", orgA)
      .eq("agent_kind", "brochure_send");
    expect(data).toHaveLength(1);
    expect((data?.[0] as { mode: string }).mode).toBe("require_approval");
  });

  it("the mode CHECK constraint rejects an invalid mode", async () => {
    const { error } = await adminClient
      .from("agent_message_policies")
      .insert({
        organization_id: orgB,
        agent_kind: "follow_up_stale_lead",
        mode: "fire_when_ready",
        updated_by: SYSTEM_UUID,
      });
    expect(error).not.toBeNull();
  });
});
