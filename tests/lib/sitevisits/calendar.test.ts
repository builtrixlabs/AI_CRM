import { describe, expect, it, vi } from "vitest";
import {
  dominantState,
  getSiteVisitCalendar,
  type CalendarDay,
} from "@/lib/sitevisits/calendar";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(rows: Array<{ state: string; data: { scheduled_at: string } }>) {
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
      client as never
    );
    expect(days).toHaveLength(7);
    for (const d of days) {
      expect(d.total).toBe(0);
      expect(d.by_state).toEqual({
        scheduled: 0,
        confirmed: 0,
        completed: 0,
        no_show: 0,
      });
    }
    // Day keys are sequential dates starting at "today" in tz.
    expect(days[0].date).toBe("2026-05-09");
    expect(days[6].date).toBe("2026-05-15");
  });

  it("tallies mixed states correctly", async () => {
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-09T07:00:00Z" } }, // 12:30 IST → today
      { state: "confirmed", data: { scheduled_at: "2026-05-09T11:00:00Z" } }, // 16:30 IST → today
      { state: "no_show", data: { scheduled_at: "2026-05-10T05:00:00Z" } }, // 10:30 IST tomorrow
      { state: "completed", data: { scheduled_at: "2026-05-11T08:00:00Z" } }, // day 3
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never
    );
    expect(days[0].by_state.scheduled).toBe(1);
    expect(days[0].by_state.confirmed).toBe(1);
    expect(days[0].total).toBe(2);
    expect(days[1].by_state.no_show).toBe(1);
    expect(days[1].total).toBe(1);
    expect(days[2].by_state.completed).toBe(1);
    expect(days[3].total).toBe(0);
  });

  it("excludes visits outside the 7-day window", async () => {
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-20T07:00:00Z" } }, // 11 days out
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never
    );
    expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(0);
  });

  it("respects tz when bucketing late-evening visits", async () => {
    // 2026-05-09T19:30Z = 2026-05-10T01:00 IST → tomorrow
    const client = makeClient([
      { state: "scheduled", data: { scheduled_at: "2026-05-09T19:30:00Z" } },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW, tz: "Asia/Kolkata" },
      client as never
    );
    expect(days[0].total).toBe(0); // today in IST
    expect(days[1].total).toBe(1); // tomorrow in IST
  });

  it("treats unknown state strings as 'scheduled'", async () => {
    const client = makeClient([
      { state: "unknown_state", data: { scheduled_at: "2026-05-09T07:00:00Z" } },
    ]);
    const days = await getSiteVisitCalendar(
      ORG,
      { now: () => FIXED_NOW },
      client as never
    );
    expect(days[0].by_state.scheduled).toBe(1);
  });
});

describe("dominantState", () => {
  const day = (overrides: Partial<CalendarDay["by_state"]> = {}): CalendarDay => ({
    date: "2026-05-09",
    date_utc: "2026-05-09T00:00:00.000Z",
    total: 0,
    by_state: { scheduled: 0, confirmed: 0, completed: 0, no_show: 0, ...overrides },
  });

  it("returns null for empty days", () => {
    expect(dominantState(day())).toBeNull();
  });

  it("any no_show wins (red)", () => {
    const d = day({ scheduled: 5, no_show: 1 });
    d.total = 6;
    expect(dominantState(d)).toBe("no_show");
  });

  it("max of scheduled/confirmed/completed wins otherwise", () => {
    const d = day({ scheduled: 1, confirmed: 5, completed: 2 });
    d.total = 8;
    expect(dominantState(d)).toBe("confirmed");
  });
});
