// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LookupResults } from "@/components/cmdk/lookup-results";
import type { SearchLeadResult } from "@/app/(dashboard)/dashboard/_actions/searchLeads";

const SAMPLE: SearchLeadResult[] = [
  {
    id: "lead-1",
    label: "Priya Sharma",
    state: "qualified",
    phone: "+91-9876543210",
  },
  {
    id: "lead-2",
    label: "Rakesh Kumar",
    state: "new",
  },
];

describe("LookupResults", () => {
  it("renders the empty-prompt state when query is blank", () => {
    render(
      <LookupResults
        query=""
        results={[]}
        loading={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId("lookup-empty")).toBeInTheDocument();
  });

  it("renders the loading state when loading=true", () => {
    render(
      <LookupResults
        query="Priya"
        results={[]}
        loading={true}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId("lookup-loading")).toBeInTheDocument();
  });

  it("renders the no-results state when results is empty", () => {
    render(
      <LookupResults
        query="zzz"
        results={[]}
        loading={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId("lookup-no-results")).toBeInTheDocument();
  });

  it("renders one row per result with label + state + phone", () => {
    render(
      <LookupResults
        query="Pri"
        results={SAMPLE}
        loading={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("+91-9876543210")).toBeInTheDocument();
    expect(screen.getByText("Rakesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("qualified")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("calls onSelect with the result when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <LookupResults
        query="Pri"
        results={SAMPLE}
        loading={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("lookup-result-lead-1"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]![0].id).toBe("lead-1");
  });

  it("hides phone line when phone is undefined", () => {
    render(
      <LookupResults
        query="Rak"
        results={[SAMPLE[1]!]}
        loading={false}
        onSelect={() => {}}
      />,
    );
    // The result row exists but no phone span renders.
    expect(
      screen.queryByText("+91-9876543210"),
    ).toBeNull();
  });
});
