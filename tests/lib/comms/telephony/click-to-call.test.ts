import { describe, expect, it } from "vitest";
import {
  initiateClickToCall,
  mapExotelStatus,
  recordCallStatusUpdate,
} from "@/lib/comms/telephony/click-to-call";

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER_ORG = "99999999-2222-4333-8444-555555555555";
const WS = "aaaaaaaa-2222-4333-8444-555555555555";
const LEAD = "22222222-3333-4444-8555-666666666666";
const USER = "bbbbbbbb-3333-4444-8555-666666666666";

type LeadRow = {
  id: string;
  label: string;
  data: Record<string, unknown> | null;
  workspace_id: string;
  organization_id: string;
};

type ActivityRow = {
  id: string;
  data: Record<string, unknown> | null;
  workspace_id: string | null;
  organization_id: string;
};

function leadRow(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: LEAD,
    label: "Rohit Menon",
    data: { phone: "+919900011111" },
    workspace_id: WS,
    organization_id: ORG,
    ...over,
  };
}

function makeClient(opts: {
  lead?: LeadRow | null;
  telephonyConfig?: Record<string, unknown> | null;
  activityNode?: ActivityRow | null;
  insertActivityError?: { message: string } | null;
}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> =
    [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> =
    [];

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
        // recordCallStatusUpdate — keyed on the provider_call_id jsonb path.
        if (filters["data->>provider_call_id"] !== undefined) {
          const a = opts.activityNode;
          if (!a || filters.organization_id !== a.organization_id) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: a, error: null });
        }
        // initiateClickToCall — lead lookup keyed on id, org-scoped.
        const l = opts.lead;
        if (!l || filters.organization_id !== l.organization_id) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: l, error: null });
      },
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table: "nodes", payload });
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: opts.insertActivityError
                  ? null
                  : { id: "activity-new" },
                error: opts.insertActivityError ?? null,
              }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        updates.push({ table: "nodes", payload });
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

  function configBuilder() {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return b;
      },
      maybeSingle: () => {
        const cfg = opts.telephonyConfig;
        if (!cfg || filters.organization_id !== cfg.organization_id) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: cfg, error: null });
      },
    });
    return b;
  }

  function insertOnlyBuilder(table: string) {
    return {
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    };
  }

  const client = {
    from: (table: string) => {
      if (table === "nodes") return nodesBuilder();
      if (table === "org_telephony_config") return configBuilder();
      if (table === "edges") return insertOnlyBuilder("edges");
      if (table === "audit_log") return insertOnlyBuilder("audit_log");
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, inserts, updates };
}

const mockConfig = {
  organization_id: ORG,
  provider: "mock",
  encrypted_credentials: {},
  virtual_number: "+910000000000",
  is_active: true,
};

describe("mapExotelStatus", () => {
  it("maps Exotel status values to CRM call statuses", () => {
    expect(mapExotelStatus("completed")).toBe("completed");
    expect(mapExotelStatus("busy")).toBe("busy");
    expect(mapExotelStatus("no-answer")).toBe("no_answer");
    expect(mapExotelStatus("failed")).toBe("failed");
    expect(mapExotelStatus("in-progress")).toBe("ringing");
    expect(mapExotelStatus("queued")).toBe("initiated");
    expect(mapExotelStatus("WeIrD")).toBe("weird");
  });
});

describe("initiateClickToCall", () => {
  it("places the call + writes a call.initiated activity node (AC-1)", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow(),
      telephonyConfig: mockConfig,
    });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("mock");
      expect(typeof r.provider_call_id).toBe("string");
      expect(r.activity_id).toBe("activity-new");
    }
    const activity = inserts.find(
      (i) => i.table === "nodes" && i.payload.node_type === "activity",
    );
    expect(activity).toBeDefined();
    const data = activity!.payload.data as Record<string, unknown>;
    expect(data.kind).toBe("call");
    expect(data.direction).toBe("outbound");
    expect(data.status).toBe("initiated");
    expect(data.provider_call_id).toEqual(expect.any(String));
    // edge + audit_log rows written too.
    expect(inserts.some((i) => i.table === "edges")).toBe(true);
    expect(inserts.some((i) => i.table === "audit_log")).toBe(true);
  });

  it("returns lead_not_found for a missing lead", async () => {
    const { client } = makeClient({ lead: null, telephonyConfig: mockConfig });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("lead_not_found");
  });

  it("returns lead_not_found for a malformed lead id without touching the client", async () => {
    const { client } = makeClient({ lead: leadRow() });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: "not-a-uuid",
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("lead_not_found");
  });

  it("returns no_lead_phone when the lead has no phone", async () => {
    const { client } = makeClient({
      lead: leadRow({ data: { email: "x@y.com" } }),
      telephonyConfig: mockConfig,
    });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_lead_phone");
  });

  it("returns not_configured when the org has no telephony adapter", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      telephonyConfig: null,
    });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_configured");
  });

  it("returns provider_error for an unsupported telephony provider", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      telephonyConfig: { ...mockConfig, provider: "servetel" },
    });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("org-scopes the lead lookup — a cross-org lead is not_found (AC-3)", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow({ organization_id: OTHER_ORG }),
      telephonyConfig: mockConfig,
    });
    const r = await initiateClickToCall(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        from_phone_e164: "+919812345678",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("lead_not_found");
    expect(inserts).toHaveLength(0);
  });
});

describe("recordCallStatusUpdate (AC-2)", () => {
  it("patches the matching activity node's disposition", async () => {
    const { client, updates } = makeClient({
      activityNode: {
        id: "activity-1",
        data: {
          kind: "call",
          provider_call_id: "exo-123",
          status: "initiated",
        },
        workspace_id: WS,
        organization_id: ORG,
      },
    });
    const r = await recordCallStatusUpdate(
      {
        organization_id: ORG,
        provider_call_id: "exo-123",
        status: "completed",
        duration_s: 142,
      },
      client as never,
    );
    expect(r).toEqual({ ok: true, updated: true });
    const patch = updates[0].payload.data as Record<string, unknown>;
    expect(patch.status).toBe("completed");
    expect(patch.duration_s).toBe(142);
    // existing data preserved
    expect(patch.kind).toBe("call");
  });

  it("is a benign no-op for an unknown provider_call_id", async () => {
    const { client, updates } = makeClient({ activityNode: null });
    const r = await recordCallStatusUpdate(
      {
        organization_id: ORG,
        provider_call_id: "never-seen",
        status: "completed",
      },
      client as never,
    );
    expect(r).toEqual({ ok: true, updated: false });
    expect(updates).toHaveLength(0);
  });

  it("does not patch an activity node in another org (AC-3)", async () => {
    const { client, updates } = makeClient({
      activityNode: {
        id: "activity-1",
        data: { provider_call_id: "exo-123" },
        workspace_id: WS,
        organization_id: OTHER_ORG,
      },
    });
    const r = await recordCallStatusUpdate(
      {
        organization_id: ORG,
        provider_call_id: "exo-123",
        status: "completed",
      },
      client as never,
    );
    expect(r).toEqual({ ok: true, updated: false });
    expect(updates).toHaveLength(0);
  });
});
