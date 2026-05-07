/**
 * D-001 / B6 — audit_log immutability.
 * Spec AC-12 (UPDATE rejected), AC-13 (DELETE rejected).
 *
 * The audit_log table has RLS enabled. The migration declares an INSERT policy
 * for service_role only; no UPDATE policy and no DELETE policy. Postgres RLS
 * with no permissive policy = forbidden, even for service_role.
 *
 * On Supabase managed databases, service_role does NOT bypass RLS.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "./helpers/setup";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
let insertedId: string | null = null;

beforeAll(async () => {
  const { data, error } = await adminClient
    .from("audit_log")
    .insert({
      actor_id: SYSTEM_UUID,
      actor_type: "system",
      actor_role: "system",
      table_name: "test_fixture",
      action: "test_insert",
      diff: { test: true },
    })
    .select("id")
    .single();
  if (error) throw error;
  insertedId = data.id;
});

afterAll(async () => {
  // We CANNOT delete the row (that's the point), so the test row stays.
  // Leave a marker action so future runs can locate-and-skip if needed.
});

describe("audit_log is append-only", () => {
  it("INSERT via service_role succeeds (positive)", () => {
    expect(insertedId).toBeTruthy();
  });

  it("AC-12: UPDATE on audit_log is rejected", async () => {
    const { error } = await adminClient
      .from("audit_log")
      .update({ action: "tampered" })
      .eq("id", insertedId!);
    // Supabase returns either an RLS violation or a 0-rows-affected outcome.
    // We assert the row was NOT changed.
    const { data: after } = await adminClient
      .from("audit_log")
      .select("action")
      .eq("id", insertedId!)
      .single();
    expect(after?.action).toBe("test_insert");
    // Optional: assert error too if RLS surfaces it.
    if (error) expect(error.message).toMatch(/policy|permission|rls|append-only|rejected/i);
  });

  it("AC-13: DELETE on audit_log is rejected", async () => {
    const { error } = await adminClient
      .from("audit_log")
      .delete()
      .eq("id", insertedId!);
    const { data: after } = await adminClient
      .from("audit_log")
      .select("id")
      .eq("id", insertedId!)
      .maybeSingle();
    expect(after?.id).toBe(insertedId);
    if (error) expect(error.message).toMatch(/policy|permission|rls|append-only|rejected/i);
  });
});
