// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/dashboard/site-visits",
  useSearchParams: () => new URLSearchParams(),
}));

import { SiteVisitFilterBar } from "@/components/sitevisits/site-visit-filter-bar";

describe("<SiteVisitFilterBar>", () => {
  it("renders the window / status / specific-day controls", () => {
    render(<SiteVisitFilterBar />);
    expect(screen.getByTestId("sv-filter-bucket")).toBeInTheDocument();
    expect(screen.getByTestId("sv-filter-status")).toBeInTheDocument();
    expect(screen.getByTestId("sv-filter-date")).toBeInTheDocument();
  });

  it("pushes a status filter into the URL", () => {
    mocks.push.mockClear();
    render(<SiteVisitFilterBar />);
    fireEvent.change(screen.getByTestId("sv-filter-status"), {
      target: { value: "no_show" },
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/site-visits?status=no_show",
    );
  });

  it("pushes a bucket filter into the URL", () => {
    mocks.push.mockClear();
    render(<SiteVisitFilterBar />);
    fireEvent.change(screen.getByTestId("sv-filter-bucket"), {
      target: { value: "today" },
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/site-visits?bucket=today",
    );
  });

  it("pushes a specific day into the URL", () => {
    mocks.push.mockClear();
    render(<SiteVisitFilterBar />);
    fireEvent.change(screen.getByTestId("sv-filter-date"), {
      target: { value: "2026-05-20" },
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/site-visits?date=2026-05-20",
    );
  });
});
