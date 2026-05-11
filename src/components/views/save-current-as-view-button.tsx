"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { viewsAction } from "@/app/(admin)/admin/views/actions";
import type {
  ColumnSpec,
  FilterClause,
  SortClause,
  ViewEntityType,
} from "@/lib/views/types";

/**
 * D-413 AC-11 — "Save current as view" affordance for list pages.
 *
 * Captures the current view's filters/columns/sort (passed from the server
 * component) and creates a new user-scope view via `viewsAction({intent:"create"})`.
 * On success, redirects to the same list with `?view=<slug>` so the user sees
 * their saved view selected immediately.
 *
 * Slug is auto-derived from the name (lowercase, kebab-case). The server-side
 * Zod schema rejects malformed slugs.
 */
export function SaveCurrentAsViewButton(props: {
  entityType: ViewEntityType;
  filters: FilterClause[];
  columns: ColumnSpec[];
  sort: SortClause | null;
  basePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const slug = slugify(name);

  async function onSave() {
    if (!slug) {
      setError("Pick a name (letters, then letters/digits/hyphens).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("intent", "create");
      fd.set("entity_type", props.entityType);
      fd.set("scope", "user");
      fd.set("name", name.trim());
      fd.set("slug", slug);
      fd.set("filters", JSON.stringify(props.filters));
      fd.set("columns", JSON.stringify(props.columns));
      fd.set("sort", JSON.stringify(props.sort));
      const r = await viewsAction(fd);
      if (!r.ok) {
        setError(r.message ?? "Could not save view.");
        setSaving(false);
        return;
      }
      setOpen(false);
      setName("");
      setSaving(false);
      router.push(`${props.basePath}?view=${encodeURIComponent(slug)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="save-current-as-view-button"
        onClick={() => setOpen(true)}
      >
        Save current as view
      </Button>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-2 py-1"
      data-testid="save-current-as-view-form"
    >
      <Input
        autoFocus
        placeholder="View name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 w-40 text-xs"
        data-testid="save-current-as-view-name"
        disabled={saving}
      />
      <Button
        type="button"
        size="sm"
        onClick={onSave}
        disabled={saving || !slug}
        data-testid="save-current-as-view-submit"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setError(null);
          setName("");
        }}
        disabled={saving}
      >
        Cancel
      </Button>
      {error && (
        <span
          role="alert"
          className="text-[11px] text-rose-700"
          data-testid="save-current-as-view-error"
        >
          {error}
        </span>
      )}
    </div>
  );
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^[0-9-]+/, "");
}
