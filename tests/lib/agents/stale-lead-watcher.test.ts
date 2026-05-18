import { describe, expect, it, vi } from "vitest";
import {
  scoreLead,
  findStaleLeadCandidates,
  STALE_FROM_DAYS,
  STALE_UNTIL_DAYS,
} from "@/lib/agents/stale-lead-watcher";

const NOW = new Date("2026-05-10T12:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

const baseRow = {
  id: "lead-1",
  organization_id: "org-1",
  state: "contacted",
  created_at: daysAgo(10),
  data: { phone: "+919812345678" },
};

describe("scoreLead", () => {
  it("scores a warm-quiet lead in the window", () => {
    const r = scoreLead(baseRow, NOW);
    expect(r).toMatchObject({
      lead_id: "lead-1",
      reason: "warm_quiet",
      staleness_days: 10,
      signal_count: 1,
    });
  });

  it("counts phone + email as signal_count=2", () => {
    const r = scoreLead({ ...baseRow, data: { phone: "+91", email: "x@y.com" } }, NOW);
    expect(r?.signal_count).toBe(2);
  });

  it.each(["lost", "junk", "on_hold", "site_visit_scheduled", null])(
    "drops lead with state=%s (not in accepted set)",
    (state) => {
      expect(scoreLead({ ...baseRow, state: state as never }, NOW)).toBeNull();
    },
  );

  it("drops lead with no phone or email (zero signals)", () => {
    expect(scoreLead({ ...baseRow, data: { phone: "" } }, NOW)).toBeNull();
    expect(scoreLead({ ...baseRow, data: null }, NOW)).toBeNull();
  });

  it("drops too-fresh leads (created today)", () => {
    expect(scoreLead({ ...baseRow, created_at: daysAgo(1) }, NOW)).toBeNull();
    expect(scoreLead({ ...baseRow, created_at: daysAgo(STALE_FROM_DAYS - 1) }, NOW)).toBeNull();
  });

  it("drops too-cold leads (older than STALE_UNTIL_DAYS)", () => {
    expect(scoreLead({ ...baseRow, created_at: daysAgo(STALE_UNTIL_DAYS + 1) }, NOW)).toBeNull();
  });

  it("uses last_contact_at as the recent-edge when newer than created_at", () => {
    const r = scoreLead({
      ...baseRow,
      created_at: daysAgo(60),
      data: { phone: "+91", last_contact_at: daysAgo(15) },
    }, NOW);
    expect(r?.staleness_days).toBe(15);
  });
});

describe("findStaleLeadCandidates", () => {
  function makeClient(opts: {
    leads: Array<typeof baseRow & { id: string }>;
    queued?: string[];
  }) {
    return {
      from: vi.fn((table: string) => {
        if (table === "nodes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    is: vi.fn(() => ({
                      limit: vi.fn(() => Promise.resolve({ data: opts.leads, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === "agent_approval_queue") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(() =>
                    Promise.resolve({
                      data: (opts.queued ?? []).map((id) => ({ source_lead_id: id })),
                      error: null,
                    }),
                  ),
                })),
              })),
            })),
          };
        }
        return { select: vi.fn() };
      }),
    };
  }

  it("returns scored candidates excluding already-queued leads", async () => {
    const c = makeClient({
      leads: [
        { ...baseRow, id: "L1", created_at: daysAgo(10) },
        { ...baseRow, id: "L2", created_at: daysAgo(15) },
        { ...baseRow, id: "L3", created_at: daysAgo(2) }, // too fresh
        { ...baseRow, id: "L4", created_at: daysAgo(60) }, // too cold
      ],
      queued: ["L2"],
    });
    const r = await findStaleLeadCandidates("org-1", c as never, NOW);
    expect(r.map((x) => x.lead_id).sort()).toEqual(["L1"]);
  });

  it("returns empty when DB query fails", async () => {
    const c = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                is: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
                })),
              })),
            })),
          })),
        })),
      })),
    };
    expect(await findStaleLeadCandidates("org-1", c as never, NOW)).toEqual([]);
  });
});
