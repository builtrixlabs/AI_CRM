import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchApprovedDraft } from "@/lib/agents/follow-up/dispatch";
import { getBrochureSignedUrl } from "@/lib/brochures/repository";

// D-600 — dispatch resolves brochure attachments via getBrochureSignedUrl.
// Mock just that one export; the rest of the repository module (and its
// server-only admin import) never loads.
vi.mock("@/lib/brochures/repository", () => ({
  getBrochureSignedUrl: vi.fn(),
}));

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
  attachments?: unknown;
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
  emailConfig?: Record<string, unknown>;
  smsConfig?: Record<string, unknown>;
  whatsappConfig?: Record<string, unknown>;
};

// org_{channel}_config rows for resolveOrgAdapter. provider:"mock" resolves
// to the in-memory mock adapter; the whatsapp row carries the raw `active`
// column (resolveOrgAdapter maps it to is_active).
function emailConfig(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization_id: ORG,
    provider: "mock",
    encrypted_credentials: { ciphertext: "mock" },
    from_email: null,
    from_name: null,
    is_active: true,
    ...over,
  };
}

function smsConfig(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization_id: ORG,
    provider: "mock",
    encrypted_credentials: { ciphertext: "mock" },
    sender_id: null,
    dlt_entity_id: null,
    is_active: true,
    ...over,
  };
}

function whatsappConfig(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization_id: ORG,
    provider: "mock",
    encrypted_credentials: { ciphertext: "mock" },
    from_phone_number_id: null,
    from_display_number: null,
    approved_template_ids: ["follow_up_default"],
    active: true,
    ...over,
  };
}

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
    attachments: [],
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

  function configHandler(cfgRow: Record<string, unknown> | undefined) {
    return {
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        chain.eq = (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        };
        chain.maybeSingle = () => {
          if (!cfgRow) return Promise.resolve({ data: null, error: null });
          if (filters.organization_id !== cfgRow.organization_id)
            return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: cfgRow, error: null });
        };
        return chain;
      },
    };
  }

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
    if (table === "org_email_config") return configHandler(opts.emailConfig);
    if (table === "org_sms_config") return configHandler(opts.smsConfig);
    if (table === "org_whatsapp_endpoints")
      return configHandler(opts.whatsappConfig);
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
  vi.mocked(getBrochureSignedUrl).mockReset();
});

