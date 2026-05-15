"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ALLOWED_MIME_TYPES,
  BROCHURES_BUCKET,
  BUDGET_BANDS,
  DOCUMENT_TYPES,
  MAX_FILE_BYTES,
  isAllowedMimeType,
  type BrochureMetadataInput,
} from "@/lib/brochures/schemas";
import type { BrochureSummary } from "@/lib/brochures/repository";
import type { ProjectSummary } from "@/lib/projects/sales-mapping";
import {
  deleteBrochureAction,
  finalizeBrochureAction,
  getBrochureUrlAction,
  requestBrochureUploadAction,
  updateBrochureAction,
} from "@/app/(admin)/admin/brochures/actions";

type FormState = {
  title: string;
  document_type: string;
  project_id: string;
  bhk: string;
  budget_band: string;
  area_sqft_min: string;
  area_sqft_max: string;
  tags: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  document_type: "",
  project_id: "",
  bhk: "",
  budget_band: "",
  area_sqft_min: "",
  area_sqft_max: "",
  tags: "",
  description: "",
};

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function labelFor(dt: string): string {
  return dt.charAt(0).toUpperCase() + dt.slice(1).replace(/_/g, " ");
}

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function buildMetadata(s: FormState): BrochureMetadataInput {
  const tags = s.tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const m: BrochureMetadataInput = { tags };
  const bhk = numOrUndef(s.bhk);
  if (bhk !== undefined) m.bhk = bhk;
  if (s.budget_band.trim()) m.budget_band = s.budget_band.trim();
  const amin = numOrUndef(s.area_sqft_min);
  if (amin !== undefined) m.area_sqft_min = amin;
  const amax = numOrUndef(s.area_sqft_max);
  if (amax !== undefined) m.area_sqft_max = amax;
  if (s.description.trim()) m.description = s.description.trim();
  return m;
}

function formFromBrochure(b: BrochureSummary): FormState {
  return {
    title: b.title,
    document_type: b.document_type,
    project_id: b.project_id ?? "",
    bhk: b.metadata.bhk !== undefined ? String(b.metadata.bhk) : "",
    budget_band: b.metadata.budget_band ?? "",
    area_sqft_min:
      b.metadata.area_sqft_min !== undefined
        ? String(b.metadata.area_sqft_min)
        : "",
    area_sqft_max:
      b.metadata.area_sqft_max !== undefined
        ? String(b.metadata.area_sqft_max)
        : "",
    tags: (b.metadata.tags ?? []).join(", "),
    description: b.metadata.description ?? "",
  };
}

const inputCls =
  "h-8 rounded border border-neutral-300 px-2 text-sm w-full";

/** Shared metadata field block — used by both the upload form and the
 *  per-row edit form. */
