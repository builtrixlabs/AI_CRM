import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  composeSiteVisitConfirmation,
  confirmSiteVisitBooking,
  isSiteVisitBookingAction,
  runSiteVisitBookingAgent,
  SITE_VISIT_BOOKING_AGENT_KIND,
} from "@/lib/agents/site-visit-agent";
import { createNode, updateNodeData } from "@/lib/nodes/api";
import { transitionSiteVisit } from "@/lib/sitevisits/api";
import { resolveSalesRepForProject } from "@/lib/projects/sales-mapping";

vi.mock("@/lib/nodes/api", () => ({
  createNode: vi.fn(),
  updateNodeData: vi.fn(),
}));
vi.mock("@/lib/sitevisits/api", () => ({
  transitionSiteVisit: vi.fn(),
}));
vi.mock("@/lib/projects/sales-mapping", () => ({
  resolveSalesRepForProject: vi.fn(),
}));

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER_ORG = "99999999-2222-4333-8444-555555555555";
const WS = "aaaaaaaa-2222-4333-8444-555555555555";
const LEAD = "22222222-3333-4444-8555-666666666666";
const PROJECT = "33333333-3333-4444-8555-666666666666";
const SITE_VISIT = "44444444-3333-4444-8555-666666666666";
const QUEUE = "55555555-3333-4444-8555-666666666666";
const USER = "66666666-3333-4444-8555-666666666666";

const VALID_CAB = {
  scheduled_at: "2026-05-20T11:30:00.000Z",
  pickup_address: "12 MG Road, Bengaluru",
  pickup_time: "2026-05-20T10:00:00.000Z",
  cab_provider: "Local fleet",
  driver_name: "Suresh K",
  driver_phone: "+919900022222",
  vehicle_number: "KA01AB1234",
};

type LeadNode = {
  id: string;
  label: string;
  data: Record<string, unknown> | null;
  workspace_id: string;
  organization_id: string;
};
type SiteVisitNode = {
  id: string;
  data: Record<string, unknown> | null;
  workspace_id: string;
  organization_id: string;
};
type QueueRow = {
  id: string;
  workspace_id: string | null;
  lead_id: string;
  agent_kind: string;
  status: string;
  ref_node_id: string | null;
};

