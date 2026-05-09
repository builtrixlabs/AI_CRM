import { z } from "zod";

export const CUSTOM_FIELD_NODE_TYPES = [
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
export type CustomFieldNodeType = (typeof CUSTOM_FIELD_NODE_TYPES)[number];

export const CUSTOM_FIELD_KINDS = [
  "string",
  "number",
  "email",
  "phone",
  "date",
  "boolean",
  "select",
] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export const NODE_TYPE_LABEL: Record<CustomFieldNodeType, string> = {
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

export const FIELD_KIND_LABEL: Record<CustomFieldKind, string> = {
  string: "Text",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  boolean: "Yes / No",
  select: "Select (options)",
};

export const createFieldInputSchema = z
  .object({
    node_type: z.enum(CUSTOM_FIELD_NODE_TYPES),
    field_key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "lowercase, snake_case, starts with a letter"),
    label: z.string().min(1).max(120),
    kind: z.enum(CUSTOM_FIELD_KINDS),
    required: z.boolean().default(false),
    options: z.array(z.string().min(1).max(80)).max(40).default([]),
    sort_order: z.number().int().min(0).max(9999).default(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "select" && (!value.options || value.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Select kind requires at least one option",
      });
    }
  });
export type CreateFieldInput = z.infer<typeof createFieldInputSchema>;

export const updateFieldInputSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(120).optional(),
    required: z.boolean().optional(),
    options: z.array(z.string().min(1).max(80)).max(40).optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .strict();
export type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;

export const deleteFieldInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();
export type DeleteFieldInput = z.infer<typeof deleteFieldInputSchema>;

export type CustomFieldRow = {
  id: string;
  organization_id: string;
  node_type: CustomFieldNodeType;
  field_key: string;
  label: string;
  kind: CustomFieldKind;
  required: boolean;
  options: string[];
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
};

export class CustomFieldError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_found" | "duplicate_key" | "invalid",
  ) {
    super(message);
    this.name = "CustomFieldError";
  }
}
