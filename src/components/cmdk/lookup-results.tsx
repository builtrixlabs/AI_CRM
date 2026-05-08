"use client";
import type { SearchLeadResult } from "@/app/(dashboard)/dashboard/_actions/searchLeads";
import { Badge } from "@/components/ui/badge";

type Props = {
  query: string;
  results: SearchLeadResult[];
  loading: boolean;
  onSelect: (result: SearchLeadResult) => void;
};

export function LookupResults({ query, results, loading, onSelect }: Props) {
  if (query.trim().length === 0) {
    return (
      <p
        data-testid="lookup-empty"
        className="px-4 py-3 text-sm text-neutral-500"
      >
        Type to search leads…
      </p>
    );
  }
  if (loading) {
    return (
      <p
        data-testid="lookup-loading"
        className="px-4 py-3 text-sm text-neutral-500"
      >
        Searching…
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p
        data-testid="lookup-no-results"
        className="px-4 py-3 text-sm text-neutral-500"
      >
        No leads match &quot;{query}&quot;.
      </p>
    );
  }
  return (
    <ul data-testid="lookup-results" role="listbox" className="max-h-72 overflow-y-auto">
      {results.map((r) => (
        <li key={r.id} role="option" aria-selected="false">
          <button
            type="button"
            data-testid={`lookup-result-${r.id}`}
            onClick={() => onSelect(r)}
            className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-neutral-100"
          >
            <span className="flex flex-col">
              <span className="font-medium text-neutral-900">{r.label}</span>
              {r.phone ? (
                <span className="text-xs text-neutral-500">{r.phone}</span>
              ) : null}
            </span>
            <Badge variant="secondary">{r.state}</Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
