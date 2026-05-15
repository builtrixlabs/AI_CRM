// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({ ok: true as const })),
  remove: vi.fn(async () => ({ ok: true as const })),
  setPrimary: vi.fn(async () => ({ ok: true as const })),
  refresh: vi.fn(),
}));
vi.mock("@/app/(admin)/admin/projects/[id]/sales-team/actions", () => ({
  addAssignmentAction: mocks.add,
  removeAssignmentAction: mocks.remove,
  setPrimaryAction: mocks.setPrimary,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { SalesTeamManager } from "@/components/projects/sales-team-manager";

const PROJECT = "22222222-3333-4444-8555-666666666666";
const REP_A = "aaaaaaaa-3333-4444-8555-666666666666";
const REP_B = "bbbbbbbb-3333-4444-8555-666666666666";

beforeEach(() => {
  mocks.add.mockClear();
  mocks.remove.mockClear();
  mocks.setPrimary.mockClear();
});

describe("<SalesTeamManager>", () => {
  it("renders the empty state with no assignments", () => {
    render(
      <SalesTeamManager projectId={PROJECT} assignments={[]} reps={[]} />,
    );
    expect(screen.getByTestId("sales-team-empty")).toBeInTheDocument();
  });

  it("renders a row per assignment; the primary row has no 'Make primary' button", () => {
    render(
      <SalesTeamManager
        projectId={PROJECT}
        assignments={[
          {
            id: "a1",
            sales_rep_id: REP_A,
            sales_rep_name: "Anjali",
            sales_rep_on_leave: false,
            is_primary: true,
            created_at: "2026-05-01",
          },
          {
            id: "a2",
            sales_rep_id: REP_B,
            sales_rep_name: "Biju",
            sales_rep_on_leave: true,
            is_primary: false,
            created_at: "2026-05-02",
          },
        ]}
        reps={[]}
      />,
    );
    expect(screen.getByTestId(`sales-team-row-${REP_A}`)).toBeInTheDocument();
    expect(screen.getByTestId(`sales-team-row-${REP_B}`)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`sales-team-primary-${REP_A}`),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`sales-team-primary-${REP_B}`),
    ).toBeInTheDocument();
  });

  it("calls setPrimaryAction when 'Make primary' is clicked", () => {
    render(
      <SalesTeamManager
        projectId={PROJECT}
        assignments={[
          {
            id: "a2",
            sales_rep_id: REP_B,
            sales_rep_name: "Biju",
            sales_rep_on_leave: false,
            is_primary: false,
            created_at: "2026-05-02",
          },
        ]}
        reps={[]}
      />,
    );
    fireEvent.click(screen.getByTestId(`sales-team-primary-${REP_B}`));
    expect(mocks.setPrimary).toHaveBeenCalledWith(PROJECT, REP_B);
  });

  it("adds a rep selected from the dropdown", () => {
    render(
      <SalesTeamManager
        projectId={PROJECT}
        assignments={[]}
        reps={[
          {
            id: REP_A,
            display_name: "Anjali",
            base_role: "sales_rep",
            on_leave: false,
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByTestId("sales-team-add-select"), {
      target: { value: REP_A },
    });
    fireEvent.click(screen.getByTestId("sales-team-add-btn"));
    expect(mocks.add).toHaveBeenCalledWith(PROJECT, REP_A);
  });

  it("excludes already-assigned reps from the add dropdown", () => {
    render(
      <SalesTeamManager
        projectId={PROJECT}
        assignments={[
          {
            id: "a1",
            sales_rep_id: REP_A,
            sales_rep_name: "Anjali",
            sales_rep_on_leave: false,
            is_primary: false,
            created_at: "2026-05-01",
          },
        ]}
        reps={[
          {
            id: REP_A,
            display_name: "Anjali",
            base_role: "sales_rep",
            on_leave: false,
          },
          {
            id: REP_B,
            display_name: "Biju",
            base_role: "sales_rep",
            on_leave: false,
          },
        ]}
      />,
    );
    const select = screen.getByTestId(
      "sales-team-add-select",
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain(REP_B);
    expect(optionValues).not.toContain(REP_A);
  });
});
