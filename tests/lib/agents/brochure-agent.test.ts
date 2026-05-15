import { beforeEach, describe, expect, it, vi } from "vitest";

// D-614 — runBrochureAgent calls dispatchApprovedDraft on the auto_send
// path. Mock it: the dispatch internals (adapter resolution, sends) are
// covered by the dispatch suite; here we only assert it's invoked.
const mocks = vi.hoisted(() => ({
  dispatchApprovedDraft: vi.fn(),
}));
vi.mock("@/lib/agents/follow-up/dispatch", () => ({
  dispatchApprovedDraft: mocks.dispatchApprovedDraft,
}));

import {
  BROCHURE_AGENT_KIND,
  draftBrochureMessage,
  extractMatchCriteria,
  isBrochureAction,
  runBrochureAgent,
} from "@/lib/agents/brochure-agent";

beforeEach(() => {
  mocks.dispatchApprovedDraft.mockReset();
});

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER_ORG = "99999999-2222-4333-8444-555555555555";
const WS = "aaaaaaaa-2222-4333-8444-555555555555";
const LEAD = "22222222-3333-4444-8555-666666666666";
const PROJECT = "33333333-3333-4444-8555-666666666666";

type LeadNode = {
  id: string;
  label: string;
  data: Record<string, unknown> | null;
  workspace_id: string | null;
  organization_id: string;
};

type BrochureRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  metadata: unknown;
  uploaded_at: string;
  uploaded_by: string;
  deleted_at: string | null;
};

function brochureRow(over: Partial<BrochureRow> = {}): BrochureRow {
  return {
    id: "broc-1",
    organization_id: ORG,
    project_id: PROJECT,
    document_type: "floor_plan",
    title: "3BHK floor plan",
    file_path: `${ORG}/seed/floor.pdf`,
    file_size_bytes: 1024,
    mime_type: "application/pdf",
    metadata: { tags: [] },
    uploaded_at: "2026-05-14T10:00:00.000Z",
    uploaded_by: "user-1",
    deleted_at: null,
    ...over,
  };
}

