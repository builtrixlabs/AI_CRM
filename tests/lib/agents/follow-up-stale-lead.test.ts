import { beforeEach, describe, expect, it, vi } from "vitest";

// D-614 — enqueueFollowUpDraft calls dispatchApprovedDraft on the
// auto_send path. Mock it; dispatch internals are covered by their own suite.
const mocks = vi.hoisted(() => ({
  dispatchApprovedDraft: vi.fn(),
}));
vi.mock("@/lib/agents/follow-up/dispatch", () => ({
  dispatchApprovedDraft: mocks.dispatchApprovedDraft,
  FOLLOW_UP_SERVICE_ACCOUNT: "00000000-0000-4000-8000-000000000002",
}));

import {
  AGENT_KIND,
  STALE_THRESHOLD_DAYS,
  draftFollowUp,
  enqueueFollowUpDraft,
  findStaleLeads,
} from "@/lib/agents/follow-up-stale-lead";

beforeEach(() => {
  mocks.dispatchApprovedDraft.mockReset();
});

const ORG = "11111111-2222-4333-8444-555555555555";

describe("draftFollowUp", () => {
  it("uses WhatsApp when phone is present + valid", () => {
    const r = draftFollowUp({
      label: "Sharma",
      data: { phone: "+919876543210", name: "Riya" },
    });
    expect(r.channel).toBe("whatsapp");
    expect(r.body).toContain("Riya");
  });

  it("falls back to email when no phone but email present", () => {
    const r = draftFollowUp({
      label: "Bose",
      data: { email: "rakesh@example.com", name: "Rakesh" },
    });
    expect(r.channel).toBe("email");
    expect(r.body).toContain("Rakesh");
  });

  it("falls back to label when name absent", () => {
    const r = draftFollowUp({ label: "Anonymous Lead", data: {} });
    expect(r.body).toContain("Anonymous Lead");
  });

  it("includes interested_property when present", () => {
    const r = draftFollowUp({
      label: "x",
      data: { name: "Jia", phone: "+91777", interested_property: "Skyline 3BHK" },
    });
    expect(r.body).toContain("Skyline 3BHK");
  });

  it("rejects malformed phone (treats as email channel)", () => {
    const r = draftFollowUp({
      label: "x",
      data: { phone: "not-a-phone", email: "x@y.com" },
    });
    expect(r.channel).toBe("email");
  });
});

describe("findStaleLeads", () => {
  const NOW = 1_730_000_000_000; // arbitrary epoch
  const STALE_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  function makeClient(opts: { rows: unknown[] }) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      limit: vi.fn(() =>
        Promise.resolve({ data: opts.rows, error: null })
      ),
    };
    return {
      from: vi.fn(() => chain),
    };
  }

  it("returns rows where last_contact_at (or created_at fallback) is past threshold", async () => {
    const stale = new Date(NOW - STALE_MS - 1000).toISOString();
    const fresh = new Date(NOW - 1000).toISOString();
    const client = makeClient({
      rows: [
        {
          id: "lead-stale",
          organization_id: ORG,
          workspace_id: null,
          label: "Stale",
          state: "new",
          data: { last_contact_at: stale },
          created_at: stale,
        },
        {
          id: "lead-fresh",
          organization_id: ORG,
          workspace_id: null,
          label: "Fresh",
          state: "contacted",
          data: { last_contact_at: fresh },
          created_at: stale, // created old but contacted recently → fresh
        },
      ],
    });
    const r = await findStaleLeads(ORG, NOW, client as never);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("lead-stale");
  });

  it("falls back to created_at when last_contact_at missing", async () => {
    const stale = new Date(NOW - STALE_MS - 1000).toISOString();
    const client = makeClient({
      rows: [
        {
          id: "no-contact-data",
          organization_id: ORG,
          workspace_id: null,
          label: "x",
          state: "new",
          data: {},
          created_at: stale,
        },
      ],
    });
    const r = await findStaleLeads(ORG, NOW, client as never);
    expect(r).toHaveLength(1);
  });

  it("empty data → empty result", async () => {
    const client = makeClient({ rows: [] });
    const r = await findStaleLeads(ORG, NOW, client as never);
    expect(r).toEqual([]);
  });
});

