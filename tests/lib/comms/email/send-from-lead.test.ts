import { describe, expect, it } from "vitest";
import { sendEmailFromLead } from "@/lib/comms/email/send-from-lead";

const ORG = "11111111-2222-4333-8444-555555555555";
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

function leadRow(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: LEAD,
    label: "Aanya Sharma",
    data: { email: "aanya@example.com" },
    workspace_id: WS,
    organization_id: ORG,
    ...over,
  };
}

function makeClient(opts: {
  lead?: LeadRow | null;
  emailConfig?: Record<string, unknown> | null;
  insertActivityError?: { message: string } | null;
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
                data: opts.insertActivityError
                  ? null
                  : { id: "activity-email-1" },
                error: opts.insertActivityError ?? null,
              }),
          }),
        };
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
        const cfg = opts.emailConfig;
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
      if (table === "org_email_config") return configBuilder();
      if (table === "edges") return insertOnlyBuilder("edges");
      if (table === "audit_log") return insertOnlyBuilder("audit_log");
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, inserts };
}

const mockEmailConfig = {
  organization_id: ORG,
  provider: "mock",
  encrypted_credentials: {},
  from_email: "noreply@builtrix.test",
  from_name: "Builtrix",
  is_active: true,
};

describe("sendEmailFromLead", () => {
  it("sends + writes an email.sent activity node + edge + audit row", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow(),
      emailConfig: mockEmailConfig,
    });
    const r = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Following up on Casagrand",
        body_text: "Hi Aanya, just checking in.",
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("mock");
      expect(r.activity_id).toBe("activity-email-1");
      expect(typeof r.provider_message_id).toBe("string");
    }
    const activity = inserts.find(
      (i) => i.table === "nodes" && i.payload.node_type === "activity",
    );
    expect(activity).toBeDefined();
    const data = activity!.payload.data as Record<string, unknown>;
    expect(data.kind).toBe("email");
    expect(data.direction).toBe("outbound");
    expect(data.to).toBe("aanya@example.com");
    expect(data.subject).toBe("Following up on Casagrand");
    expect(inserts.some((i) => i.table === "edges")).toBe(true);
    expect(inserts.some((i) => i.table === "audit_log")).toBe(true);
  });

  it("returns lead_not_found for a malformed lead id without hitting the client", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow(),
      emailConfig: mockEmailConfig,
    });
    const r = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: "not-a-uuid",
        from_user_id: USER,
        subject: "x",
        body_text: "y",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("lead_not_found");
    expect(inserts.length).toBe(0);
  });

  it("returns no_lead_email when the lead has no email", async () => {
    const { client } = makeClient({
      lead: leadRow({ data: { phone: "+919999900000" } }),
      emailConfig: mockEmailConfig,
    });
    const r = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "Body",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_lead_email");
  });

  it("honours an explicit to_override", async () => {
    const { client, inserts } = makeClient({
      lead: leadRow({ data: {} }),
      emailConfig: mockEmailConfig,
    });
    const r = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "Body",
        to_override: "override@example.com",
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    const activity = inserts.find(
      (i) => i.table === "nodes" && i.payload.node_type === "activity",
    );
    expect(activity).toBeDefined();
    const data = activity!.payload.data as Record<string, unknown>;
    expect(data.to).toBe("override@example.com");
  });

  it("returns missing_subject / missing_body for empty inputs", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      emailConfig: mockEmailConfig,
    });
    const r1 = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "  ",
        body_text: "Body",
      },
      client as never,
    );
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("missing_subject");

    const r2 = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "",
      },
      client as never,
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("missing_body");
  });

  it("returns not_configured when the org has no email config", async () => {
    const { client } = makeClient({ lead: leadRow(), emailConfig: null });
    const r = await sendEmailFromLead(
      {
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "Body",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_configured");
  });

  it("is tenant-scoped — wrong org_id returns lead_not_found", async () => {
    const { client } = makeClient({
      lead: leadRow(),
      emailConfig: mockEmailConfig,
    });
    const r = await sendEmailFromLead(
      {
        organization_id: "99999999-2222-4333-8444-555555555555",
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "Body",
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("lead_not_found");
  });
});
