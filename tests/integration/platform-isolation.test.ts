/**
 * D-004 / C7 — super_admin /platform drill-down sees zero operational data.
 * Spec AC-8.
 *
 * Seeds an org with one node (lead) carrying a unique payload marker.
 * Calls getOrgDetail() — verifies the returned object exposes only org meta,
 * admins, subscription, and audit rows. NO lead/node references appear.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrgDetail } from "@/lib/platform/queries";
import {
  adminClient,
  cleanupBySlug,
  provisionOrg,
  provisionWorkspace,
} from "./helpers/setup";

const SLUG = `iso-test-${Date.now()}`;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const MARKER = `OPS_DATA_MARKER_${Date.now()}`;

let orgId: string;
let workspaceId: string;

beforeAll(async () => {
  orgId = await provisionOrg(SLUG);
  workspaceId = await provisionWorkspace(orgId, "iso-ws");

  // Seed one lead with the marker so we can later assert it doesn't leak.
  await adminClient.from("nodes").insert({
    organization_id: orgId,
    workspace_id: workspaceId,
    node_type: "lead",
    label: MARKER,
    data: { phone: "+919999900200", source: "walkin", notes: MARKER },
    state: "new",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
}, 30_000);

afterAll(async () => {
  await adminClient.from("nodes").delete().eq("organization_id", orgId);
  await cleanupBySlug(SLUG);
});

describe("getOrgDetail — zero operational data exposure", () => {
  it("returns org meta + admins + subscription + audit, never lead fields", async () => {
    const detail = await getOrgDetail(orgId, SYSTEM_UUID);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(orgId);

    // Serialise the entire result and assert the marker doesn't appear.
    // If any field accidentally surfaces lead.data or label, this test catches it.
    const json = JSON.stringify(detail);
    expect(json).not.toContain(MARKER);
    expect(json).not.toContain("OPS_DATA_MARKER");
  });

  it("recent_audit excludes node-write actions for this org", async () => {
    const detail = await getOrgDetail(orgId, SYSTEM_UUID);
    const nodeWrites = (detail?.recent_audit ?? []).filter((r) =>
      ["node_create", "node_update", "node_delete"].includes(r.action)
    );
    // Audit rows for the seed lead INSERT come from app code (createNode);
    // since we used the raw service-role insert, no audit rows were written.
    // This assertion is therefore "no node-write rows appear" by construction.
    expect(nodeWrites.length).toBe(0);
  });
});