describe("dispatchApprovedDraft — email", () => {
  it("happy path: status approved → sent, activity + edge + audit written", async () => {
    const m = makeClient({
      queue: row({ channel: "email" }),
      lead: lead({ email: "buyer@example.com" }),
      emailConfig: emailConfig(),
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

  it("no email config → not_configured + deferred audit, row stays approved", async () => {
    const m = makeClient({
      queue: row({ channel: "email" }),
      lead: lead({ email: "buyer@example.com" }),
      // no emailConfig — org has not set up email
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not_configured");
      expect(r.message).toBe("email");
    }
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action ===
            "agent_draft_send_deferred",
      ),
    ).toBeTruthy();
    // row stays approved — no transition to sent
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          (u.payload as Record<string, unknown>).status === "sent",
      ),
    ).toBeUndefined();
  });

  it("unsupported email provider → provider_error + send_error recorded", async () => {
    const m = makeClient({
      queue: row({ channel: "email" }),
      lead: lead({ email: "buyer@example.com" }),
      emailConfig: emailConfig({ provider: "postmark" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          typeof (u.payload as Record<string, unknown>).send_error ===
            "string",
      ),
    ).toBeTruthy();
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action ===
            "agent_draft_send_failed",
      ),
    ).toBeTruthy();
  });
});

describe("dispatchApprovedDraft — sms", () => {
  it("happy path: templated send via resolved adapter, send recorded", async () => {
    const m = makeClient({
      queue: row({ channel: "sms" }),
      lead: lead({ phone: "+919900011111" }),
      smsConfig: smsConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok && !("already_sent" in r)) {
      expect(r.provider).toBe("mock");
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

  it("no sms config → not_configured + deferred audit, row stays approved", async () => {
    const m = makeClient({
      queue: row({ channel: "sms" }),
      lead: lead({ phone: "+919900011111" }),
      // no smsConfig
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not_configured");
      expect(r.message).toBe("sms");
    }
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action ===
            "agent_draft_send_deferred",
      ),
    ).toBeTruthy();
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          (u.payload as Record<string, unknown>).status === "sent",
      ),
    ).toBeUndefined();
  });

  it("unsupported sms provider → provider_error + send_error recorded", async () => {
    const m = makeClient({
      queue: row({ channel: "sms" }),
      lead: lead({ phone: "+919900011111" }),
      smsConfig: smsConfig({ provider: "gupshup" }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          typeof (u.payload as Record<string, unknown>).send_error ===
            "string",
      ),
    ).toBeTruthy();
  });
});

describe("dispatchApprovedDraft — whatsapp", () => {
  it("happy path: resolves adapter + templated send, approved → sent", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok && !("already_sent" in r)) {
      expect(r.status).toBe("sent");
      expect(r.provider).toBe("mock");
      expect(r.provider_message_id).toMatch(/^mock-wa-/);
    }
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          (u.payload as Record<string, unknown>).status === "sent",
      ),
    ).toBeTruthy();
    expect(
      m.inserts.find(
        (i) =>
          i.table === "nodes" &&
          (i.payload as Record<string, unknown>).node_type === "activity",
      ),
    ).toBeTruthy();
    expect(m.inserts.find((i) => i.table === "edges")).toBeTruthy();
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action === "agent_draft_sent",
      ),
    ).toBeTruthy();
  });

  it("no whatsapp config → not_configured + deferred audit, row stays approved", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead({ phone: "+919900011111" }),
      // no whatsappConfig
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
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          (u.payload as Record<string, unknown>).status === "sent",
      ),
    ).toBeUndefined();
  });

  it("inactive whatsapp endpoint (active=false) → not_configured + deferred", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig({ active: false }),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_configured");
    expect(
      m.inserts.find(
        (i) =>
          i.table === "audit_log" &&
          (i.payload as Record<string, unknown>).action ===
            "agent_draft_send_deferred",
      ),
    ).toBeTruthy();
  });

  it("missing phone on lead → missing_recipient", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead({ phone: undefined, email: "x@y.com" }),
      whatsappConfig: whatsappConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_recipient");
  });

  it("follow-up template not approved → template_not_found routes to deferred", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp" }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig({ approved_template_ids: [] }),
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
    // template_not_found is a setup gap, not a send failure — no send_error
    expect(
      m.updates.find(
        (u) =>
          u.table === "agent_approval_queue" &&
          typeof (u.payload as Record<string, unknown>).send_error ===
            "string",
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

describe("dispatchApprovedDraft — brochure attachments (D-600)", () => {
  it("resolves a fresh signed URL per attachment and appends it (whatsapp)", async () => {
    vi.mocked(getBrochureSignedUrl).mockResolvedValue({
      ok: true,
      url: "https://signed/brochure-link",
      title: "3BHK floor plan",
    });
    const m = makeClient({
      queue: row({
        channel: "whatsapp",
        agent_kind: "brochure_send",
        attachments: [
          {
            brochure_id: "broc-1",
            title: "3BHK floor plan",
            document_type: "floor_plan",
          },
        ],
      }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    // Fresh URL resolved at dispatch time, org-scoped, against the same client.
    expect(vi.mocked(getBrochureSignedUrl)).toHaveBeenCalledWith(
      ORG,
      "broc-1",
      m.client,
    );
  });

  it("skips a deleted brochure (signed URL not_found) without failing the send", async () => {
    vi.mocked(getBrochureSignedUrl).mockResolvedValue({
      ok: false,
      reason: "not_found",
    });
    const m = makeClient({
      queue: row({
        channel: "whatsapp",
        agent_kind: "brochure_send",
        attachments: [
          { brochure_id: "gone", title: "x", document_type: "brochure" },
        ],
      }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    // The send still succeeds — a missing attachment is just no link.
    expect(r.ok).toBe(true);
  });

  it("leaves a non-attachment row's dispatch path untouched", async () => {
    const m = makeClient({
      queue: row({ channel: "whatsapp", attachments: [] }),
      lead: lead({ phone: "+919900011111" }),
      whatsappConfig: whatsappConfig(),
    });
    const r = await dispatchApprovedDraft(
      { queue_id: QUEUE_ID, organization_id: ORG, actor_id: ACTOR },
      m.client,
    );
    expect(r.ok).toBe(true);
    expect(vi.mocked(getBrochureSignedUrl)).not.toHaveBeenCalled();
  });
});
