// D-413 — column resolution: merge a resolved view's `columns` with the
// org's custom field definitions, drop any column referencing a custom field
// that has been deleted, and back-fill labels from the field definitions.
//
// Pure function. No I/O. Tested separately so the list-page integration
// can stay thin.

import {
  customFieldKey,
  isCustomFieldRef,
  type ColumnSpec,
  type CustomViewRow,
} from "./types";

export type CustomFieldDef = { field_key: string; label: string };

export type CompileColumnsArgs = {
  view: CustomViewRow | null;
  customFieldDefs: CustomFieldDef[];
  fallback: ColumnSpec[];
};

/**
 * Merge a view's saved columns with the org's live custom-field catalog.
 *
 * Rules:
 *   1. If `view` is null or has no columns, return `fallback`.
 *   2. Drop any column referencing a `custom:*` field whose definition no
 *      longer exists in the org (the field was deleted). This is silent —
 *      the view itself is not modified; users will re-save if they care.
 *   3. For columns that don't carry an explicit `label`, back-fill from the
 *      custom-field definition (for `custom:*` refs) or leave as-is.
 */
export function compileColumns(args: CompileColumnsArgs): ColumnSpec[] {
  const { view, customFieldDefs, fallback } = args;
  if (!view || view.columns.length === 0) return fallback;
  const customByKey = new Map(
    customFieldDefs.map((f) => [f.field_key, f.label]),
  );
  return view.columns
    .filter((c) => {
      if (!isCustomFieldRef(c.field)) return true;
      const k = customFieldKey(c.field);
      return customByKey.has(k);
    })
    .map((c) => {
      if (c.label) return c;
      if (isCustomFieldRef(c.field)) {
        const k = customFieldKey(c.field);
        return { ...c, label: customByKey.get(k) ?? k };
      }
      return c;
    });
}
