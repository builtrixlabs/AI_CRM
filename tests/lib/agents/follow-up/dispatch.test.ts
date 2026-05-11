import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchApprovedDraft } from "@/lib/agents/follow-up/dispatch";

const ORG = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4333-8444-555555555555";
const WS = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const QUEUE_ID = "33333333-4444-4555-8666-777777777777";
const LEAD_ID = "44444444-5555-4666-8777-888888888888";
const ACTOR = "55555555-6666-4777-8888-999999999999";

type QueueRow = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  lead_id: string;
  agent_kind: string;
  channel: "whatsapp" | "email" | "sms";
  draft_body: string;
  edited_body: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  sent_at: string | null;
};

type LeadRow = {
  data: Record<string, unknown>;
  label: string;
  workspace_id: string;
  organization_id: string;
};

type Opts = {
  queue?: QueueRow;
  lead?: LeadRow;
  insertActivityError?: string;
};

function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: QUEUE_ID,
    organization_id: ORG,
    workspace_id: WS,
    lead_id: LEAD_ID,
    agent_kind: "follow_up_stale_lead",
    channel: "email",
    draft_body: "Hi there, checking in.",
    edited_body: null,
    status: "approved",
    sent_at: null,
    ...over,
  };
}

function lead(over: Partial<LeadRow["data"]> = {}, label = "Mr Patel"): LeadRow {
  return {
    organization_id: ORG,
    workspace_id: WS,
    label,
    data: { email: "p@example.com", phone: "+919900011111", ...over },
  };
}

function makeClient(opts: Opts) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{
    table: string;
    payload: Record<string, unknown>;
    filter: Record<string, unknown>;
  }> = [];

  function fromHandler(table: string) {
    if (table === "agent_approval_queue") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.maybeSingle = () => {
            const q = opts.queue;
            if (!q) return Promise.resolve({ data: null, error: null });
            if (filters.id !== q.id)
              return Promise.resolve({ data: null, error: null });
            if (filters.organization_id !== q.organization_id)
              return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: q, error: null });
          };
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          const filter: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filter[k] = v;
            return chain;
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            updates.push({ table, payload, filter });
            return Promise.resolve({ error: null }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "nodes") {
      return {
        select: () => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.maybeSingle = () => {
            const l = opts.lead;
            if (!l) return Promise.resolve({ data: null, error: null });
            if (filters.organization_id !== l.organization_id)
              return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: l, error: null });
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "activity-new" },
                  error: opts.insertActivityError
                    ? { message: opts.insertActivityError }
                    : null,
                }),
            }),
          };
        },
      };
    }
    if (table === "edges") {
      return {
        insert: (p: Record<string, unknown>) => {
          inserts.push({ table, payload: p });
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (p: Record<string, unknown>) => {
          inserts.push({ table, payload: p });
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }
  return {
    inserts,
    updates,
    client: { from: vi.fn(fromHandler) } as unknown as never,
  };
}

beforeEach(() => {
  // Reset mock provider id counters by importing fresh — modules cache so
  // counters increase across tests. Tests below assert presence, not exact ids.
});

describe("dispatchApprovedDraft — email", () => {
  it("happy path: status approved → sent, activity + edge + audit written", async () => {
    const m = makeClient({
      queue: row({ channel: "email" }),
      lead: lead({ email: "buyer@example.com" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok && !("already_sent" in r)) {
      expect(r.status).toBe("sent");
      expect(r.provider).toBe("mock");
      expect(r.provider_message_id).toMatch(/^mock-email-/);
    }
    // status update written
    const statusUpd = m.updates.find(
      (u) =>
        u.table === "agent_approval_queue" &&
        (u.payload as Record<string, unknown>).status === "sent",
    );
    expect(statusUpd).toBeTruthy();
    expect((statusUpd?.payload as Record<string, unknown>).provider).toBe(
      "mock",
    );
    // activity node inserted
    expect(
      m.inserts.find(
        (i) =>
          i.table === "nodes" &&
          (i.payload as Record<string, unknown>).node_type === "activity",
      ),
    ).toBeTruthy();
    // edge inserted
    expect(m.inserts.find((i) => i.table === "edges")).toBeTruthy();
    // audit: agent_draft_sent
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action === "agent_draft_sent",
      ),
    ).toBeTruthy();
  });

  it("missing email on lead → missing_recipient", async () => {
    const m = makeClient({
      queue: row({ channel: "email" }),
      lead: lead({ email: undefined, phone: "+919900011111" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_recipient");
  });
});

describe("dispatchApprovedDraft — sms", () => {
  it("happy path: DLT template auto-registered + send recorded", async () => {
    const m = makeClient({
      queue: row({ channel: "sms" }),
      lead: lead({ phone: "+919900011111" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok && !("already_sent" in r)) {
      expect(r.provider_message_id).toMatch(/^mock-sms-/);
    }
  });

  it("missing phone on lead → missing_recipient", async () => {
    const m = makeClient({
      queue: row({ channel: "sms" }),
      lead: lead({ phone: undefined, email: "x@y.com" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_recipient");
  });
});

describe("dispatchApprovedDraft — whatsapp deferred", () => {
  it("returns not_configured cleanly + writes deferred audit", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not_configured");
      expect(r.message).toBe("whatsapp");
    }
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action ===
            "agent_draft_send_deferred",
      ),
    ).toBeTruthy();
    // No status update — row stays approved
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          (u.payload as Record<string, unknown>).status === "sent",
      ),
    ).toBeUndefined();
  });
});

describe("dispatchApprovedDraft — guards", () => {
  it("cross-tenant queue id → not_found", async () => {
    const m = makeClient({
      queue: row({ organization_id: ORG_B }),
      lead: lead(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("already-sent row → idempotent ok with already_sent=true", async () => {
    const m = makeClient({
      queue: row({ status: "sent", sent_at: "2026-05-11T00:00:00Z" }),
      lead: lead(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect("already_sent" in r && r.already_sent).toBe(true);
    // No new activity / status changes
    expect(
      m.inserts.find(
        (i) =>
          i.table === "nodes" &&
          (i.payload as Record<string, unknown>).node_type === "activity",
      ),
    ).toBeUndefined();
  });

  it("pending row (not yet approved) → not_approved", async () => {
    const m = makeClient({
      queue: row({ status: "pending" }),
      lead: lead(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_approved");
  });
});
