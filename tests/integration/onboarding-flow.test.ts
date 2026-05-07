/**
 * D-005 / C6 — full 8-step onboarding walk against real DB.
 * Spec AC-10..AC-15.
 *
 * Seeds an org + workspace via service-role; calls advanceStep 8 times via
 * the helper; verifies state machine, side-effects, and audit rows.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advanceStep,
  getOnboardingState,
  type StepId,
} from "@/lib/admin";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
} from "./helpers/setup";

const SLUG = `onboard-test-${Date.now()}`;
const ACTOR = "00000000-0000-0000-0000-000000000000";

let orgId: string;
let workspaceId: string;

beforeAll(async () => {
  orgId = await provisionOrg(SLUG);
  workspaceId = await provisionWorkspace(orgId, "default");
}, 30_000);

afterAll(async () => {
  await adminClient
    .from("audit_log")
    .delete()
    .eq("organization_id", orgId)
    .like("action", "onboarding_%");
  await cleanupBySlug(SLUG);
});

describe("8-step onboarding walk", () => {
  it("advances through every step and ends with completed=true", async () => {
    // Step 1
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "org_details",
      payload: {
        primary_contact_name: "Anita",
        primary_contact_email: "anita@example.com",
      },
    });

    // Step 2 (skipped)
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "branding",
      payload: null,
      skipped: true,
    });

    // Step 3
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "first_workspace",
      payload: { slug: "renamed-ws", name: "Mumbai Sales" },
    });

    // Step 4
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "lead_sources",
      payload: { sources: ["walkin", "channel_partner"] },
    });

    // Step 5
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "pipeline_stages",
      payload: { confirmed: true },
    });

    // Step 6 (no invites — empty array allowed)
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "team_users",
      payload: { invites: [] },
    });

    // Step 7
    await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "integrations",
      payload: { email: "smtp", whatsapp: null, telephony: null },
    });

    // Step 8 — finishing flips completed
    const finalResult = await advanceStep({
      org_id: orgId,
      actor: ACTOR,
      step: "sample_demo",
      payload: { walked_through: true },
    });

    expect(finalResult.completed).toBe(true);
    expect(finalResult.next_step).toBe("completed");

    // Verify org state.
    const state = await getOnboardingState(orgId);
    expect(state.completed).toBe(true);
    expect(state.current_step).toBe("completed");
    const expectedSteps: StepId[] = [
      "org_details",
      "branding",
      "first_workspace",
      "lead_sources",
      "pipeline_stages",
      "team_users",
      "integrations",
      "sample_demo",
    ];
    for (const s of expectedSteps) {
      expect(state.completed_steps).toContain(s);
    }
    expect(state.lead_sources).toEqual(["walkin", "channel_partner"]);
    expect(state.integrations.email).toBe("smtp");

    // Side effects: workspace renamed
    const ws = await adminClient
      .from("workspaces")
      .select("slug, name")
      .eq("id", workspaceId)
      .single();
    expect(ws.data?.slug).toBe("renamed-ws");
    expect(ws.data?.name).toBe("Mumbai Sales");

    // 8 audit rows for the 8 advances
    const audit = await adminClient
      .from("audit_log")
      .select("action, diff")
      .eq("organization_id", orgId)
      .like("action", "onboarding_%");
    expect(audit.data?.length).toBe(8);
    const skipped = audit.data?.filter((r) => r.action === "onboarding_step_skipped");
    expect(skipped?.length).toBe(1);
  }, 60_000);
});
