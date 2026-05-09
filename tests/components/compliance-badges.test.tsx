// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComplianceBadges } from "@/components/compliance/compliance-badges";

describe("<ComplianceBadges>", () => {
  it("renders both registered when both fields set", () => {
    render(
      <ComplianceBadges
        rera_number="PRM/KA/RERA/1251/308/PR/200405/001234"
        gstin="29AAACC1234A1Z5"
      />
    );
    expect(screen.getByText(/RERA · 1234/)).toBeDefined();
    expect(screen.getByText(/GSTIN · A1Z5/)).toBeDefined();
  });

  it("renders missing labels when both are null", () => {
    render(<ComplianceBadges rera_number={null} gstin={null} />);
    expect(screen.getByText("RERA missing")).toBeDefined();
    expect(screen.getByText("GSTIN missing")).toBeDefined();
  });

  it("handles RERA-only", () => {
    render(<ComplianceBadges rera_number="REGAB1234" gstin={null} />);
    expect(screen.getByText(/RERA · 1234/)).toBeDefined();
    expect(screen.getByText("GSTIN missing")).toBeDefined();
  });

  it("handles GSTIN-only", () => {
    render(<ComplianceBadges rera_number={null} gstin="29AAACC1234A1Z5" />);
    expect(screen.getByText("RERA missing")).toBeDefined();
    expect(screen.getByText(/GSTIN · A1Z5/)).toBeDefined();
  });

  it("compact mode uses ✓ / ✗ glyphs", () => {
    render(
      <ComplianceBadges
        rera_number="PRM/KA/RERA/1251/308/PR/200405/001234"
        gstin={null}
        compact
      />
    );
    expect(screen.getByText("RERA ✓")).toBeDefined();
    expect(screen.getByText("GSTIN ✗")).toBeDefined();
  });

  it("exposes ARIA labels", () => {
    render(
      <ComplianceBadges
        rera_number="PRM/KA/RERA/1251/308/PR/200405/001234"
        gstin={null}
      />
    );
    expect(screen.getByLabelText(/RERA registered/)).toBeDefined();
    expect(screen.getByLabelText(/GSTIN missing/)).toBeDefined();
  });
});
