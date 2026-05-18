import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => undefined),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mocks.send },
}));

import { ingestMihLead } from "@/lib/integrations/mih/ingest";
import type { MihLeadInbound } from "@/lib/integrations/mih/schema";

const ORG = "11111111-2222-4333-8444-555555555555";

function payload(over: Partial<MihLeadInbound> = {}): MihLeadInbound {
  return {
    organization_id: ORG,
    external_id: "mih-ext-001",
    name: "Asha Rao",
    phone_e164: "+919876543210",
    source: "meta_lead_ads",
    source_channel: "paid_social",
    source_received_at: "2026-05-14T10:00:00.000Z",
    preference: { bhk: 3 },
    raw_payload: { form_id: "abc" },
    ...over,
  } as MihLeadInbound;
}

type LeadNode = {
  id: string;
  data: Record<string, unknown>;
  source_external_id: string | null;
};

/**
 * Stateful in-memory mock of the subset of Supabase that ingestMihLead
 * touches: workspaces (one lookup), nodes (dedup SELECTs + INSERT/UPDATE),
 * and the append-only ledgers (audit_log / mih_inbound_log / event_inbox_log).
 */
function makeClient(opts: {
  workspace_id?: string | null;
  leads?: LeadNode[];
}) {
  const workspace_id =
    opts.workspace_id === undefined ? "ws-1" : opts.workspace_id;
  const nodes: LeadNode[] = (opts.leads ?? []).map((l) => ({ ...l }));
  const writes = {
    audit: [] as Array<Record<string, unknown>>,
    mih_log: [] as Array<Record<string, unknown>>,
    inbox: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };
  let counter = 1;

  function workspacesBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () =>
        Promise.resolve({
          data: workspace_id ? { id: workspace_id } : null,
          error: null,
        }),
    });
    return b;
  }

  function nodesBuilder() {
    const filters: Record<string, string> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (col: string, val: string) => {
        filters[col] = val;
        return b;
      },
      is: () => b,
      limit: () => b,
      maybeSingle: () => {
        // Dedup lookup: by source_external_id, else by data->>phone.
        let found: LeadNode | undefined;
        if (filters.source_external_id !== undefined) {
          found = nodes.find(
            (n) => n.source_external_id === filters.source_external_id,
          );
        } else if (filters["data->>phone"] !== undefined) {
          found = nodes.find(
            (n) => n.data.phone === filters["data->>phone"],
          );
        }
        return Promise.resolve({
          data: found ? { id: found.id, data: found.data } : null,
          error: null,
        });
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            const id = `lead-${counter++}`;
            nodes.push({
              id,
              data: row.data as Record<string, unknown>,
              source_external_id:
                (row.source_external_id as string | null) ?? null,
            });
            writes.inserts.push({ id, ...row });
            return Promise.resolve({ data: { id }, error: null });
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        const upd: Record<string, unknown> = { ...patch };
        const u: Record<string, unknown> = {};
        Object.assign(u, {
          eq: (col: string, val: string) => {
            upd[col] = val;
            return u;
          },
          then: (onF: (v: { error: null }) => unknown) => {
            const node = nodes.find((n) => n.id === upd.id);
            if (node) {
              node.data = patch.data as Record<string, unknown>;
              node.source_external_id =
                (patch.source_external_id as string | null) ??
                node.source_external_id;
            }
            writes.updates.push(upd);
            return Promise.resolve({ error: null }).then(onF);
          },
        });
        return u;
      },
    });
    return b;
  }

  function ledgerBuilder(bucket: Array<Record<string, unknown>>) {
    return {
      insert: (row: Record<string, unknown>) => {
        bucket.push(row);
        return Promise.resolve({ error: null });
      },
    };
  }

  const client = {
    from: (table: string) => {
      if (table === "workspaces") return workspacesBuilder();
      if (table === "nodes") return nodesBuilder();
      if (table === "audit_log") return ledgerBuilder(writes.audit);
      if (table === "mih_inbound_log") return ledgerBuilder(writes.mih_log);
      if (table === "event_inbox_log") return ledgerBuilder(writes.inbox);
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, nodes, writes };
}

beforeEach(() => {
  mocks.send.mockClear();
});

describe("ingestMihLead — create", () => {
  it("inserts a lead, writes audit + ledgers, emits lead.created", async () => {
    const { client, nodes, writes } = makeClient({ leads: [] });
    const r = await ingestMihLead({ organization_id: ORG, payload: payload() }, client as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("created");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].source_external_id).toBe("mih-ext-001");
    expect(nodes[0].data.source).toBe("meta_lead_ads");
    expect(nodes[0].data.phone).toBe("+919876543210");
    expect(writes.audit[0].action).toBe("lead_ingested");
    expect(writes.mih_log[0].status).toBe("created");
    expect(writes.inbox[0].source_product).toBe("marketing_intelligence_hub");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({
      name: "lead.created",
      data: { source: "meta_lead_ads" },
    });
  });

  it("fails with no_workspace when the org has no workspace", async () => {
    const { client, writes } = makeClient({ workspace_id: null });
    const r = await ingestMihLead({ organization_id: ORG, payload: payload() }, client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_workspace");
    expect(writes.mih_log[0].status).toBe("rejected");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("ingestMihLead — dedup + merge (baseline 122 §4-§5)", () => {
  it("merges on a duplicate external_id and does NOT re-emit lead.created", async () => {
    const { client, nodes, writes } = makeClient({
      leads: [
        {
          id: "lead-existing",
          data: { phone: "+910000000000", name: "Old Name", source: "old" },
          source_external_id: "mih-ext-001",
        },
      ],
    });
    const r = await ingestMihLead(
      { organization_id: ORG, payload: payload({ name: "Asha Rao" }) },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("duplicate_merged");
      expect(r.lead_id).toBe("lead-existing");
    }
    expect(nodes).toHaveLength(1); // no second row
    expect(nodes[0].data.name).toBe("Asha Rao"); // new non-null field won
    expect(writes.audit[0].action).toBe("lead_merged");
    expect(writes.mih_log[0].status).toBe("duplicate_merged");
    expect(mocks.send).not.toHaveBeenCalled(); // idempotency §5
  });

  it("merges on a duplicate phone_e164 when there is no external_id hit", async () => {
    const { client, nodes } = makeClient({
      leads: [
        {
          id: "lead-byphone",
          data: { phone: "+919876543210", name: "Old" },
          source_external_id: "some-other-id",
        },
      ],
    });
    const r = await ingestMihLead({ organization_id: ORG, payload: payload() }, client as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("duplicate_merged");
      expect(r.lead_id).toBe("lead-byphone");
    }
    expect(nodes).toHaveLength(1);
  });

  it("is idempotent — replaying the same external_id returns the same lead", async () => {
    const { client, nodes } = makeClient({ leads: [] });
    const first = await ingestMihLead({ organization_id: ORG, payload: payload() }, client as never);
    const second = await ingestMihLead({ organization_id: ORG, payload: payload() }, client as never);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.status).toBe("duplicate_merged");
      expect(second.lead_id).toBe(first.lead_id);
    }
    expect(nodes).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(1); // only the create emitted
  });
});
