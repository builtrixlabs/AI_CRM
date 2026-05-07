"use client";
import { Badge } from "@/components/ui/badge";
import type { CanvasLead } from "@/lib/canvas/types";
import { LEAD_FIELDS, FieldRow } from "./field-renderers";

type Props = {
  lead: CanvasLead;
};

export function CanvasHeader({ lead }: Props) {
  const primary = LEAD_FIELDS.filter((f) => f.primary);
  const data = lead.data as unknown as Record<string, unknown>;

  return (
    <header data-testid="canvas-header" className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{lead.label}</h1>
        <Badge data-testid="state-badge" variant="secondary">
          {lead.state}
        </Badge>
      </div>
      <div className="space-y-1">
        {primary.map((field) => (
          <FieldRow key={field.key} field={field} value={data[field.key]} />
        ))}
      </div>
    </header>
  );
}
