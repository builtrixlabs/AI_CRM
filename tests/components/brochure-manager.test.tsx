// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrochureManager } from "@/components/brochures/brochure-manager";
import type { BrochureSummary } from "@/lib/brochures/repository";
import type { ProjectSummary } from "@/lib/projects/sales-mapping";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const requestBrochureUploadAction = vi.fn();
const finalizeBrochureAction = vi.fn();
const updateBrochureAction = vi.fn();
const deleteBrochureAction = vi.fn();
const getBrochureUrlAction = vi.fn();
vi.mock("@/app/(admin)/admin/brochures/actions", () => ({
  requestBrochureUploadAction: (...a: unknown[]) =>
    requestBrochureUploadAction(...a),
  finalizeBrochureAction: (...a: unknown[]) => finalizeBrochureAction(...a),
  updateBrochureAction: (...a: unknown[]) => updateBrochureAction(...a),
  deleteBrochureAction: (...a: unknown[]) => deleteBrochureAction(...a),
  getBrochureUrlAction: (...a: unknown[]) => getBrochureUrlAction(...a),
}));

const uploadToSignedUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl }) },
  }),
}));

const PROJECTS: ProjectSummary[] = [
  { id: "proj-1", name: "Prestige Lakeside", city: "Bengaluru" },
];

function brochure(over: Partial<BrochureSummary> = {}): BrochureSummary {
  return {
    id: "b-1",
    project_id: "proj-1",
    document_type: "floor_plan",
    title: "3BHK floor plan",
    file_size_bytes: 2048,
    mime_type: "application/pdf",
    metadata: { bhk: 3, budget_band: "1.5-2Cr", tags: ["lake-view"] },
    uploaded_at: "2026-05-14T10:00:00.000Z",
    uploaded_by: "user-1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<BrochureManager>", () => {
  it("renders the empty state when there are no brochures", () => {
    render(
      <BrochureManager brochures={[]} projects={PROJECTS} canDelete />,
    );
    expect(screen.getByTestId("brochure-empty")).toBeDefined();
    expect(screen.getByTestId("brochure-upload-form")).toBeDefined();
  });

  it("renders the upload form with file + metadata fields", () => {
    render(
      <BrochureManager brochures={[]} projects={PROJECTS} canDelete />,
    );
    expect(screen.getByTestId("brochure-file-input")).toBeDefined();
    expect(screen.getByTestId("brochure-upload-title-input")).toBeDefined();
    expect(screen.getByTestId("brochure-upload-doctype-select")).toBeDefined();
    expect(screen.getByTestId("brochure-save-btn")).toBeDefined();
  });

  it("renders a brochure row with its document type + metadata", () => {
    render(
      <BrochureManager
        brochures={[brochure()]}
        projects={PROJECTS}
        canDelete
      />,
    );
    const row = screen.getByTestId("brochure-row-b-1");
    expect(row.textContent).toContain("3BHK floor plan");
    expect(row.textContent).toContain("Floor plan");
    expect(row.textContent).toContain("Prestige Lakeside");
    expect(row.textContent).toContain("3 BHK");
  });

  it("blocks save with a clear error when no file is chosen", () => {
    render(
      <BrochureManager brochures={[]} projects={PROJECTS} canDelete />,
    );
    fireEvent.click(screen.getByTestId("brochure-save-btn"));
    expect(screen.getByTestId("brochure-upload-error").textContent).toMatch(
      /choose a file/i,
    );
    expect(requestBrochureUploadAction).not.toHaveBeenCalled();
  });

  it("hides the delete control when canDelete is false", () => {
    render(
      <BrochureManager
        brochures={[brochure()]}
        projects={PROJECTS}
        canDelete={false}
      />,
    );
    expect(screen.queryByTestId("brochure-delete-b-1")).toBeNull();
  });

  it("requires a two-step confirm before deleting", async () => {
    deleteBrochureAction.mockResolvedValue({ ok: true });
    render(
      <BrochureManager
        brochures={[brochure()]}
        projects={PROJECTS}
        canDelete
      />,
    );
    fireEvent.click(screen.getByTestId("brochure-delete-b-1"));
    expect(deleteBrochureAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("brochure-delete-confirm-b-1"));
    await waitFor(() =>
      expect(deleteBrochureAction).toHaveBeenCalledWith("b-1"),
    );
  });

  it("opens a signed URL when View is clicked", async () => {
    getBrochureUrlAction.mockResolvedValue({
      ok: true,
      url: "https://signed/read",
      title: "3BHK floor plan",
    });
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    render(
      <BrochureManager
        brochures={[brochure()]}
        projects={PROJECTS}
        canDelete
      />,
    );
    fireEvent.click(screen.getByTestId("brochure-view-b-1"));
    await waitFor(() =>
      expect(getBrochureUrlAction).toHaveBeenCalledWith("b-1"),
    );
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "https://signed/read",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    openSpy.mockRestore();
  });

  it("toggles the inline metadata editor when Edit is clicked", () => {
    render(
      <BrochureManager
        brochures={[brochure()]}
        projects={PROJECTS}
        canDelete
      />,
    );
    expect(screen.queryByTestId("brochure-edit-b-1-title-input")).toBeNull();
    fireEvent.click(screen.getByTestId("brochure-edit-b-1"));
    expect(screen.getByTestId("brochure-edit-b-1-title-input")).toBeDefined();
    expect(screen.getByTestId("brochure-edit-save-b-1")).toBeDefined();
  });
});
