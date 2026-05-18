import { describe, expect, it, vi } from "vitest";
import {
  dominantState,
  getSiteVisitCalendar,
  type CalendarDay,
  type SiteVisitState,
} from "@/lib/sitevisits/calendar";

const ORG = "11111111-2222-4333-8444-555555555555";

// D-602 — 7-state buckets (baseline/110 §III amendment).
const EMPTY_BUCKETS: Record<SiteVisitState, number> = {
  draft: 0,
  scheduled: 0,
  confirmed: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
};

function makeClient(
  rows: Array<{ state: string; data: { scheduled_at: string } }>,
) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table !== "nodes") throw new Error(`unexpected ${table}`);
      return chain;
    }),
  };
}

const FIXED_NOW = new Date("2026-05-09T08:30:00Z"); // 2026-05-09 14:00 IST

describe("getSiteVisitCalendar", () => {
  it("returns 7 zero-buckets when org has no site visits", async () => {
    const client = makeClient([]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never,
    );
    expect(days).toHaveLength(7);
    for (const d of days) {
      expect(d.total).toBe(0);
      expect(d.by_state).toEqual(EMPTY_BUCKETS);
    }
    expect(days[0].date).toBe("2026-05-09");
    expect(days[6].date).toBe("2026-05-15");
  });

  it("tallies mixed states including the V6 states (draft/in_progress/cancelled)", async () => {
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-09T07:00:00Z" } },
      { state: "in_progress", data: { scheduled_at: "2026-05-09T11:00:00Z" } },
      { state: "cancelled", data: { scheduled_at: "2026-05-10T05:00:00Z" } },
      { state: "draft", data: { scheduled_at: "2026-05-11T08:00:00Z" } },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never,
    );
    expect(days[0].by_state.scheduled).toBe(1);
    expect(days[0].by_state.in_progress).toBe(1);
    expect(days[0].total).toBe(2);
    expect(days[1].by_state.cancelled).toBe(1);
    expect(days[1].total).toBe(1);
    expect(days[2].by_state.draft).toBe(1);
  });

  it("excludes visits outside the 7-day window", async () => {
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-20T07:00:00Z" } },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never,
    );
    expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(0);
  });

  it("respects tz when bucketing late-evening visits", async () => {
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-09T19:30:00Z" } },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW, tz: "Asia/Kolkata" },
      client as never,
    );
    expect(days[0].total).toBe(0); // today in IST
    expect(days[1].total).toBe(1); // tomorrow in IST
  });

  it("treats unknown state strings as 'scheduled'", async () => {
    const client = makeClient([
      {
        state: "unknown_state",
        data: { scheduled_at: "2026-05-09T07:00:00Z" },
      },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never,
    );
    expect(days[0].by_state.scheduled).toBe(1);
  });
});

describe("dominantState — D-602 7-state priority", () => {
  const day = (
    overrides: Partial<CalendarDay["by_state"]> = {},
  ): CalendarDay => {
    const by_state = { ...EMPTY_BUCKETS, ...overrides };
    return {
      date: "2026-05-09",
      date_utc: "2026-05-09T00:00:00.000Z",
      total: Object.values(by_state).reduce((s, n) => s + n, 0),
      by_state,
    };
  };

  it("returns null for empty days", () => {
    expect(dominantState(day())).toBeNull();
  });

  it("any no_show wins (red)", () => {
    expect(dominantState(day({ scheduled: 5, no_show: 1 }))).toBe("no_show");
  });

  it("cancelled wins when no no_show present", () => {
    expect(dominantState(day({ scheduled: 5, cancelled: 1 }))).toBe(
      "cancelled",
    );
  });

  it("no_show outranks cancelled", () => {
    expect(dominantState(day({ no_show: 1, cancelled: 3 }))).toBe("no_show");
  });

  it("max of live states wins otherwise", () => {
    expect(
      dominantState(day({ scheduled: 1, confirmed: 5, in_progress: 2 })),
    ).toBe("confirmed");
  });
});
