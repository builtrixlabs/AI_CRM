// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchemaMismatch } from "@/components/canvas/schema-mismatch";

describe("SchemaMismatch", () => {
  it("renders alert role + audit-log link with the recordId", () => {
    render(<SchemaMismatch recordId="abc-123" />);
    const alert = screen.getByTestId("schema-mismatch");
    expect(alert.getAttribute("role")).toBe("alert");
    const link = screen.getByText("See audit log");
    expect(link.getAttribute("href")).toBe("/admin/audit?record_id=abc-123");
  });
});
