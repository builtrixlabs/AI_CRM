import { describe, expect, it, vi } from "vitest";
import { getOrgRetentionDays } from "@/lib/platform/retention";

function makeRpcClient(rpcReturn: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn(() => Promise.resolve(rpcReturn)),
  };
}

describe("retention.getOrgRetentionDays", () => {
  it("returns the RPC value when present and finite", async () => {
    const client = makeRpcClient({ data: 45, error: null });
    const v = await getOrgRetentionDays("org-1", "api_audit_log", client as never);
    expect(v).toBe(45);
    expect(client.rpc).toHaveBeenCalledWith("get_org_retention_days", {
      p_org_id: "org-1",
      p_table: "api_audit_log",
    });
  });

  it("falls back to hardcoded default on RPC error", async () => {
    const client = makeRpcClient({ data: null, error: { message: "boom" } });
    expect(await getOrgRetentionDays("org-1", "api_audit_log", client as never)).toBe(90);
    expect(await getOrgRetentionDays("org-1", "event_inbox_log", client as never)).toBe(30);
    expect(await getOrgRetentionDays("org-1", "webhook_deliveries", client as never)).toBe(60);
  });

  it("falls back to hardcoded default on non-numeric / non-positive RPC return", async () => {
    expect(await getOrgRetentionDays("org-1", "api_audit_log", makeRpcClient({ data: 0, error: null }) as never)).toBe(90);
    expect(await getOrgRetentionDays("org-1", "api_audit_log", makeRpcClient({ data: -5, error: null }) as never)).toBe(90);
    expect(await getOrgRetentionDays("org-1", "api_audit_log", makeRpcClient({ data: null, error: null }) as never)).toBe(90);
  });

  it("coerces numeric strings", async () => {
    const v = await getOrgRetentionDays("org-1", "api_audit_log", makeRpcClient({ data: "120", error: null }) as never);
    expect(v).toBe(120);
  });
});
