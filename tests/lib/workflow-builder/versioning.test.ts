import { describe, expect, it, vi } from "vitest";
import {
  createNewVersion,
  listVersionHistory,
  revertToVersion,
} from "@/lib/workflow-builder";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4444-8555-666666666666";

function chain(resolved: unknown) {
  const c: Record<string, unknown> = {
    select: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
    eq: vi.fn(() => c),
    neq: vi.fn(() => c),
    order: vi.fn(() => c),
    is: vi.fn(() => c),
    maybeSingle: vi.fn(() => Promise.resolve(resolved)),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolved).then(resolve),
  };
  return c;
}

describe("createNewVersion", () => {
  it("clones the source row into a new draft with parent_id + version+1", async () => {
    const sourceRow = {
      id: "src-1",
      organization_id: ORG,
      code: "wf.lead.created",
      display_name: "Welcome a new lead",
      trigger_kind: "lead.created",
      trigger_config: {},
      action_kind: "send_template_message",
      action_config: {},
      tier: "T2",
      enabled: true,
      version: 1,
      parent_id: null,
      compiled_dag: { version: 1, nodes: [], edges: [] },
      lifecycle_status: "live",
    };
    let call = 0;
    const inserts: unknown[] = [];
    const client = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) return chain({ data: sourceRow, error: null });
        // Insert chain captures the row.
        const c: Record<string, unknown> = {
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return c;
          }),
          select: vi.fn(() => c),
          single: vi.fn(() =>
            Promise.resolve({ data: { id: "new-1", version: 2 }, error: null }),
          ),
        };
        return c;
      }),
    };
    const r = await createNewVersion({
      caller_org_id: ORG,
      source_id: "src-1",
      actor_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: true, id: "new-1", version: 2 });
    const inserted = inserts[0] as { parent_id: string; version: number; lifecycle_status: string; enabled: boolean };
    expect(inserted.parent_id).toBe("src-1");
    expect(inserted.version).toBe(2);
    expect(inserted.lifecycle_status).toBe("draft");
    expect(inserted.enabled).toBe(false);
  });

  it("returns 'not_found' when the source row is missing", async () => {
    const client = {
      from: vi.fn(() => chain({ data: null, error: null })),
    };
    const r = await createNewVersion({
      caller_org_id: ORG,
      source_id: "missing",
      actor_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("revertToVersion", () => {
  it("rejects when the target is already live", async () => {
    const client = {
      from: vi.fn(() =>
        chain({
          data: {
            id: "v3",
            organization_id: ORG,
            code: "wf.x",
            lifecycle_status: "live",
          },
          error: null,
        }),
      ),
    };
    const r = await revertToVersion({
      caller_org_id: ORG,
      target_id: "v3",
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "already_live" });
  });

  it("demotes the current live + promotes the target", async () => {
    let call = 0;
    const client = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return chain({
            data: {
              id: "v2",
              organization_id: ORG,
              code: "wf.x",
              lifecycle_status: "archived",
            },
            error: null,
          });
        }
        return chain({ data: null, error: null });
      }),
    };
    const r = await revertToVersion({
      caller_org_id: ORG,
      target_id: "v2",
      client: client as never,
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("listVersionHistory", () => {
  it("returns rows ordered ascending by version", async () => {
    const rows = [
      { id: "v1", version: 1, lifecycle_status: "archived", parent_id: null, created_at: "x" },
      { id: "v2", version: 2, lifecycle_status: "live", parent_id: "v1", created_at: "y" },
    ];
    const client = {
      from: vi.fn(() => chain({ data: rows, error: null })),
    };
    const out = await listVersionHistory({
      caller_org_id: ORG,
      code: "wf.x",
      client: client as never,
    });
    expect(out).toEqual(rows);
  });
});
