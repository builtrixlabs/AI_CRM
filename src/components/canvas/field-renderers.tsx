import { Badge } from "@/components/ui/badge";

export type FieldKind =
  | "string"
  | "email"
  | "phone"
  | "number"
  | "enum"
  | "score";

export type FieldDescriptor = {
  key: string;
  label: string;
  kind: FieldKind;
  primary: boolean;
};

/**
 * Lead canvas fields. Locked into baseline 112; future custom fields
 * (D-112) plug in via `data.custom`.
 */
export const LEAD_FIELDS: readonly FieldDescriptor[] = [
  { key: "phone", label: "Phone", kind: "phone", primary: true },
  { key: "source", label: "Source", kind: "enum", primary: true },
  { key: "intent_score", label: "Intent score", kind: "score", primary: true },
  { key: "email", label: "Email", kind: "email", primary: false },
  { key: "notes", label: "Notes", kind: "string", primary: false },
];

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function scoreClass(score: number): string {
  if (score >= 70) return "bg-rose-100 text-rose-900";
  if (score >= 40) return "bg-amber-100 text-amber-900";
  return "bg-neutral-200 text-neutral-800";
}

export function FieldValue(props: {
  kind: FieldKind;
  value: unknown;
}) {
  const { kind, value } = props;
  if (isEmpty(value)) return null;

  switch (kind) {
    case "email": {
      const email = String(value);
      return (
        <a
          data-testid="field-value"
          data-kind="email"
          href={`mailto:${email}`}
          className="text-blue-700 underline"
        >
          {email}
        </a>
      );
    }
    case "phone": {
      const phone = String(value);
      return (
        <a
          data-testid="field-value"
          data-kind="phone"
          href={`tel:${phone}`}
          className="text-blue-700 underline"
        >
          {phone}
        </a>
      );
    }
    case "number": {
      return (
        <span
          data-testid="field-value"
          data-kind="number"
          className="text-right tabular-nums"
        >
          {String(value)}
        </span>
      );
    }
    case "enum": {
      return (
        <Badge data-testid="field-value" data-kind="enum" variant="secondary">
          {String(value)}
        </Badge>
      );
    }
    case "score": {
      const num = Number(value);
      const safe = Number.isFinite(num) ? num : 0;
      return (
        <Badge
          data-testid="field-value"
          data-kind="score"
          className={`${scoreClass(safe)} border-transparent`}
        >
          {safe}
        </Badge>
      );
    }
    case "string":
    default: {
      return (
        <span
          data-testid="field-value"
          data-kind="string"
          className="text-neutral-900"
        >
          {String(value)}
        </span>
      );
    }
  }
}

export function FieldRow(props: {
  field: FieldDescriptor;
  value: unknown;
}) {
  const { field, value } = props;
  if (isEmpty(value)) return null;
  return (
    <div
      data-testid="field-row"
      data-key={field.key}
      className="flex items-center justify-between gap-4 py-1.5"
    >
      <span className="text-xs uppercase tracking-wide text-neutral-500">
        {field.label}
      </span>
      <FieldValue kind={field.kind} value={value} />
    </div>
  );
}
