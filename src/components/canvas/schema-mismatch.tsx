import Link from "next/link";

export function SchemaMismatch({ recordId }: { recordId: string }) {
  return (
    <div
      role="alert"
      data-testid="schema-mismatch"
      className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">Schema mismatch</p>
      <p className="mt-1">
        This record's data does not match the current lead schema.{" "}
        <Link
          href={`/admin/audit?record_id=${recordId}`}
          className="underline"
        >
          See audit log
        </Link>
        .
      </p>
    </div>
  );
}
