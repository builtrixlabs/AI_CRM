import { z } from "zod";

// Mirrors nodes.node_type CHECK + custom_field_definitions.node_type CHECK.
// Kept in sync with src/lib/customfields/types.ts CUSTOM_FIELD_NODE_TYPES.
export const VIEW_ENTITY_TYPES = [
  "lead",
  "deal",
  "contact",
  "property",
  "unit",
  "site_visit",
  "document",
  "activity",
  "note",
  "call",
] as const;
export type ViewEntityType = (typeof VIEW_ENTITY_TYPES)[number];

export const VIEW_SCOPES = ["org", "user"] as const;
export type ViewScope = (typeof VIEW_SCOPES)[number];

// Filter operator catalog. Each op declares which kinds it applies to and
// whether it expects a value (and of what shape). The compiler in
// compile-filters.ts consumes this catalog directly — never duplicate the
// operator list in another module.
export const FILTER_OPS = [
  // text-like kinds
  "eq",
  "neq",
  "contains",
  "starts_with",
  "is_empty",
  "is_not_empty",
  // number
  "lt",
  "gt",
  "between",
  // date
  "today",
  "this_week",
  "this_month",
  "last_n_days",
  "before",
  "after",
  // boolean
  "is_true",
  "is_false",
  // select / multi
  "in",
  "not_in",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

// Field-kind catalog used by the filter compiler. `string|email|phone` collapse
// to text behavior; `select` uses options; `builtin_state` is the entity's
// state-machine enum (compiler decides the allowed values from the entity).
export const FILTER_FIELD_KINDS = [
  "string",
  "email",
  "phone",
  "number",
  "date",
  "boolean",
  "select",
  "builtin_state",
] as const;
export type FilterFieldKind = (typeof FILTER_FIELD_KINDS)[number];

// One filter clause. `field` is either a built-in field key on the entity
// table (e.g. "state", "created_at", "label") or a custom-field key prefixed
// with "custom:" (e.g. "custom:budget_inr"). The compiler routes accordingly.
export const filterClauseSchema = z
  .object({
    field: z.string().min(1).max(80),
    kind: z.enum(FILTER_FIELD_KINDS),
    op: z.enum(FILTER_OPS),
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const needsValue: FilterOp[] = [
      "eq",
      "neq",
      "contains",
      "starts_with",
      "lt",
      "gt",
      "between",
      "last_n_days",
      "before",
      "after",
      "in",
      "not_in",
    ];
    if (needsValue.includes(c.op) && c.value === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `op '${c.op}' requires a value`,
      });
    }
    if (c.op === "between" && (!Array.isArray(c.value) || c.value.length !== 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "op 'between' requires a [low, high] tuple",
      });
    }
    if ((c.op === "in" || c.op === "not_in") && !Array.isArray(c.value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `op '${c.op}' requires an array value`,
      });
    }
  });
export type FilterClause = z.infer<typeof filterClauseSchema>;

export const columnSpecSchema = z
  .object({
    field: z.string().min(1).max(80),
    label: z.string().max(80).optional(),
    width: z.number().int().min(40).max(800).optional(),
  })
  .strict();
export type ColumnSpec = z.infer<typeof columnSpecSchema>;

export const sortClauseSchema = z
  .object({
    field: z.string().min(1).max(80),
    dir: z.enum(["asc", "desc"]),
  })
  .strict();
export type SortClause = z.infer<typeof sortClauseSchema>;

export const viewBodySchema = z
  .object({
    filters: z.array(filterClauseSchema).max(20).default([]),
    columns: z.array(columnSpecSchema).max(40).default([]),
    sort: sortClauseSchema.nullable().default(null),
  })
  .strict();
export type ViewBody = z.infer<typeof viewBodySchema>;

export const createViewInputSchema = z
  .object({
    entity_type: z.enum(VIEW_ENTITY_TYPES),
    scope: z.enum(VIEW_SCOPES),
    name: z.string().min(1).max(80),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z][a-z0-9-]{0,49}$/, "lowercase, kebab-case, starts with a letter"),
    filters: z.array(filterClauseSchema).max(20).default([]),
    columns: z.array(columnSpecSchema).max(40).default([]),
    sort: sortClauseSchema.nullable().default(null),
  })
  .strict();
export type CreateViewInput = z.infer<typeof createViewInputSchema>;

export const updateViewInputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80).optional(),
    filters: z.array(filterClauseSchema).max(20).optional(),
    columns: z.array(columnSpecSchema).max(40).optional(),
    sort: sortClauseSchema.nullable().optional(),
  })
  .strict();
export type UpdateViewInput = z.infer<typeof updateViewInputSchema>;

export const deleteViewInputSchema = z
  .object({
    id: z.string().uuid(),
    reason: z.string().min(3).max(200).optional(),
  })
  .strict();
export type DeleteViewInput = z.infer<typeof deleteViewInputSchema>;

export const setDefaultViewInputSchema = z
  .object({
    view_id: z.string().uuid(),
  })
  .strict();
export type SetDefaultViewInput = z.infer<typeof setDefaultViewInputSchema>;

export type CustomViewRow = {
  id: string;
  organization_id: string;
  entity_type: ViewEntityType;
  scope: ViewScope;
  owner_id: string | null;
  name: string;
  slug: string;
  filters: FilterClause[];
  columns: ColumnSpec[];
  sort: SortClause | null;
  created_at: string;
  deleted_at: string | null;
};

export const ENTITY_LABEL: Record<ViewEntityType, string> = {
  lead: "Leads",
  deal: "Deals",
  contact: "Contacts",
  property: "Properties",
  unit: "Units",
  site_visit: "Site visits",
  document: "Documents",
  activity: "Activities",
  note: "Notes",
  call: "Calls",
};

export class CustomViewError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "not_found"
      | "duplicate_slug"
      | "invalid"
      | "forbidden"
      | "rpc_failed",
  ) {
    super(message);
    this.name = "CustomViewError";
  }
}

export const CUSTOM_FIELD_FIELD_PREFIX = "custom:" as const;
export function isCustomFieldRef(field: string): boolean {
  return field.startsWith(CUSTOM_FIELD_FIELD_PREFIX);
}
export function customFieldKey(field: string): string {
  return field.startsWith(CUSTOM_FIELD_FIELD_PREFIX)
    ? field.slice(CUSTOM_FIELD_FIELD_PREFIX.length)
    : field;
}
