// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createRule: vi.fn(async () => ({ ok: true as const })),
  toggleRule: vi.fn(async () => ({ ok: true as const })),
  deleteRule: vi.fn(async () => ({ ok: true as const })),
  createTeam: vi.fn(async () => ({ ok: true as const })),
  addMember: vi.fn(async () => ({ ok: true as const })),
  removeMember: vi.fn(async () => ({ ok: true as const })),
  refresh: vi.fn(),
}));
vi.mock("@/app/(admin)/admin/allocation-rules/actions", () => ({
  createRuleAction: mocks.createRule,
  toggleRuleAction: mocks.toggleRule,
  deleteRuleAction: mocks.deleteRule,
  createTeamAction: mocks.createTeam,
  addTeamMemberAction: mocks.addMember,
  removeTeamMemberAction: mocks.removeMember,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { AllocationManager } from "@/components/allocation/allocation-manager";
import type { AllocationRule } from "@/lib/leads/allocation-engine";
import type { TeamWithMembers } from "@/lib/leads/allocation-admin";
import type { OrgRep } from "@/lib/projects/sales-mapping";

const TEAM = "dddddddd-4444-4555-8666-777777777777";
const REP_A = "aaaaaaaa-4444-4555-8666-777777777777";

const reps: OrgRep[] = [
  { id: REP_A, display_name: "Anjali", base_role: "presales_rep", on_leave: false },
];
const teams: TeamWithMembers[] = [
  { id: TEAM, name: "Senior team", members: [] },
];
const rules: AllocationRule[] = [
  {
    id: "r1",
    organization_id: "org-1",
    name: "Meta paid social",
    priority: 10,
    conditions: { source_channel: "paid_social" },
    target_kind: "team_round_robin",
    target_user_id: null,
    target_team_id: TEAM,
    active: true,
  },
];

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === "function" && "mockClear" in m) m.mockClear();
  }
});

describe("<AllocationManager>", () => {
  it("renders the teams + rules sections", () => {
    render(<AllocationManager rules={rules} teams={teams} reps={reps} />);
    expect(screen.getByTestId("allocation-teams")).toBeInTheDocument();
    expect(screen.getByTestId("allocation-rules")).toBeInTheDocument();
    expect(screen.getByTestId(`team-${TEAM}`)).toBeInTheDocument();
    expect(screen.getByTestId("rule-r1")).toBeInTheDocument();
  });

  it("creates a team from the name input", () => {
    render(<AllocationManager rules={[]} teams={[]} reps={reps} />);
    expect(screen.getByTestId("teams-empty")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("team-name-input"), {
      target: { value: "Junior team" },
    });
    fireEvent.click(screen.getByTestId("create-team-btn"));
    expect(mocks.createTeam).toHaveBeenCalledWith("Junior team");
  });

  it("adds a member to a team", () => {
    render(<AllocationManager rules={[]} teams={teams} reps={reps} />);
    fireEvent.change(screen.getByTestId(`team-${TEAM}-add-select`), {
      target: { value: REP_A },
    });
    fireEvent.click(screen.getByTestId(`team-${TEAM}-add-btn`));
    expect(mocks.addMember).toHaveBeenCalledWith(TEAM, REP_A);
  });

  it("creates a rule from the form", () => {
    render(<AllocationManager rules={[]} teams={teams} reps={reps} />);
    fireEvent.change(screen.getByTestId("rule-name-input"), {
      target: { value: "All MIH leads" },
    });
    fireEvent.change(screen.getByTestId("rule-priority-input"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByTestId("rule-target-team-select"), {
      target: { value: TEAM },
    });
    fireEvent.click(screen.getByTestId("create-rule-btn"));
    expect(mocks.createRule).toHaveBeenCalledTimes(1);
    const arg = mocks.createRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.name).toBe("All MIH leads");
    expect(arg.priority).toBe(50);
    expect(arg.target_kind).toBe("team_round_robin");
    expect(arg.target_team_id).toBe(TEAM);
  });

  it("toggles a rule's active state", () => {
    render(<AllocationManager rules={rules} teams={teams} reps={reps} />);
    fireEvent.click(screen.getByTestId("rule-toggle-r1"));
    expect(mocks.toggleRule).toHaveBeenCalledWith("r1", false);
  });
});