function makeClient(opts: {
  lead?: LeadNode | null;
  existingPending?: { id: string } | null;
  queueInsertError?: { code?: string; message: string } | null;
  queueRow?: QueueRow | null;
  siteVisit?: SiteVisitNode | null;
  leadLabel?: string | null;
  project?: { label: string; data: Record<string, unknown> | null } | null;
} = {}) {
  const captured = {
    edges: [] as Record<string, unknown>[],
    queueInserts: [] as Record<string, unknown>[],
    queueUpdates: [] as Record<string, unknown>[],
    activityInserts: [] as Record<string, unknown>[],
  };

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
        if (filters.node_type === "lead") {
          const l = opts.lead;
          if (!l || filters.organization_id !== l.organization_id) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: l, error: null });
        }
        if (filters.node_type === "site_visit") {
          const sv = opts.siteVisit;
          if (!sv || filters.organization_id !== sv.organization_id) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: sv, error: null });
        }
        if (filters.node_type === "project") {
          return Promise.resolve({ data: opts.project ?? null, error: null });
        }
        // No node_type filter → the lead-label lookup in confirm.
        return Promise.resolve({
          data: opts.leadLabel != null ? { label: opts.leadLabel } : null,
          error: null,
        });
      },
      insert: (payload: Record<string, unknown>) => {
        captured.activityInserts.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: `activity-${captured.activityInserts.length}` },
                error: null,
              }),
          }),
        };
      },
    });
    return b;
  }

  function queueBuilder() {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return b;
      },
      maybeSingle: () => {
        // runAgent's existing-pending check filters on agent_kind.
        if (filters.agent_kind !== undefined) {
          return Promise.resolve({
            data: opts.existingPending ?? null,
            error: null,
          });
        }
        // confirm's queue-row lookup filters on id + organization_id.
        return Promise.resolve({ data: opts.queueRow ?? null, error: null });
      },
      insert: (payload: Record<string, unknown>) => {
        captured.queueInserts.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                opts.queueInsertError
                  ? { data: null, error: opts.queueInsertError }
                  : { data: { id: "queue-new" }, error: null },
              ),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        captured.queueUpdates.push(payload);
        const u: Record<string, unknown> = {};
        Object.assign(u, {
          eq: () => u,
          then: (onF: (v: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(onF),
        });
        return u;
      },
    });
    return b;
  }

  const client = {
    from: (table: string) => {
      if (table === "nodes") return nodesBuilder();
      if (table === "agent_approval_queue") return queueBuilder();
      if (table === "edges") {
        return {
          insert: (p: Record<string, unknown>) => {
            captured.edges.push(p);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, captured };
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
function siteVisitNode(over: Partial<SiteVisitNode> = {}): SiteVisitNode {
  return {
    id: SITE_VISIT,
    data: { lead_id: LEAD, scheduled_at: "2026-05-19T00:00:00.000Z" },
    workspace_id: WS,
    organization_id: ORG,
    ...over,
  };
}
function queueRow(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: QUEUE,
    workspace_id: WS,
    lead_id: LEAD,
    agent_kind: SITE_VISIT_BOOKING_AGENT_KIND,
    status: "pending",
    ref_node_id: SITE_VISIT,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNode).mockResolvedValue({ id: SITE_VISIT });
  vi.mocked(updateNodeData).mockResolvedValue(undefined);
  vi.mocked(transitionSiteVisit).mockResolvedValue(undefined);
  vi.mocked(resolveSalesRepForProject).mockResolvedValue(null);
});

describe("isSiteVisitBookingAction", () => {
  it("recognizes only book_site_visit", () => {
    expect(isSiteVisitBookingAction("book_site_visit")).toBe(true);
    expect(isSiteVisitBookingAction("send_brochure")).toBe(false);
    expect(isSiteVisitBookingAction("schedule_site_visit")).toBe(false);
  });
});

describe("composeSiteVisitConfirmation (AC-4)", () => {
  it("includes name, vehicle, driver, phone, pickup, and project", () => {
    const msg = composeSiteVisitConfirmation({
      lead_first_name: "Rohit",
      cab: VALID_CAB,
      project_name: "Prestige Lakeside",
    });
    expect(msg).toContain("Rohit");
    expect(msg).toContain("KA01AB1234");
    expect(msg).toContain("Suresh K");
    expect(msg).toContain("+919900022222");
    expect(msg).toContain("12 MG Road, Bengaluru");
    expect(msg).toContain("Prestige Lakeside");
  });

  it("omits the project clause gracefully when project_name is null", () => {
    const msg = composeSiteVisitConfirmation({
      lead_first_name: "Asha",
      cab: VALID_CAB,
      project_name: null,
    });
    expect(msg).toContain("Asha");
    expect(msg).toContain("Looking forward to seeing you.");
  });
});

describe("runSiteVisitBookingAgent (AC-1)", () => {
  it("skips a non-booking next-best-action", async () => {
    const { client, captured } = makeClient({});
    const r = await runSiteVisitBookingAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "send_brochure" },
      { client: client as never },
    );
    expect(r).toEqual({ ok: true, skipped: "not_booking_action" });
    expect(captured.queueInserts).toHaveLength(0);
  });

  it("returns lead_not_found for a missing / cross-org lead (AC-6)", async () => {
    const { client } = makeClient({
      lead: leadNode({ organization_id: OTHER_ORG }),
    });
    const r = await runSiteVisitBookingAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "book_site_visit" },
      { client: client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("lead_not_found");
  });

  it("creates a draft site_visit + an attended edge + a queue row", async () => {
    const { client, captured } = makeClient({
      lead: leadNode({ data: { custom: { project_id: PROJECT } } }),
    });
    const r = await runSiteVisitBookingAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "book_site_visit" },
      { client: client as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok && "queue_id" in r) expect(r.site_visit_id).toBe(SITE_VISIT);
    // draft node created in 'draft' state with the prefilled project_id.
    expect(vi.mocked(createNode)).toHaveBeenCalledWith(
      expect.objectContaining({
        node_type: "site_visit",
        state: "draft",
        data: expect.objectContaining({ lead_id: LEAD, project_id: PROJECT }),
      }),
      expect.anything(),
    );
    expect(captured.edges[0].edge_type).toBe("attended");
    expect(captured.queueInserts[0].agent_kind).toBe(
      SITE_VISIT_BOOKING_AGENT_KIND,
    );
    expect(captured.queueInserts[0].ref_node_id).toBe(SITE_VISIT);
  });

  it("skips when a pending booking already exists (no orphan draft)", async () => {
    const { client, captured } = makeClient({
      lead: leadNode(),
      existingPending: { id: "existing-queue" },
    });
    const r = await runSiteVisitBookingAgent(
      { organization_id: ORG, lead_id: LEAD, nba_action: "book_site_visit" },
      { client: client as never },
    );
    expect(r).toEqual({ ok: true, skipped: "already_pending" });
    expect(vi.mocked(createNode)).not.toHaveBeenCalled();
    expect(captured.queueInserts).toHaveLength(0);
  });
});

