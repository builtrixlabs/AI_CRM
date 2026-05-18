import { describe, expect, it, vi } from "vitest";
import { hardDeleteOrganization } from "@/lib/platform/hard-delete";

function makeClient(rpc: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn(() => Promise.resolve(rpc)) };
}

describe("hardDeleteOrganization", () => {
  it("rejects empty organization_id", async () => {
    expect(await hardDeleteOrganization("", "actor", "long-enough-reason", makeClient({ data: null, error: null }) as never))
      .toEqual({ ok: false, error: "organization_id_required" });
  });

  it("rejects empty actor_id", async () => {
    expect(await hardDeleteOrganization("org", "", "long-enough-reason", makeClient({ data: null, error: null }) as never))
      .toEqual({ ok: false, error: "actor_id_required" });
  });

  it.each([[""], [" "], ["a"], ["abcd"]])("rejects reason shorter than 5 chars: %s", async (reason) => {
    const c = makeClient({ data: null, error: null });
    expect(await hardDeleteOrganization("org", "actor", reason, c as never))
      .toEqual({ ok: false, error: "reason_required_min_5_chars" });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with trimmed reason and returns counts on success", async () => {
    const c = makeClient({
      data: {
        organization_id: "org-1",
        reason: "departing tenant",
        counts: { nodes: 217, organizations: 1, api_audit_log: 4500 },
      },
      error: null,
    });
    const r = await hardDeleteOrganization("org-1", "actor-1", "  departing tenant  ", c as never);
    expect(r.ok).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("hard_delete_organization", {
      p_org_id: "org-1",
      p_actor_id: "actor-1",
      p_reason: "departing tenant",
    });
    if (r.ok) {
      expect(r.counts).toEqual({ nodes: 217, organizations: 1, api_audit_log: 4500 });
    }
  });

  it("surfaces RPC error verbatim", async () => {
    const c = makeClient({ data: null, error: { message: "forbidden: super_admin required (got org_owner)" } });
    expect(await hardDeleteOrganization("org-1", "actor-1", "departing tenant", c as never))
      .toEqual({ ok: false, error: "forbidden: super_admin required (got org_owner)" });
  });

  it("returns no_rpc_payload when data is null without error", async () => {
    const c = makeClient({ data: null, error: null });
    expect(await hardDeleteOrganization("org-1", "actor-1", "departing tenant", c as never))
      .toEqual({ ok: false, error: "no_rpc_payload" });
  });
});
