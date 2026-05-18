import { describe, expect, it, vi } from "vitest";
import {
  bucketsToCsv,
  getKpisOverWindow,
  type AnalyticsBucket,
} from "@/lib/platform/analytics";

function makeClient(opts: {
  deals?: Array<{ data: { state?: string }; updated_at: string }>;
  site_visits?: Array<{ data: { state?: string; scheduled_at?: string } }>;
  leads?: Array<{ created_at: string }>;
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, val: string) => ({
          gte: vi.fn(() => ({
            is: vi.fn(() =>
              Promise.resolve({
                data:
                  table === "nodes"
                    ? val === "deal"
                      ? opts.deals ?? []
                      : val === "lead"
                      ? opts.leads ?? []
                      : opts.site_visits ?? []
                    : [],
                error: null,
              })
            ),
          })),
        })),
      })),
    })),
  };
}

const todayUtc = (): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("analytics.getKpisOverWindow", () => {
  it("returns one bucket per UTC day in the window, including empty days", async () => {
    const client = makeClient({});
    const buckets = await getKpisOverWindow(7, client as never);
    expect(buckets).toHaveLength(7);
    const dates = buckets.map((b) => b.date);
    expect(dates[6]).toBe(todayUtc());
    expect(dates[0]).toBe(daysAgo(6));
  });

  it("counts deals with state=booked into bookings; everyone in funnel into qualified_starts", async () => {
    const client = makeClient({
      deals: [
        {
          data: { state: "booked" },
          updated_at: `${todayUtc()}T10:00:00Z`,
        },
        {
          data: { state: "booked" },
          updated_at: `${todayUtc()}T11:00:00Z`,
        },
        {
          data: { state: "qualified" },
          updated_at: `${todayUtc()}T12:00:00Z`,
        },
        {
          data: { state: "site_visit_scheduled" },
          updated_at: `${todayUtc()}T13:00:00Z`,
        },
      ],
    });
    const buckets = await getKpisOverWindow(3, client as never);
    const today = buckets.find((b) => b.date === todayUtc())!;
    expect(today.bookings).toBe(2);
    expect(today.qualified_starts).toBe(4); // booked is also in funnel
  });

  it("ignores deals outside the window", async () => {
    const client = makeClient({
      deals: [
        {
          data: { state: "booked" },
          updated_at: `${daysAgo(60)}T10:00:00Z`,
        },
      ],
    });
    const buckets = await getKpisOverWindow(7, client as never);
    expect(buckets.every((b) => b.bookings === 0)).toBe(true);
  });

  it("counts site visits by scheduled_at day, splits completed vs no_show", async () => {
    const today = todayUtc();
    const yesterday = daysAgo(1);
    const client = makeClient({
      site_visits: [
        { data: { state: "completed", scheduled_at: `${today}T09:00:00Z` } },
        { data: { state: "completed", scheduled_at: `${today}T15:00:00Z` } },
        { data: { state: "no_show", scheduled_at: `${yesterday}T11:00:00Z` } },
        { data: { state: "scheduled", scheduled_at: `${today}T17:00:00Z` } }, // not yet completed
      ],
    });
    const buckets = await getKpisOverWindow(7, client as never);
    const t = buckets.find((b) => b.date === today)!;
    const y = buckets.find((b) => b.date === yesterday)!;
    expect(t.sv_completed).toBe(2);
    expect(t.sv_no_show).toBe(0);
    expect(y.sv_completed).toBe(0);
    expect(y.sv_no_show).toBe(1);
  });

  it("ignores site visits with no scheduled_at field", async () => {
    const client = makeClient({
      site_visits: [
        { data: { state: "completed" } },
        { data: { state: "no_show", scheduled_at: undefined } },
      ],
    });
    const buckets = await getKpisOverWindow(7, client as never);
    expect(buckets.every((b) => b.sv_completed === 0 && b.sv_no_show === 0)).toBe(true);
  });
});

