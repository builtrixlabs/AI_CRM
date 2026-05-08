// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FieldRow,
  FieldValue,
  LEAD_FIELDS,
} from "@/components/canvas/field-renderers";

describe("LEAD_FIELDS registry", () => {
  it("declares phone, source, intent_score as primary", () => {
    const primaryKeys = LEAD_FIELDS.filter((f) => f.primary).map((f) => f.key);
    expect(primaryKeys).toEqual(["phone", "source", "intent_score"]);
  });

  it("declares email and notes as non-primary", () => {
    const nonPrimary = LEAD_FIELDS.filter((f) => !f.primary).map((f) => f.key);
    expect(nonPrimary).toEqual(["email", "notes"]);
  });
});

describe("FieldValue", () => {
  it("renders email as a mailto link", () => {
    render(<FieldValue kind="email" value="a@b.com" />);
    const link = screen.getByTestId("field-value");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("mailto:a@b.com");
  });

  it("renders phone as a tel link", () => {
    render(<FieldValue kind="phone" value="+91-9876543210" />);
    const link = screen.getByTestId("field-value");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("tel:+91-9876543210");
  });

  it("renders number with tabular-nums", () => {
    render(<FieldValue kind="number" value={42} />);
    const node = screen.getByTestId("field-value");
    expect(node.textContent).toBe("42");
    expect(node.className).toContain("tabular-nums");
  });

  it("renders enum as a badge", () => {
    render(<FieldValue kind="enum" value="magicbricks" />);
    expect(screen.getByTestId("field-value").getAttribute("data-kind")).toBe("enum");
  });

  it("renders a score with hot color when ≥70", () => {
    render(<FieldValue kind="score" value={87} />);
    const node = screen.getByTestId("field-value");
    expect(node.className).toContain("rose");
    expect(node.textContent).toBe("87");
  });

  it("renders a score with warm color when 40-69", () => {
    render(<FieldValue kind="score" value={55} />);
    expect(screen.getByTestId("field-value").className).toContain("amber");
  });

  it("renders a score with cold color when <40", () => {
    render(<FieldValue kind="score" value={12} />);
    expect(screen.getByTestId("field-value").className).toContain("neutral");
  });

  it("coerces non-numeric score to 0", () => {
    render(<FieldValue kind="score" value="oops" />);
    expect(screen.getByTestId("field-value").textContent).toBe("0");
  });

  it("renders unknown kind as plain string", () => {
    render(<FieldValue kind={"unknown" as never} value="abc" />);
    const node = screen.getByTestId("field-value");
    expect(node.getAttribute("data-kind")).toBe("string");
    expect(node.textContent).toBe("abc");
  });

  it("renders nothing for null", () => {
    const { container } = render(<FieldValue kind="string" value={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<FieldValue kind="string" value={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for empty string", () => {
    const { container } = render(<FieldValue kind="string" value="   " />);
    expect(container.firstChild).toBeNull();
  });
});

describe("FieldRow", () => {
  it("renders the label and value when value is present", () => {
    render(
      <FieldRow
        field={LEAD_FIELDS.find((f) => f.key === "phone")!}
        value="+91-9876543210"
      />,
    );
    expect(screen.getByTestId("field-row").getAttribute("data-key")).toBe("phone");
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });

  it("renders nothing when the value is empty (progressive disclosure)", () => {
    const { container } = render(
      <FieldRow
        field={LEAD_FIELDS.find((f) => f.key === "notes")!}
        value=""
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
