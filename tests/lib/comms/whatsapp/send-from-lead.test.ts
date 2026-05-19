import { describe, expect, it } from "vitest";
import {
  sendWhatsAppFromLead,
  listApprovedWhatsAppTemplates,
} from "@/lib/comms/whatsapp/send-from-lead";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "aaaaaaaa-2222-4333-8444-555555555555";
const LEAD = "22222222-3333-4444-8555-666666666666";
const USER = "bbbbbbbb-3333-4444-8555-666666666666";
const APPROVED_TEMPLATE = "follow_up_default";

type LeadRow = {
  id: string;
  label: string;
  data: Record<string, unknown> | null;
  workspace_id: string;
  organization_id: string;
};

function leadRow(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: LEAD,
    label: "Aanya Sharma",
    data: { phone: "+919900011111" },
    workspace_id: WS,
    organization_id: ORG,
    ...over,
  };
}

function makeClient(opts: {
  lead?: LeadRow | null;
  waEndpoint?: Record<string, unknown> | null;
}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> =
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
                data: { id: "activity-wa-1" },
                error: null,
              }),
          }),
        };
      },
    });
    return b;
  }

  function endpointBuilder() {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return b;
      },
      maybeSingle: () => {
        const cfg = opts.waEndpoint;
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
      if (table === "org_whatsapp_endpoints") return endpointBuilder();
      if (table === "edges") return insertOnlyBuilder("edges");
      if (table === "audit_log") return insertOnlyBuilder("audit_log");
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, inserts };
}

const mockWAEndpoint = {
  organization_id: ORG,
  provider: "mock",
  encrypted_credentials: {},
  from_phone_number_id: null,
  from_display_number: "+910000000000",
  approved_template_ids: [APPROVED_TEMPLATE, "second_template"],
  active: true,
};

describe("sendWhatsAppFromLead", () => {
  it("sends an approved template + writes a whatsapp.sent activity node + audit", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow(),
      waEndpoint: mockWAEndpoint,
    });
    const r = await sendWhatsAppFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        template_id: APPROVED_TEMPLATE,
        variables: { var1: "Aanya", var2: "Casagrand ECR" },
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("mock");
      expect(r.template_id).toBe(APPROVED_TEMPLATE);
      expect(r.activity_id).toBe("activity-wa-1");
    }
    const activity = inserts.find(
      (i) => i.table === "nodes" && i.payload.node_type === "activity",
    );
    expect(activity).toBeDefined();
    const data = activity!.payload.data as Record<string, unknown>;
    expect(data.kind).toBe("whatsapp");
    expect(data.direction).toBe("outbound");
    expect(data.template_id).toBe(APPROVED_TEMPLATE);
    expect(data.to_phone).toBe("+919900011111");
    expect(inserts.some((i) => i.table === "edges")).toBe(true);
    expect(inserts.some((i) => i.table === "audit_log")).toBe(true);
  });

  it("returns missing_template when template_id is blank", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      waEndpoint: mockWAEndpoint,
    });
    const r = await sendWhatsAppFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        template_id: "  ",
        variables: {},
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_template");
  });

  it("returns no_lead_phone when the lead has no phone", async () => {
    const { client } = makeClient({
      lead: leadRow({ data: { email: "x@y.com" } }),
      waEndpoint: mockWAEndpoint,
    });
    const r = await sendWhatsAppFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        template_id: APPROVED_TEMPLATE,
        variables: {},
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_lead_phone");
  });

  it("returns provider_error when sending an unknown (non-approved) template", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      waEndpoint: mockWAEndpoint,
    });
    const r = await sendWhatsAppFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        template_id: "ghost_template",
        variables: {},
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("returns not_configured when the org has no whatsapp endpoint", async () => {
    const { client } = makeClient({ lead: leadRow(), waEndpoint: null });
    const r = await sendWhatsAppFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        template_id: APPROVED_TEMPLATE,
        variables: {},
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_configured");
  });
});

describe("listApprovedWhatsAppTemplates", () => {
  it("returns the dedup'd list when whatsapp is active", async () => {
    const { client } = makeClient({
      waEndpoint: {
        ...mockWAEndpoint,
        approved_template_ids: [APPROVED_TEMPLATE, APPROVED_TEMPLATE, "alt"],
      },
    });
    const ts = await listApprovedWhatsAppTemplates(ORG, client as never);
    expect(ts.sort()).toEqual([APPROVED_TEMPLATE, "alt"].sort());
  });

  it("returns [] when whatsapp is inactive", async () => {
    const { client } = makeClient({
      waEndpoint: { ...mockWAEndpoint, active: false },
    });
    const ts = await listApprovedWhatsAppTemplates(ORG, client as never);
    expect(ts).toEqual([]);
  });

  it("returns [] when no endpoint exists for the org", async () => {
    const { client } = makeClient({ waEndpoint: null });
    const ts = await listApprovedWhatsAppTemplates(ORG, client as never);
    expect(ts).toEqual([]);
  });
});
