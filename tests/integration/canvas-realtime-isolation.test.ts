/**
 * D-006 / canvas-realtime-isolation — Spec AC-14.
 *
 * Two clients (rep A in workspace A; rep B in workspace B) subscribe to the
 * SAME `canvas:lead:<leadA.id>` channel. We then INSERT an activity attached
 * to leadA. Assert: A receives a postgres_changes broadcast for the new row;
 * B does not (Supabase Realtime respects RLS — B's auth.app_org_id() differs
 * so the broadcast is filtered out).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadCanvasChannel } from "@/lib/canvas/api";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionOrg,
  provisionUser,
  provisionWorkspace,
  userClient,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG_A = `canvas-rt-a-${Date.now()}`;
const SLUG_B = `canvas-rt-b-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgA: string;
let orgB: string;
let wsA: string;
let wsB: string;
let repA: ProvisionedUser;
let repB: ProvisionedUser;
let leadAId: string;

beforeAll(async () => {
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
  wsA = await provisionWorkspace(orgA, "ws-a");
  wsB = await provisionWorkspace(orgB, "ws-b");

  repA = await provisionUser({
    email: `rt-rep-a-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rt-a",
    base_role: "sales_rep",
    organization_id: orgA,
  });
  repB = await provisionUser({
    email: `rt-rep-b-${Date.now()}@test.builtrix.in`,
    password: "T3st-pass-rt-b",
    base_role: "sales_rep",
    organization_id: orgB,
  });

  const { data: leadRow, error } = await adminClient
    .from("nodes")
    .insert({
      organization_id: orgA,
      workspace_id: wsA,
      node_type: "lead",
      label: "Realtime test lead",
      data: { phone: "+91-9000000003", source: "walkin" },
      state: "new",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw error;
  leadAId = leadRow.id;
}, 90_000);

afterAll(async () => {
  if (repA) await deleteAuthUser(repA.user_id);
  if (repB) await deleteAuthUser(repB.user_id);
  await adminClient.from("edges").delete().eq("organization_id", orgA);
  await adminClient.from("nodes").delete().eq("organization_id", orgA);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
}, 60_000);

describe("Realtime channel isolation by RLS", () => {
  it("rep A receives the activity broadcast; rep B does not", async () => {
    const cA = await userClient(repA);
    const cB = await userClient(repB);

    const channelName = leadCanvasChannel(leadAId);
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    const chA = cA.channel(channelName);
    const chB = cB.channel(channelName);

    type PG = "postgres_changes";
    type Filter = { event: string; schema: string; table: string; filter: string };
    (chA as unknown as { on: (e: PG, f: Filter, cb: (p: { new?: unknown }) => void) => unknown }).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "nodes", filter: "node_type=eq.activity" },
      (payload) => receivedA.push(payload?.new),
    );
    (chB as unknown as { on: (e: PG, f: Filter, cb: (p: { new?: unknown }) => void) => unknown }).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "nodes", filter: "node_type=eq.activity" },
      (payload) => receivedB.push(payload?.new),
    );

    chA.subscribe();
    chB.subscribe();

    // Wait for subscriptions to settle on the realtime gateway.
    await new Promise((r) => setTimeout(r, 1500));

    // Insert an activity attached to leadA via service-role.
    const { data: actRow, error: actErr } = await adminClient
      .from("nodes")
      .insert({
        organization_id: orgA,
        workspace_id: wsA,
        node_type: "activity",
        label: "RT broadcast probe",
        data: { kind: "probe", text: "hello" },
        state: null,
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    if (actErr) throw actErr;

    await adminClient.from("edges").insert({
      organization_id: orgA,
      workspace_id: wsA,
      from_node_id: actRow.id,
      to_node_id: leadAId,
      edge_type: "mentioned_in",
      weight: 1,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    });

    // Allow propagation.
    await new Promise((r) => setTimeout(r, 2000));

    try {
      expect(receivedA.length).toBeGreaterThanOrEqual(1);
      expect(receivedB.length).toBe(0);
    } finally {
      await chA.unsubscribe();
      await chB.unsubscribe();
    }
  }, 30_000);
});
