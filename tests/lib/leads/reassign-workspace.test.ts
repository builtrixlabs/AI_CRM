import { describe, expect, it, vi } from "vitest";
import { reassignLeadToWorkspace } from "@/lib/leads/reassign-workspace";

type Lead = { id: string; organization_id: string; workspace_id: string | null; kind: string; deleted_at: string | null };
type Workspace = { id: string; organization_id: string; deleted_at: string | null };

function makeClient(opts: {
  lead?: Lead | null;
  workspace?: Workspace | null;
  update_error?: string;
}) {
  const updates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  return {
    state: { updates, audits },
    from: vi.fn((table: string) => {
      if (table === "nodes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: opts.lead ?? null, error: null })),
            })),
          })),
          update: vi.fn((row: Record<string, unknown>) => ({
            eq: vi.fn(() => {
              if (opts.update_error) return Promise.resolve({ error: { message: opts.update_error } });
              updates.push(row);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === "workspaces") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: opts.workspace ?? null, error: null })),
            })),
          })),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            audits.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { select: vi.fn() };
    }),
  };
}

const ARGS = { lead_id: "L1", target_workspace_id: "W2", actor_id: "U1", reason: "merging Bengaluru region" };

describe("reassignLeadToWorkspace", () => {
  it("reassigns when same-org and writes audit", async () => {
    const c = makeClient({
      lead: { id: "L1", organization_id: "ORG", workspace_id: "W1", kind: "lead", deleted_at: null },
      workspace: { id: "W2", organization_id: "ORG", deleted_at: null },
    });
    const r = await reassignLeadToWorkspace(ARGS, c as never);
    expect(r).toEqual({ ok: true, lead_id: "L1", from_workspace_id: "W1", to_workspace_id: "W2" });
    expect(c.state.updates[0]).toMatchObject({ workspace_id: "W2" });
    expect(c.state.audits[0]).toMatchObject({
      action: "lead_workspace_reassigned",
      diff: { from_workspace_id: "W1", to_workspace_id: "W2", reason: "merging Bengaluru region" },
    });
  });

  it.each([
    [{ ...ARGS, lead_id: "" }, "lead_id_required"],
    [{ ...ARGS, target_workspace_id: "" }, "target_workspace_id_required"],
    [{ ...ARGS, actor_id: "" }, "actor_id_required"],
    [{ ...ARGS, reason: "  " }, "reason_required_min_5_chars"],
    [{ ...ARGS, reason: "x" }, "reason_required_min_5_chars"],
  ])("rejects invalid args (%j)", async (args, err) => {
    const c = makeClient({});
    expect(await reassignLeadToWorkspace(args, c as never)).toEqual({ ok: false, error: err });
  });

  it("blocks reassignment to a workspace in a different org", async () => {
    const c = makeClient({
      lead: { id: "L1", organization_id: "ORG-A", workspace_id: "W1", kind: "lead", deleted_at: null },
      workspace: { id: "W2", organization_id: "ORG-B", deleted_at: null },
    });
    const r = await reassignLeadToWorkspace(ARGS, c as never);
    expect(r).toEqual({ ok: false, error: "cross_org_reassignment_forbidden" });
    expect(c.state.updates).toHaveLength(0);
  });

  it("rejects when lead is missing or wrong kind", async () => {
    expect(
      await reassignLeadToWorkspace(ARGS, makeClient({ lead: null }) as never),
    ).toEqual({ ok: false, error: "lead_not_found" });

    expect(
      await reassignLeadToWorkspace(ARGS, makeClient({
        lead: { id: "L1", organization_id: "ORG", workspace_id: "W1", kind: "deal", deleted_at: null },
      }) as never),
    ).toEqual({ ok: false, error: "not_a_lead" });

    expect(
      await reassignLeadToWorkspace(ARGS, makeClient({
        lead: { id: "L1", organization_id: "ORG", workspace_id: "W1", kind: "lead", deleted_at: "2026-05-01T00:00:00Z" },
      }) as never),
    ).toEqual({ ok: false, error: "lead_deleted" });
  });

  it("rejects when target = current workspace (no-op)", async () => {
    const c = makeClient({
      lead: { id: "L1", organization_id: "ORG", workspace_id: "W2", kind: "lead", deleted_at: null },
      workspace: { id: "W2", organization_id: "ORG", deleted_at: null },
    });
    expect(await reassignLeadToWorkspace(ARGS, c as never))
      .toEqual({ ok: false, error: "already_in_target_workspace" });
  });

  it("surfaces update error", async () => {
    const c = makeClient({
      lead: { id: "L1", organization_id: "ORG", workspace_id: "W1", kind: "lead", deleted_at: null },
      workspace: { id: "W2", organization_id: "ORG", deleted_at: null },
      update_error: "rls_denied",
    });
    expect(await reassignLeadToWorkspace(ARGS, c as never))
      .toEqual({ ok: false, error: "rls_denied" });
  });
});
