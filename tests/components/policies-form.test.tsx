// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PoliciesForm,
  type PolicyRow,
} from "@/app/(admin)/admin/agents/policies/policies-form";

const setAgentPolicyAction = vi.fn();
vi.mock("@/app/(admin)/admin/agents/policies/actions", () => ({
  setAgentPolicyAction: (...args: unknown[]) => setAgentPolicyAction(...args),
}));

function rows(): PolicyRow[] {
  return [
    {
      agent_kind: "brochure_send",
      label: "Brochure share",
      description: "shares a brochure after a call",
      mode: "require_approval",
      locked: false,
    },
    {
      agent_kind: "site_visit_booking",
      label: "Site-visit booking",
      description: "cab details must be entered by an operator",
      mode: "require_approval",
      locked: true,
    },
  ];
}

function switchIn(testId: string): HTMLButtonElement {
  return screen
    .getByTestId(testId)
    .querySelector('button[role="switch"]') as HTMLButtonElement;
}

beforeEach(() => {
  setAgentPolicyAction.mockReset();
});

describe("<PoliciesForm>", () => {
  it("renders a row per agent kind with its current mode (AC-7)", () => {
    render(<PoliciesForm rows={rows()} />);
    expect(screen.getByTestId("policy-row-brochure_send")).toBeTruthy();
    expect(screen.getByTestId("policy-row-site_visit_booking")).toBeTruthy();
    expect(
      screen.getByTestId("policy-mode-brochure_send").textContent,
    ).toMatch(/require approval/i);
  });

  it("the locked row's switch is disabled (AC-7)", () => {
    render(<PoliciesForm rows={rows()} />);
    expect(switchIn("policy-row-site_visit_booking").disabled).toBe(true);
  });

  it("toggling a configurable row calls setAgentPolicyAction and reflects the new mode", async () => {
    setAgentPolicyAction.mockResolvedValue({ ok: true, mode: "auto_send" });
    render(<PoliciesForm rows={rows()} />);
    const sw = switchIn("policy-row-brochure_send");
    expect(sw.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(sw);

    await waitFor(() => {
      expect(setAgentPolicyAction).toHaveBeenCalledWith(
        "brochure_send",
        "auto_send",
      );
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("policy-mode-brochure_send").textContent,
      ).toMatch(/auto-send/i);
    });
  });

  it("a failed action surfaces an error and leaves the mode unchanged", async () => {
    setAgentPolicyAction.mockResolvedValue({ ok: false, error: "permission" });
    render(<PoliciesForm rows={rows()} />);

    fireEvent.click(switchIn("policy-row-brochure_send"));

    await waitFor(() => {
      expect(screen.getByTestId("policy-error-brochure_send")).toBeTruthy();
    });
    expect(
      screen.getByTestId("policy-mode-brochure_send").textContent,
    ).toMatch(/require approval/i);
  });

  it("does not call the action for a locked row", () => {
    render(<PoliciesForm rows={rows()} />);
    fireEvent.click(switchIn("policy-row-site_visit_booking"));
    expect(setAgentPolicyAction).not.toHaveBeenCalled();
  });
});