function MetadataFields({
  state,
  onChange,
  projects,
  idPrefix,
}: {
  state: FormState;
  onChange: (patch: Partial<FormState>) => void;
  projects: ProjectSummary[];
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-600">
        Title
        <input
          className={inputCls}
          value={state.title}
          onChange={(e) => onChange({ title: e.target.value })}
          data-testid={`${idPrefix}-title-input`}
          placeholder="e.g. Prestige Lakeside — 3BHK floor plan"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Document type
        <select
          className={inputCls}
          value={state.document_type}
          onChange={(e) => onChange({ document_type: e.target.value })}
          data-testid={`${idPrefix}-doctype-select`}
        >
          <option value="">Select…</option>
          {DOCUMENT_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {labelFor(dt)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Project
        <select
          className={inputCls}
          value={state.project_id}
          onChange={(e) => onChange({ project_id: e.target.value })}
          data-testid={`${idPrefix}-project-select`}
        >
          <option value="">Project-agnostic</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        BHK
        <input
          className={inputCls}
          type="number"
          min={1}
          max={5}
          value={state.bhk}
          onChange={(e) => onChange({ bhk: e.target.value })}
          data-testid={`${idPrefix}-bhk-input`}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Budget band
        <select
          className={inputCls}
          value={state.budget_band}
          onChange={(e) => onChange({ budget_band: e.target.value })}
          data-testid={`${idPrefix}-budget-select`}
        >
          <option value="">—</option>
          {BUDGET_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Area sqft (min)
        <input
          className={inputCls}
          type="number"
          min={0}
          value={state.area_sqft_min}
          onChange={(e) => onChange({ area_sqft_min: e.target.value })}
          data-testid={`${idPrefix}-area-min-input`}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Area sqft (max)
        <input
          className={inputCls}
          type="number"
          min={0}
          value={state.area_sqft_max}
          onChange={(e) => onChange({ area_sqft_max: e.target.value })}
          data-testid={`${idPrefix}-area-max-input`}
        />
      </label>

      <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-600">
        Tags (comma-separated)
        <input
          className={inputCls}
          value={state.tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          data-testid={`${idPrefix}-tags-input`}
          placeholder="lake-view, corner-unit"
        />
      </label>

      <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-600">
        Description
        <input
          className={inputCls}
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          data-testid={`${idPrefix}-description-input`}
        />
      </label>
    </div>
  );
}

function UploadForm({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function onPickFile(f: File | null) {
    setFile(f);
    setError(null);
    if (f && !form.title.trim()) patch({ title: stripExt(f.name) });
  }

  function handleSave() {
    setError(null);
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!isAllowedMimeType(file.type)) {
      setError("Only PDF, JPG, and PNG files are allowed.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File exceeds the 25 MB limit.");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.document_type) {
      setError("Document type is required.");
      return;
    }

    startTransition(async () => {
      const req = await requestBrochureUploadAction(
        file.name,
        file.type,
        file.size,
      );
      if (!req.ok) {
        setError(req.message ?? req.reason);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const up = await supabase.storage
        .from(BROCHURES_BUCKET)
        .uploadToSignedUrl(req.path, req.token, file);
      if (up.error) {
        setError(`Upload failed: ${up.error.message}`);
        return;
      }
      const fin = await finalizeBrochureAction({
        path: req.path,
        file_size_bytes: file.size,
        mime_type: file.type,
        title: form.title.trim(),
        document_type: form.document_type,
        project_id: form.project_id || null,
        metadata: buildMetadata(form),
      });
      if (!fin.ok) {
        setError(fin.message ?? fin.reason);
        return;
      }
      setFile(null);
      setForm(EMPTY_FORM);
      router.refresh();
    });
  }

  return (
    <div
      className="space-y-3 rounded border border-neutral-200 p-4"
      data-testid="brochure-upload-form"
    >
      <h2 className="text-sm font-semibold">Upload a brochure</h2>

      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        File (PDF, JPG, or PNG — max 25 MB)
        <input
          className="text-sm"
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          data-testid="brochure-file-input"
        />
      </label>

      <MetadataFields
        state={form}
        onChange={patch}
        projects={projects}
        idPrefix="brochure-upload"
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={handleSave}
          data-testid="brochure-save-btn"
        >
          {pending ? "Saving…" : "Save brochure"}
        </Button>
        {error && (
          <p
            className="text-xs text-red-600"
            role="alert"
            data-testid="brochure-upload-error"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function BrochureRow({
  brochure,
  projects,
  canDelete,
}: {
  brochure: BrochureSummary;
  projects: ProjectSummary[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromBrochure(brochure));

  const projectName =
    brochure.project_id !== null
      ? (projects.find((p) => p.id === brochure.project_id)?.name ??
        "Unknown project")
      : "Project-agnostic";

  function openView() {
    setError(null);
    startTransition(async () => {
      const r = await getBrochureUrlAction(brochure.id);
      if (!r.ok) {
        setError(r.message ?? r.reason);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  }

  function saveEdit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.document_type) {
      setError("Document type is required.");
      return;
    }
    startTransition(async () => {
      const r = await updateBrochureAction({
        id: brochure.id,
        title: form.title.trim(),
        document_type: form.document_type,
        project_id: form.project_id || null,
        metadata: buildMetadata(form),
      });
      if (!r.ok) {
        setError(r.message ?? r.reason);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteBrochureAction(brochure.id);
      if (!r.ok) {
        setError(r.message ?? r.reason);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      className="rounded border border-neutral-200 px-4 py-3"
      data-testid={`brochure-row-${brochure.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-violet-800">
              {labelFor(brochure.document_type)}
            </span>
            <span className="truncate font-medium">{brochure.title}</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {projectName}
            {brochure.metadata.bhk !== undefined
              ? ` · ${brochure.metadata.bhk} BHK`
              : ""}
            {brochure.metadata.budget_band
              ? ` · ${brochure.metadata.budget_band}`
              : ""}
            {(brochure.metadata.tags ?? []).length > 0
              ? ` · ${(brochure.metadata.tags ?? []).join(", ")}`
              : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={openView}
            data-testid={`brochure-view-${brochure.id}`}
          >
            View
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setEditing((v) => !v);
              setForm(formFromBrochure(brochure));
              setError(null);
            }}
            data-testid={`brochure-edit-${brochure.id}`}
          >
            {editing ? "Cancel" : "Edit"}
          </Button>
          {canDelete &&
            (confirmDelete ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={doDelete}
                  data-testid={`brochure-delete-confirm-${brochure.id}`}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
                data-testid={`brochure-delete-${brochure.id}`}
              >
                Delete
              </Button>
            ))}
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <MetadataFields
            state={form}
            onChange={(p) => setForm((f) => ({ ...f, ...p }))}
            projects={projects}
            idPrefix={`brochure-edit-${brochure.id}`}
          />
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={saveEdit}
              data-testid={`brochure-edit-save-${brochure.id}`}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="mt-2 text-xs text-red-600"
          role="alert"
          data-testid={`brochure-row-error-${brochure.id}`}
        >
          {error}
        </p>
      )}
    </li>
  );
}

export function BrochureManager({
  brochures,
  projects,
  canDelete,
}: {
  brochures: BrochureSummary[];
  projects: ProjectSummary[];
  canDelete: boolean;
}) {
  return (
    <div className="space-y-6" data-testid="brochure-manager">
      <UploadForm projects={projects} />

      <ul className="space-y-2" data-testid="brochure-list">
        {brochures.length === 0 ? (
          <li
            className="rounded border border-neutral-200 px-4 py-6 text-sm text-neutral-500"
            data-testid="brochure-empty"
          >
            No brochures yet. Upload your first project document above —
            tag it with the project and BHK so the Brochure Agent can find
            it.
          </li>
        ) : (
          brochures.map((b) => (
            <BrochureRow
              key={b.id}
              brochure={b}
              projects={projects}
              canDelete={canDelete}
            />
          ))
        )}
      </ul>
    </div>
  );
}
