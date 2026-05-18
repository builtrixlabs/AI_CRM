import { describe, expect, it, vi } from "vitest";
import { getSiteVisitDetail } from "@/lib/sitevisits/detail";

const ORG = "11111111-2222-4333-8444-555555555555";
const VISIT = "44444444-5555-4666-8777-888888888888";
const LEAD = "33333333-4444-4555-8666-777777777777";

type VisitRow = {
  id: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  created_by: string;
  updated_at: string;
};
type AuditRow = {
  ts: string;
  action: string;
  actor_id: string;
  actor_role: string;
  diff: Record<string, unknown> | null;
};

function makeClient(opts: {
  visit?: VisitRow | null;
  leadLabel?: string | null;
  audit?: AuditRow[];
}) {
  function nodesChain(cols: string) {
    if (cols === "label") {
      const chain = {
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data: opts.leadLabel != null ? { label: opts.leadLabel } : null,
            error: null,
          }),
        ),
      };
      return chain;
    }
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: opts.visit ?? null, error: null }),
      ),
    };
    return chain;
  }
  function auditChain() {
    const chain = {
      eq: vi.fn(() => chain),
      order: vi.fn(() =>
        Promise.resolve({ data: opts.audit ?? [], error: null }),
      ),
    };
    return chain;
  }
  return {
    from: vi.fn((table: string) => {
      if (table === "nodes") {
        return { select: vi.fn((cols: string) => nodesChain(cols)) };
      }
      if (table === "audit_log") {
        return { select: vi.fn(() => auditChain()) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

const baseVisit: VisitRow = {
  id: VISIT,
  state: "scheduled",
  data: { lead_id: LEAD, scheduled_at: "2026-05-20T06:00:00Z" },
  created_at: "2026-05-14T00:00:00Z",
  created_by: "user-1",
  updated_at: "2026-05-14T00:00:00Z",
};

describe("getSiteVisitDetail", () => {
  it("returns the visit + lead label + ordered history", async () => {
    const client = makeClient({
      visit: baseVisit,
      leadLabel: "Asha Rao",
      audit: [
        {
          ts: "2026-05-14T02:00:00Z",
          action: "state_change",
          actor_id: "user-1",
          actor_role: "site_visit_writer",
          diff: { from: "scheduled", to: "confirmed" },
        },
        {
          ts: "2026-05-14T00:00:00Z",
          action: "node_create",
          actor_id: "user-1",
          actor_role: "node_writer",
          diff: null,
        },
      ],
    });
    const detail = await getSiteVisitDetail(VISIT, ORG, client as never);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(VISIT);
    expect(detail?.state).toBe("scheduled");
    expect(detail?.lead_id).toBe(LEAD);
    expect(detail?.lead_label).toBe("Asha Rao");
    expect(detail?.history).toHaveLength(2);
    expect(detail?.history[0].action).toBe("state_change");
  });

  it("returns null when the visit is missing or cross-org (org filter)", async () => {
    const client = makeClient({ visit: null });
    const detail = await getSiteVisitDetail(VISIT, ORG, client as never);
    expect(detail).toBeNull();
  });

  it("handles a visit with no lead_id — lead_label is null", async () => {
    const client = makeClient({
      visit: {
        ...baseVisit,
        data: { scheduled_at: "2026-05-20T06:00:00Z" },
      },
      audit: [],
    });
    const detail = await getSiteVisitDetail(VISIT, ORG, client as never);
    expect(detail?.lead_id).toBeNull();
    expect(detail?.lead_label).toBeNull();
  });

  it("returns an empty history when there are no audit rows", async () => {
    const client = makeClient({ visit: baseVisit, leadLabel: "Asha Rao", audit: [] });
    const detail = await getSiteVisitDetail(VISIT, ORG, client as never);
    expect(detail?.history).toEqual([]);
  });
});
