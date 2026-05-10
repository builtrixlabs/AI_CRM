import { describe, expect, it, vi } from "vitest";
import {
  AGENT_KIND,
  STALE_THRESHOLD_DAYS,
  draftFollowUp,
  enqueueFollowUpDraft,
  findStaleLeads,
} from "@/lib/agents/follow-up-stale-lead";

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
    return {
      inserts,
      client: {
        from: vi.fn(() => ({
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
        })),
      },
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
    expect(r).toEqual({ ok: true, queue_id: "queue-1" });
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
});