describe("enqueueFollowUpDraft", () => {
  function makeInsertClient(opts: {
    insert_error?: { code?: string; message?: string };
  }) {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    const builder = {
      insert: vi.fn((row: unknown) => {
        inserts.push(row);
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: opts.insert_error ? null : { id: "queue-1" },
                error: opts.insert_error ?? null,
              })
            ),
          })),
        };
      }),
      // D-614 auto_send promotes the pending row to approved.
      update: vi.fn((patch: unknown) => {
        updates.push(patch);
        const ub: Record<string, unknown> = {};
        Object.assign(ub, {
          eq: vi.fn(() => ub),
          then: (onF: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(onF),
        });
        return ub;
      }),
    };
    return {
      inserts,
      updates,
      client: { from: vi.fn(() => builder) },
    };
  }

  const LEAD = {
    id: "lead-1",
    organization_id: ORG,
    workspace_id: null,
    label: "Sharma",
    state: "contacted",
    data: { phone: "+919876543210", name: "Riya" },
    created_at: "2026-04-01T00:00:00Z",
  };

  it("inserts a pending row with the right shape", async () => {
    const env = makeInsertClient({});
    const r = await enqueueFollowUpDraft(LEAD, env.client as never);
    expect(r).toEqual({ ok: true, queue_id: "queue-1", dispatched: false });
    expect(env.inserts).toHaveLength(1);
    const row = env.inserts[0] as {
      organization_id: string;
      lead_id: string;
      agent_kind: string;
      channel: string;
      status: string;
    };
    expect(row.lead_id).toBe(LEAD.id);
    expect(row.agent_kind).toBe(AGENT_KIND);
    expect(row.channel).toBe("whatsapp");
    expect(row.status).toBe("pending");
  });

  it("returns already_pending on PK / partial-unique conflict (23505)", async () => {
    const env = makeInsertClient({
      insert_error: { code: "23505", message: "duplicate" },
    });
    const r = await enqueueFollowUpDraft(LEAD, env.client as never);
    expect(r).toEqual({ ok: false, error: "already_pending" });
  });

  it("returns the error message on other DB errors", async () => {
    const env = makeInsertClient({
      insert_error: { code: "00000", message: "kaboom" },
    });
    const r = await enqueueFollowUpDraft(LEAD, env.client as never);
    expect(r).toEqual({ ok: false, error: "kaboom" });
  });

  // ── D-614 send policy ────────────────────────────────────────────────
  it("under require_approval (the default): inserts pending, no dispatch", async () => {
    const env = makeInsertClient({});
    const r = await enqueueFollowUpDraft(
      LEAD,
      env.client as never,
      "require_approval",
    );
    expect(r).toEqual({ ok: true, queue_id: "queue-1", dispatched: false });
    expect(env.updates).toHaveLength(0);
    expect(mocks.dispatchApprovedDraft).not.toHaveBeenCalled();
  });

  it("under auto_send: promotes the row to approved and dispatches (AC-4)", async () => {
    const env = makeInsertClient({});
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: true,
      status: "sent",
      provider: "mock",
      provider_message_id: "m",
      activity_id: "a",
    });
    const r = await enqueueFollowUpDraft(
      LEAD,
      env.client as never,
      "auto_send",
    );
    expect(r).toEqual({ ok: true, queue_id: "queue-1", dispatched: true });
    expect(env.updates).toHaveLength(1);
    expect((env.updates[0] as { status: string }).status).toBe("approved");
    expect(mocks.dispatchApprovedDraft).toHaveBeenCalledOnce();
  });

  it("under auto_send: a dispatch failure still returns ok with dispatched=false", async () => {
    const env = makeInsertClient({});
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      message: "whatsapp",
    });
    const r = await enqueueFollowUpDraft(
      LEAD,
      env.client as never,
      "auto_send",
    );
    expect(r).toEqual({ ok: true, queue_id: "queue-1", dispatched: false });
    // The row was still promoted to approved — it surfaces in the queue
    // with send_error for the operator to retry (the D-415 contract).
    expect(env.updates).toHaveLength(1);
  });
});
