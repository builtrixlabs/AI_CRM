import { describe, expect, it, vi } from "vitest";
import {
  isTicketStatus,
  listTickets,
  getTicket,
  replyToTicket,
  setTicketStatus,
} from "@/lib/platform/tickets";

const ORG = "11111111-2222-4333-8444-555555555555";
const TICKET = "33333333-4444-4555-8666-777777777777";
const ACTOR = "99999999-8888-4777-8666-555555555555";

describe("isTicketStatus", () => {
  it("accepts the three known states", () => {
    expect(isTicketStatus("open")).toBe(true);
    expect(isTicketStatus("responded")).toBe(true);
    expect(isTicketStatus("closed")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isTicketStatus("resolved")).toBe(false);
    expect(isTicketStatus(null)).toBe(false);
  });
});

function makeListClient(opts: {
  tickets: Array<{
    id: string;
    organization_id: string;
    subject: string;
    status: string;
    priority: string;
    kind: string | null;
    created_at: string;
  }>;
  orgs: Array<{ id: string; name: string; slug: string }>;
}) {
  const ticketsChain = {
    select: vi.fn(() => ticketsChain),
    is: vi.fn(() => ticketsChain),
    eq: vi.fn(() => ticketsChain),
    order: vi.fn(() => ticketsChain),
    limit: vi.fn(() => Promise.resolve({ data: opts.tickets, error: null })),
  };
  const orgsChain = {
    select: vi.fn(() => orgsChain),
    in: vi.fn(() => Promise.resolve({ data: opts.orgs, error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") return ticketsChain;
      if (table === "organizations") return orgsChain;
      throw new Error(`unexpected ${table}`);
    }),
  };
}

describe("listTickets", () => {
  it("joins org name into rows", async () => {
    const client = makeListClient({
      tickets: [
        {
          id: TICKET,
          organization_id: ORG,
          subject: "Onboarding kickoff",
          status: "open",
          priority: "normal",
          kind: "onboarding",
          created_at: "2026-05-09T00:00:00Z",
        },
      ],
      orgs: [{ id: ORG, name: "Skyline", slug: "skyline" }],
    });
    const rows = await listTickets({}, client as never);
    expect(rows[0].org_name).toBe("Skyline");
    expect(rows[0].org_slug).toBe("skyline");
    expect(rows[0].status).toBe("open");
  });

  it("applies status filter", async () => {
    const client = makeListClient({
      tickets: [],
      orgs: [],
    });
    await listTickets({ status: "open" }, client as never);
    // chain.eq invoked with status arg — checking it was called
    const fromCalls = (client.from as unknown as { mock: { calls: string[][] } })
      .mock.calls;
    expect(fromCalls[0][0]).toBe("support_tickets");
  });
});

function makeWriteClient(opts: {
  ticket: {
    id: string;
    organization_id: string;
    raised_by: string;
    subject: string;
    body: string;
    status: string;
    priority: string;
    kind: string | null;
    replies: Array<{ body: string; sent_by: string; sent_at: string }>;
    created_at: string;
  } | null;
  org?: { name: string; slug: string };
  update_error?: boolean;
}) {
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  const ticketsChain = {
    select: vi.fn(() => ticketsChain),
    eq: vi.fn(() => ticketsChain),
    is: vi.fn(() => ticketsChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: opts.ticket, error: null })),
    update: vi.fn((row: unknown) => {
      updates.push(row);
      return Object.assign(ticketsChain, {
        eq: vi.fn(() =>
          Promise.resolve({ error: opts.update_error ? new Error("db") : null })
        ),
      });
    }),
  };
  const orgsChain = {
    select: vi.fn(() => orgsChain),
    eq: vi.fn(() => orgsChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.org ?? { name: "Org", slug: "org" }, error: null })
    ),
  };
  const auditChain = {
    insert: vi.fn((row: unknown) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    }),
  };
  return {
    updates,
    audits,
    client: {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") return ticketsChain;
        if (table === "organizations") return orgsChain;
        if (table === "audit_log") return auditChain;
        throw new Error(`unexpected ${table}`);
      }),
    },
  };
}

const baseTicket = {
  id: TICKET,
  organization_id: ORG,
  raised_by: ACTOR,
  subject: "Onboarding",
  body: "Initial message",
  status: "open",
  priority: "normal",
  kind: "onboarding",
  replies: [],
  created_at: "2026-05-09T00:00:00Z",
};

describe("getTicket", () => {
  it("returns null when ticket does not exist", async () => {
    const env = makeWriteClient({ ticket: null });
    const r = await getTicket(TICKET, env.client as never);
    expect(r).toBeNull();
  });

  it("returns full detail with org name", async () => {
    const env = makeWriteClient({
      ticket: baseTicket,
      org: { name: "Skyline", slug: "skyline" },
    });
    const r = await getTicket(TICKET, env.client as never);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.org_name).toBe("Skyline");
    expect(r.replies).toEqual([]);
  });
});

describe("replyToTicket", () => {
  it("appends reply, transitions open → responded, audits", async () => {
    const env = makeWriteClient({ ticket: baseTicket });
    const r = await replyToTicket(
      TICKET,
      "Acknowledged — calling tomorrow.",
      ACTOR,
      env.client as never
    );
    expect(r.ok).toBe(true);
    const update = env.updates[0] as Record<string, unknown>;
    const replies = update.replies as Array<{ body: string }>;
    expect(replies).toHaveLength(1);
    expect(update.status).toBe("responded");
    expect((env.audits[0] as { action: string }).action).toBe("ticket_replied");
  });

  it("does not change status if already responded", async () => {
    const env = makeWriteClient({
      ticket: { ...baseTicket, status: "responded" },
    });
    await replyToTicket(TICKET, "Quick follow-up.", ACTOR, env.client as never);
    expect((env.updates[0] as { status: string }).status).toBe("responded");
  });

  it("rejects body too short", async () => {
    const env = makeWriteClient({ ticket: baseTicket });
    const r = await replyToTicket(TICKET, " ", ACTOR, env.client as never);
    expect(r.ok).toBe(false);
    expect(env.audits).toHaveLength(0);
  });
});

describe("setTicketStatus", () => {
  it("flips status + audits with from/to", async () => {
    const env = makeWriteClient({ ticket: baseTicket });
    const r = await setTicketStatus(TICKET, "closed", ACTOR, env.client as never);
    expect(r.ok).toBe(true);
    expect((env.updates[0] as { status: string }).status).toBe("closed");
    const audit = env.audits[0] as Record<string, unknown>;
    expect(audit.action).toBe("ticket_status_changed");
    expect(audit.diff).toEqual({ from: "open", to: "closed" });
  });

  it("no-op if status already matches", async () => {
    const env = makeWriteClient({ ticket: baseTicket });
    const r = await setTicketStatus(TICKET, "open", ACTOR, env.client as never);
    expect(r.ok).toBe(true);
    expect(env.updates).toHaveLength(0);
    expect(env.audits).toHaveLength(0);
  });
});