describe("analytics.bucketsToCsv", () => {
  const sample: AnalyticsBucket[] = [
    {
      date: "2026-05-08",
      bookings: 1,
      qualified_starts: 3,
      sv_completed: 0,
      sv_no_show: 1,
      lead_starts: 4,
      conversion_pct: 25.0,
    },
    {
      date: "2026-05-09",
      bookings: 4,
      qualified_starts: 5,
      sv_completed: 2,
      sv_no_show: 0,
      lead_starts: 8,
      conversion_pct: 50.0,
    },
  ];

  it("emits a header + one row per bucket for the chosen kpi", () => {
    const csv = bucketsToCsv("bookings", sample);
    expect(csv).toBe("date,bookings\n2026-05-08,1\n2026-05-09,4\n");
  });

  it("handles each kpi independently", () => {
    expect(bucketsToCsv("sv_completed", sample)).toBe(
      "date,sv_completed\n2026-05-08,0\n2026-05-09,2\n"
    );
    expect(bucketsToCsv("sv_no_show", sample)).toBe(
      "date,sv_no_show\n2026-05-08,1\n2026-05-09,0\n"
    );
    expect(bucketsToCsv("qualified_starts", sample)).toBe(
      "date,qualified_starts\n2026-05-08,3\n2026-05-09,5\n"
    );
  });

  it("emits header + trailing newline even on empty buckets", () => {
    const csv = bucketsToCsv("bookings", []);
    expect(csv).toBe("date,bookings\n\n");
  });

  it("emits conversion_pct column with empty cell on null", () => {
    const withNull: AnalyticsBucket[] = [
      {
        date: "2026-05-08",
        bookings: 0,
        qualified_starts: 0,
        sv_completed: 0,
        sv_no_show: 0,
        lead_starts: 0,
        conversion_pct: null,
      },
      {
        date: "2026-05-09",
        bookings: 1,
        qualified_starts: 1,
        sv_completed: 0,
        sv_no_show: 0,
        lead_starts: 4,
        conversion_pct: 25.0,
      },
    ];
    expect(bucketsToCsv("conversion_pct", withNull)).toBe(
      "date,conversion_pct\n2026-05-08,\n2026-05-09,25\n"
    );
    expect(bucketsToCsv("lead_starts", withNull)).toBe(
      "date,lead_starts\n2026-05-08,0\n2026-05-09,4\n"
    );
  });
});

describe("analytics.getKpisOverWindow conversion_pct", () => {
  it("computes conversion_pct = bookings / lead_starts, one decimal", async () => {
    const today = todayUtc();
    const client = makeClient({
      deals: [
        { data: { state: "booked" }, updated_at: `${today}T10:00:00Z` },
        { data: { state: "booked" }, updated_at: `${today}T12:00:00Z` },
      ],
      leads: [
        { created_at: `${today}T08:00:00Z` },
        { created_at: `${today}T08:30:00Z` },
        { created_at: `${today}T09:00:00Z` },
        { created_at: `${today}T09:30:00Z` },
      ],
    });
    const buckets = await getKpisOverWindow(3, client as never);
    const t = buckets.find((b) => b.date === today)!;
    expect(t.lead_starts).toBe(4);
    expect(t.bookings).toBe(2);
    expect(t.conversion_pct).toBe(50.0);
  });

  it("returns null conversion_pct when no leads that day", async () => {
    const client = makeClient({
      deals: [
        { data: { state: "booked" }, updated_at: `${todayUtc()}T10:00:00Z` },
      ],
      leads: [],
    });
    const buckets = await getKpisOverWindow(3, client as never);
    expect(buckets.every((b) => b.conversion_pct === null)).toBe(true);
  });

  it("rounds to one decimal: 1 booking / 3 leads = 33.3", async () => {
    const today = todayUtc();
    const client = makeClient({
      deals: [
        { data: { state: "booked" }, updated_at: `${today}T10:00:00Z` },
      ],
      leads: [
        { created_at: `${today}T08:00:00Z` },
        { created_at: `${today}T09:00:00Z` },
        { created_at: `${today}T10:00:00Z` },
      ],
    });
    const buckets = await getKpisOverWindow(3, client as never);
    const t = buckets.find((b) => b.date === today)!;
    expect(t.conversion_pct).toBe(33.3);
  });
});
