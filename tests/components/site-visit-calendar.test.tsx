// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteVisitCalendar } from "@/components/cockpit/site-visit-calendar";
import type { CalendarDay } from "@/lib/sitevisits/calendar";

function makeDay(
  date: string,
  overrides: Partial<CalendarDay["by_state"]> = {}
): CalendarDay {
  // D-602 — 7-state buckets (baseline/110 §III amendment).
  const by_state = {
    draft: 0,
    scheduled: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    ...overrides,
  };
  const total = Object.values(by_state).reduce((s, n) => s + n, 0);
  return {
    date,
    date_utc: `${date}T00:00:00.000Z`,
    total,
    by_state,
  };
}

describe("<SiteVisitCalendar>", () => {
  it("renders the empty-state when total is zero", () => {
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) =>
      makeDay(`2026-05-${String(9 + i).padStart(2, "0")}`)
    );
    render(<SiteVisitCalendar days={days} />);
    expect(screen.getByText(/quiet week ahead/)).toBeDefined();
  });

  it("renders 7 cells with counts when populated", () => {
    const days: CalendarDay[] = [
      makeDay("2026-05-09", { scheduled: 2, confirmed: 1 }),
      makeDay("2026-05-10", { confirmed: 3 }),
      makeDay("2026-05-11"),
      makeDay("2026-05-12", { completed: 5 }),
      makeDay("2026-05-13"),
      makeDay("2026-05-14", { no_show: 1, scheduled: 3 }),
      makeDay("2026-05-15"),
    ];
    render(<SiteVisitCalendar days={days} />);

    expect(screen.getAllByText("3 visits").length).toBe(2); // 2026-05-09 (2+1) and 2026-05-10 (3)
    expect(screen.getByText("5 visits")).toBeDefined(); // 2026-05-12
    expect(screen.getByText("4 visits")).toBeDefined(); // 2026-05-14 (no_show + scheduled)
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3); // empty days
  });

  it("links each cell to /dashboard/site-visits?date=...", () => {
    const days: CalendarDay[] = [
      makeDay("2026-05-09", { scheduled: 1 }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeDay(`2026-05-${String(10 + i).padStart(2, "0")}`)
      ),
    ];
    render(<SiteVisitCalendar days={days} />);
    const link = screen.getAllByRole("listitem")[0];
    expect(link.getAttribute("href")).toBe(
      "/dashboard/site-visits?date=2026-05-09"
    );
  });

  it("respects custom hrefPrefix", () => {
    const days: CalendarDay[] = [
      makeDay("2026-05-09", { scheduled: 1 }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeDay(`2026-05-${String(10 + i).padStart(2, "0")}`)
      ),
    ];
    render(<SiteVisitCalendar days={days} hrefPrefix="/dashboard/visits" />);
    const link = screen.getAllByRole("listitem")[0];
    expect(link.getAttribute("href")).toBe(
      "/dashboard/visits?date=2026-05-09"
    );
  });
});