describe("confirmSiteVisitBooking (AC-3, AC-5, AC-6)", () => {
  const fakeDispatchSent = vi
    .fn()
    .mockResolvedValue({ ok: true, status: "sent" });
  const fakeDispatchDeferred = vi
    .fn()
    .mockResolvedValue({ ok: false, reason: "not_configured" });

  it("rejects invalid cab details before any DB write", async () => {
    const { client, captured } = makeClient({ queueRow: queueRow() });
    const r = await confirmSiteVisitBooking(
      {
        organization_id: ORG,
        actor_id: USER,
        queue_id: QUEUE,
        cab: { ...VALID_CAB, driver_phone: "" },
      },
      { client: client as never, dispatch: fakeDispatchSent as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("validation");
    expect(captured.queueUpdates).toHaveLength(0);
  });

  it("returns queue_not_found for a missing / cross-org queue row (AC-6)", async () => {
    const { client } = makeClient({ queueRow: null });
    const r = await confirmSiteVisitBooking(
      { organization_id: ORG, actor_id: USER, queue_id: QUEUE, cab: VALID_CAB },
      { client: client as never, dispatch: fakeDispatchSent as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("queue_not_found");
  });

  it("returns visit_not_found when the ref'd visit is cross-org (AC-6)", async () => {
    const { client } = makeClient({
      queueRow: queueRow(),
      siteVisit: siteVisitNode({ organization_id: OTHER_ORG }),
    });
    const r = await confirmSiteVisitBooking(
      { organization_id: ORG, actor_id: USER, queue_id: QUEUE, cab: VALID_CAB },
      { client: client as never, dispatch: fakeDispatchSent as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("visit_not_found");
  });

  it("books the visit + auto-assigns the project rep + dispatches (AC-3, AC-5)", async () => {
    vi.mocked(resolveSalesRepForProject).mockResolvedValueOnce({
      sales_rep_id: "rep-anjali",
      is_primary: true,
      fallback: false,
    });
    const { client, captured } = makeClient({
      queueRow: queueRow(),
      siteVisit: siteVisitNode({
        data: { lead_id: LEAD, scheduled_at: "x", project_id: PROJECT },
      }),
      leadLabel: "Rohit Menon",
      project: { label: "Prestige Lakeside", data: null },
    });
    const r = await confirmSiteVisitBooking(
      { organization_id: ORG, actor_id: USER, queue_id: QUEUE, cab: VALID_CAB },
      { client: client as never, dispatch: fakeDispatchSent as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assigned_sales_rep_id).toBe("rep-anjali");
      expect(r.dispatch).toBe("sent");
    }
    // cab fields + assignment written onto the visit.
    expect(vi.mocked(updateNodeData)).toHaveBeenCalledWith(
      expect.objectContaining({
        id: SITE_VISIT,
        partial: expect.objectContaining({
          vehicle_number: "KA01AB1234",
          assigned_sales_rep_id: "rep-anjali",
        }),
      }),
      expect.anything(),
    );
    // transitioned draft → scheduled.
    expect(vi.mocked(transitionSiteVisit)).toHaveBeenCalledWith(
      expect.objectContaining({ id: SITE_VISIT, target_state: "scheduled" }),
      expect.anything(),
    );
    // queue row approved with the composed confirmation body.
    expect(captured.queueUpdates[0].status).toBe("approved");
    expect(String(captured.queueUpdates[0].edited_body)).toContain(
      "Prestige Lakeside",
    );
    expect(fakeDispatchSent).toHaveBeenCalled();
  });

  it("leaves assigned_sales_rep_id null + flags the coordinator when no rep maps to the project (AC-5)", async () => {
    // resolveSalesRepForProject default mock returns null.
    const { client, captured } = makeClient({
      queueRow: queueRow(),
      siteVisit: siteVisitNode({
        data: { lead_id: LEAD, scheduled_at: "x", project_id: PROJECT },
      }),
      leadLabel: "Rohit Menon",
      project: { label: "Prestige Lakeside", data: null },
    });
    const r = await confirmSiteVisitBooking(
      { organization_id: ORG, actor_id: USER, queue_id: QUEUE, cab: VALID_CAB },
      { client: client as never, dispatch: fakeDispatchSent as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.assigned_sales_rep_id).toBeNull();
    // A "No project rep — coordinator to assign" activity node is written.
    const labels = captured.activityInserts.map((a) => a.label);
    expect(labels).toContain("Site visit booked");
    expect(
      labels.some((l) => String(l).includes("coordinator")),
    ).toBe(true);
  });

  it("still books the visit when WhatsApp is not configured (dispatch deferred)", async () => {
    const { client } = makeClient({
      queueRow: queueRow(),
      siteVisit: siteVisitNode(),
      leadLabel: "Rohit Menon",
    });
    const r = await confirmSiteVisitBooking(
      { organization_id: ORG, actor_id: USER, queue_id: QUEUE, cab: VALID_CAB },
      { client: client as never, dispatch: fakeDispatchDeferred as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dispatch).toBe("deferred");
    // The visit was still transitioned — the booking succeeded.
    expect(vi.mocked(transitionSiteVisit)).toHaveBeenCalled();
  });
});
