import { Badge } from "@/components/ui/badge";
import type { CanvasLead } from "@/lib/canvas/types";
import { listFieldsForType } from "@/lib/customfields/admin";
import type {
  CustomFieldKind,
  CustomFieldRow,
} from "@/lib/customfields/types";
import { FieldValue, type FieldKind } from "./field-renderers";

/**
 * D-020 — Server Component that fetches the org's custom field
 * definitions for the lead node type and renders them under the canvas
 * field block. Empty / undefined values hide the row entirely
 * (progressive disclosure, same as core fields).
 */

const KIND_TO_RENDERER: Record<CustomFieldKind, FieldKind> = {
  string: "string",
  number: "number",
  email: "email",
  phone: "phone",
  date: "string",
  boolean: "string",
  select: "string",
};

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function displayValue(value: unknown, kind: CustomFieldKind): unknown {
  if (kind === "boolean") {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === "true") return "Yes";
    if (value === "false") return "No";
  }
  if (kind === "date" && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return value;
}

export async function CustomFieldsBlock({ lead }: { lead: CanvasLead }) {
  if (!lead.organization_id) return null;
  const definitions = await listFieldsForType(lead.organization_id, "lead");
  if (definitions.length === 0) return null;

  type LeadDataWithCustom = {
    custom?: Record<string, unknown>;
  };
  const data = lead.data as unknown as LeadDataWithCustom;
  const custom = (data?.custom ?? {}) as Record<string, unknown>;

  const visible = definitions.filter(
    (def: CustomFieldRow) => !isEmpty(custom[def.field_key]) || def.required,
  );
  if (visible.length === 0) return null;

  return (
    <div data-testid="custom-fields-block" className="space-y-2 pt-2">
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
        Custom fields
      </h3>
      <dl className="space-y-1">
        {visible.map((def) => {
          const raw = custom[def.field_key];
          const empty = isEmpty(raw);
          return (
            <div
              key={def.id}
              className="grid grid-cols-[140px_1fr] items-baseline gap-2 text-sm"
              data-testid={`custom-field-${def.field_key}`}
            >
              <dt className="text-neutral-600">
                {def.label}
                {def.required && (
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    *
                  </Badge>
                )}
              </dt>
              <dd className="font-mono text-xs">
                {empty ? (
                  <span className="text-neutral-400">—</span>
                ) : (
                  <FieldValue
                    kind={KIND_TO_RENDERER[def.kind]}
                    value={displayValue(raw, def.kind)}
                  />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