function makeClient(opts: {
  lead?: LeadNode | null;
  brochures?: BrochureRow[];
  insertResult?: {
    data: { id: string } | null;
    error: { code?: string; message: string } | null;
  };
  /** D-614 — the stored send policy; absent => no row => require_approval. */
  policyMode?: "auto_send" | "require_approval";
}) {
  const queueInserts: Array<Record<string, unknown>> = [];
  const queueUpdates: Array<Record<string, unknown>> = [];

  // nodes — honors the organization_id eq filter so the cross-org test is real.
  function nodesBuilder() {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return b;
      },
      is: () => b,
      maybeSingle: () => {
        const l = opts.lead;
        if (!l) return Promise.resolve({ data: null, error: null });
        if (filters.organization_id !== l.organization_id) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: l, error: null });
      },
    });
    return b;
  }

  function brochuresBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      is: () => b,
      then: (onF: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: opts.brochures ?? [], error: null }).then(onF),
    });
    return b;
  }

  // agent_message_policies — D-614 resolveSendPolicy lookup.
  function policiesBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      maybeSingle: () =>
        Promise.resolve({
          data: opts.policyMode ? { mode: opts.policyMode } : null,
          error: null,
        }),
    });
    return b;
  }

  function queueBuilder() {
    return {
      insert: (rowArg: Record<string, unknown>) => {
        queueInserts.push(rowArg);
        const ib: Record<string, unknown> = {};
        Object.assign(ib, {
          select: () => ib,
          single: () =>
            Promise.resolve(
              opts.insertResult ?? { data: { id: "queue-new" }, error: null },
            ),
        });
        return ib;
      },
      // D-614 auto_send promotes the pending row to approved.
      update: (patch: Record<string, unknown>) => {
        queueUpdates.push(patch);
        const ub: Record<string, unknown> = {};
        Object.assign(ub, {
          eq: () => ub,
          then: (onF: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(onF),
        });
        return ub;
      },
    };
  }

  const client = {
    from: (table: string) => {
      if (table === "nodes") return nodesBuilder();
      if (table === "brochures") return brochuresBuilder();
      if (table === "agent_message_policies") return policiesBuilder();
      if (table === "agent_approval_queue") return queueBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, queueInserts, queueUpdates };
}

function leadNode(over: Partial<LeadNode> = {}): LeadNode {
  return {
    id: LEAD,
    label: "Rohit Menon",
    data: {},
    workspace_id: WS,
    organization_id: ORG,
    ...over,
  };
}

function okGateway(text: string) {
  return {
    complete: vi.fn().mockResolvedValue({
      ok: true,
      text,
      model_used: "claude",
      tokens_in: 10,
      tokens_out: 20,
      duration_ms: 50,
    }),
  };
}

describe("isBrochureAction", () => {
  it("recognizes the three brochure next-best-actions", () => {
    expect(isBrochureAction("send_brochure")).toBe(true);
    expect(isBrochureAction("send_floor_plan")).toBe(true);
    expect(isBrochureAction("send_price_sheet")).toBe(true);
    expect(isBrochureAction("schedule_site_visit")).toBe(false);
    expect(isBrochureAction("book_site_visit")).toBe(false);
  });
});

describe("extractMatchCriteria (AC-4)", () => {
  it("maps the action to a document_type", () => {
    expect(
      extractMatchCriteria(ORG, {}, "send_floor_plan").document_type,
    ).toBe("floor_plan");
    expect(extractMatchCriteria(ORG, {}, "send_brochure").document_type).toBe(
      "brochure",
    );
    expect(
      extractMatchCriteria(ORG, {}, "send_price_sheet").document_type,
    ).toBe("price_sheet");
  });

  it("pulls bhk + budget_band + area from nested lead data", () => {
    const c = extractMatchCriteria(
      ORG,
      {
        custom: {
          preference: { bhk: "3", budget_band: "1.5-2Cr" },
          bant: { budget: "ignored — preference wins" },
        },
        area_sqft: 1450,
      },
      "send_brochure",
    );
    expect(c.bhk).toBe(3);
    expect(c.budget_band).toBe("1.5-2Cr");
    expect(c.area_sqft).toBe(1450);
  });

  it("only accepts a UUID-shaped project_id (a project name is ignored)", () => {
    expect(
      extractMatchCriteria(
        ORG,
        { custom: { project_id: "Prestige Lakeside" } },
        "send_brochure",
      ).project_id,
    ).toBeUndefined();
    expect(
      extractMatchCriteria(ORG, { project_id: PROJECT }, "send_brochure")
        .project_id,
    ).toBe(PROJECT);
  });

  it("falls back to BANT budget when no explicit budget_band is set", () => {
    const c = extractMatchCriteria(
      ORG,
      { custom: { bant: { budget: "2-3Cr" } } },
      "send_brochure",
    );
    expect(c.budget_band).toBe("2-3Cr");
  });
});

describe("draftBrochureMessage (AC-3)", () => {
  it("uses the gateway text when the call succeeds", async () => {
    const gw = okGateway("Hi Rohit, here is the floor plan!");
    const body = await draftBrochureMessage(
      {
        organization_id: ORG,
        lead_first_name: "Rohit",
        brochure_title: "3BHK floor plan",
        document_type: "floor_plan",
      },
      gw,
    );
    expect(body).toBe("Hi Rohit, here is the floor plan!");
    expect(gw.complete).toHaveBeenCalledOnce();
  });

  it("falls back to a template containing the name + title when the gateway fails", async () => {
    const gw = {
      complete: vi
        .fn()
        .mockResolvedValue({ ok: false, error: "rate_limit", message: "429" }),
    };
    const body = await draftBrochureMessage(
      {
        organization_id: ORG,
        lead_first_name: "Rohit",
        brochure_title: "3BHK floor plan",
        document_type: "floor_plan",
      },
      gw,
    );
    expect(body).toContain("Rohit");
    expect(body).toContain("3BHK floor plan");
  });

  it("falls back when the gateway throws (e.g. budget exceeded)", async () => {
    const gw = {
      complete: vi.fn().mockRejectedValue(new Error("TokenBudgetExceeded")),
    };
    const body = await draftBrochureMessage(
      {
        organization_id: ORG,
        lead_first_name: "Asha",
        brochure_title: "Price sheet",
        document_type: "price_sheet",
      },
      gw,
    );
    expect(body).toContain("Asha");
    expect(body).toContain("Price sheet");
  });
});

describe("runBrochureAgent", () => {
  it("skips non-brochure next-best-actions", async () => {
    const { client, queueInserts } = makeClient({});
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "schedule_site_visit" },
      { client: client as never },
    );
    expect(r).toEqual({ ok: true, skipped: "not_brochure_action" });
    expect(queueInserts).toHaveLength(0);
  });

  it("returns lead_not_found when the lead is missing", async () => {
    const { client } = makeClient({ lead: null });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("x") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("lead_not_found");
  });

  it("enqueues a brochure_send draft with the matched brochure attached (AC-1, AC-3)", async () => {
    const { client, queueInserts } = makeClient({
      lead: leadNode({ data: { custom: { preference: { bhk: 3 } } } }),
      brochures: [brochureRow({ id: "broc-match", title: "3BHK floor plan" })],
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_floor_plan" },
      { client: client as never, gateway: okGateway("Hi Rohit, sharing the plan.") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) {
      expect(r.matched).toBe(true);
      expect(r.brochure_id).toBe("broc-match");
    }
    expect(queueInserts).toHaveLength(1);
    const ins = queueInserts[0];
    expect(ins.agent_kind).toBe(BROCHURE_AGENT_KIND);
    expect(ins.channel).toBe("whatsapp");
    expect(ins.status).toBe("pending");
    expect(ins.error).toBeNull();
    expect(ins.draft_body).toBe("Hi Rohit, sharing the plan.");
    expect(ins.attachments).toEqual([
      {
        brochure_id: "broc-match",
        title: "3BHK floor plan",
        document_type: "floor_plan",
      },
    ]);
  });

  it("enqueues a row with error='no_match' when no brochure matches (AC-2)", async () => {
    const { client, queueInserts } = makeClient({
      lead: leadNode(),
      brochures: [],
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("unused") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) {
      expect(r.matched).toBe(false);
      expect(r.brochure_id).toBeNull();
    }
    expect(queueInserts).toHaveLength(1);
    expect(queueInserts[0].error).toBe("no_match");
    expect(queueInserts[0].attachments).toEqual([]);
    expect(String(queueInserts[0].draft_body)).toContain("/admin/brochures");
  });

  it("treats a duplicate pending draft (23505) as a benign no-op (AC-1)", async () => {
    const { client } = makeClient({
      lead: leadNode(),
      brochures: [brochureRow()],
      insertResult: {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      },
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("x") },
    );
    expect(r).toEqual({ ok: true, skipped: "already_pending" });
  });

  it("org-scopes the lead lookup — a cross-org lead is not_found (AC-5)", async () => {
    const { client, queueInserts } = makeClient({
      lead: leadNode({ organization_id: OTHER_ORG }),
      brochures: [brochureRow()],
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("x") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("lead_not_found");
    expect(queueInserts).toHaveLength(0);
  });

  it("still enqueues when the gateway is down — templated fallback body (AC-3)", async () => {
    const { client, queueInserts } = makeClient({
      lead: leadNode({ label: "Asha Rao" }),
      brochures: [brochureRow({ title: "Tower B price sheet" })],
    });
    const downGateway = {
      complete: vi.fn().mockRejectedValue(new Error("provider down")),
    };
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_price_sheet" },
      { client: client as never, gateway: downGateway },
    );
    expect(r.ok).toBe(true);
    expect(queueInserts).toHaveLength(1);
    expect(String(queueInserts[0].draft_body)).toContain("Asha");
    expect(String(queueInserts[0].draft_body)).toContain("Tower B price sheet");
  });
});

describe("runBrochureAgent — D-614 send policy", () => {
  it("auto-sends a matched brochure when the policy is auto_send (AC-2)", async () => {
    const { client, queueInserts, queueUpdates } = makeClient({
      lead: leadNode(),
      brochures: [brochureRow({ id: "broc-auto" })],
      policyMode: "auto_send",
    });
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: true,
      status: "sent",
      provider: "mock",
      provider_message_id: "m1",
      activity_id: "a1",
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("Hi, sharing the brochure.") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) {
      expect(r.matched).toBe(true);
      expect(r.dispatched).toBe(true);
    }
    // Still inserted pending first — the idempotency index guards duplicates.
    expect(queueInserts).toHaveLength(1);
    expect(queueInserts[0].status).toBe("pending");
    // Then promoted to approved before dispatch.
    expect(queueUpdates).toHaveLength(1);
    expect(queueUpdates[0].status).toBe("approved");
    expect(mocks.dispatchApprovedDraft).toHaveBeenCalledOnce();
  });

  it("does NOT auto-send a no_match row even under auto_send (AC-3)", async () => {
    const { client, queueInserts, queueUpdates } = makeClient({
      lead: leadNode(),
      brochures: [],
      policyMode: "auto_send",
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("unused") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) {
      expect(r.matched).toBe(false);
      expect(r.dispatched).toBe(false);
    }
    expect(queueInserts[0].error).toBe("no_match");
    expect(queueUpdates).toHaveLength(0);
    expect(mocks.dispatchApprovedDraft).not.toHaveBeenCalled();
  });

  it("queues for approval (no dispatch) when the policy is require_approval", async () => {
    const { client, queueUpdates } = makeClient({
      lead: leadNode(),
      brochures: [brochureRow()],
      policyMode: "require_approval",
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("x") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) expect(r.dispatched).toBe(false);
    expect(queueUpdates).toHaveLength(0);
    expect(mocks.dispatchApprovedDraft).not.toHaveBeenCalled();
  });

  it("defaults to require_approval when no policy row exists (AC-1)", async () => {
    const { client, queueUpdates } = makeClient({
      lead: leadNode(),
      brochures: [brochureRow()],
      // no policyMode — no row
    });
    const r = await runBrochureAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never, gateway: okGateway("x") },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) expect(r.dispatched).toBe(false);
    expect(queueUpdates).toHaveLength(0);
    expect(mocks.dispatchApprovedDraft).not.toHaveBeenCalled();
  });
});
