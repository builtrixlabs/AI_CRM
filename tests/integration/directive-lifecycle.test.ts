/**
 * D-615 — directive lifecycle integration tests against live Supabase.
 * Confirms the runtime gate (pending workflows don't fire), the
 * permission-keyed lifecycle on author, and the approve/reject round-trip.
 *
 * Requires migration 20260515120100_directive_lifecycle.sql applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCustomDirective,
  approveWorkflow,
  rejectWorkflow,
  listPendingWorkflows,
} from "@/lib/doe/authoring";
import { loadActiveDirectives } from "@/lib/doe/runtime";
import { adminClient, provisionOrg } from "./helpers/setup";

const ACTOR = "00000000-0000-0000-0000-000000000000";

describe("directive lifecycle — D-615 (live Supabase)", () => {
  let orgA: string;
  let orgB: string;
  const slugA = `dlc-a-${Date.now()}`;
  const slugB = `dlc-b-${Date.now()}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    orgA = await provisionOrg(slugA);
    orgB = await provisionOrg(slugB);
  }, 60_000);

  afterAll(async () => {
    if (createdIds.length > 0) {
      await adminClient.from("directives").delete().in("id", createdIds);
    }
    // Best-effort — audit_log rows may keep the org rows pinned.
    await adminClient.from("organizations").delete().eq("id", orgA);
    await adminClient.from("organizations").delete().eq("id", orgB);
  });

  function input(name: string) {
    return {
      display_name: name,
      trigger_kind: "lead.created" as const,
      trigger_config: {},
      action_kind: "flag_lead" as const,
      action_config: {},
      enabled: true,
    };
  }

  it("a manager-authored workflow lands pending_approval + runtime-inert (AC-1, AC-3)", async () => {
    const created = await createCustomDirective(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "manager",
        input: input("Manager pending workflow"),
      },
      adminClient,
    );
    createdIds.push(created.id);
    expect(created.lifecycle_status).toBe("pending_approval");

    // Runtime gate — a pending workflow does not load for firing.
    const active = await loadActiveDirectives(
      "lead.created",
      orgA,
      adminClient,
    );
    expect(active.some((d) => d.id === created.id)).toBe(false);

    // …but it shows in the pending-approval queue.
    const pending = await listPendingWorkflows(orgA, adminClient);
    expect(pending.some((w) => w.id === created.id)).toBe(true);
  });

  it("an org_admin-authored workflow lands live + fires (AC-2, AC-3)", async () => {
    const created = await createCustomDirective(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: input("Org admin live workflow"),
      },
      adminClient,
    );
    createdIds.push(created.id);
    expect(created.lifecycle_status).toBe("live");

    const active = await loadActiveDirectives(
      "lead.created",
      orgA,
      adminClient,
    );
    expect(active.some((d) => d.id === created.id)).toBe(true);
  });

  it("approveWorkflow makes a pending workflow live + runtime-active (AC-4)", async () => {
    const created = await createCustomDirective(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "manager",
        input: input("To be approved"),
      },
      adminClient,
    );
    createdIds.push(created.id);

    await approveWorkflow(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "org_admin",
        directive_id: created.id,
      },
      adminClient,
    );

    const { data } = await adminClient
      .from("directives")
      .select("lifecycle_status, enabled")
      .eq("id", created.id)
      .single();
    expect((data as { lifecycle_status: string }).lifecycle_status).toBe(
      "live",
    );
    expect((data as { enabled: boolean }).enabled).toBe(true);

    const active = await loadActiveDirectives(
      "lead.created",
      orgA,
      adminClient,
    );
    expect(active.some((d) => d.id === created.id)).toBe(true);
  });

  it("rejectWorkflow archives a pending workflow with the reason (AC-5)", async () => {
    const created = await createCustomDirective(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "manager",
        input: input("To be rejected"),
      },
      adminClient,
    );
    createdIds.push(created.id);

    await rejectWorkflow(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "org_admin",
        directive_id: created.id,
        reason: "Trigger config is incomplete — needs a threshold.",
      },
      adminClient,
    );

    const { data } = await adminClient
      .from("directives")
      .select("lifecycle_status, rejection_reason")
      .eq("id", created.id)
      .single();
    expect((data as { lifecycle_status: string }).lifecycle_status).toBe(
      "archived",
    );
    expect(
      (data as { rejection_reason: string }).rejection_reason,
    ).toContain("threshold");
  });

  it("an org admin cannot approve another org's pending workflow (AC-6)", async () => {
    const created = await createCustomDirective(
      {
        caller_org_id: orgA,
        actor_id: ACTOR,
        actor_role: "manager",
        input: input("Org A only"),
      },
      adminClient,
    );
    createdIds.push(created.id);

    await expect(
      approveWorkflow(
        {
          caller_org_id: orgB,
          actor_id: ACTOR,
          actor_role: "org_admin",
          directive_id: created.id,
        },
        adminClient,
      ),
    ).rejects.toMatchObject({ kind: "not_found" });

    // Still pending for orgA.
    const pending = await listPendingWorkflows(orgA, adminClient);
    expect(pending.some((w) => w.id === created.id)).toBe(true);
  });
});
