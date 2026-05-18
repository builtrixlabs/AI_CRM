"use client";

import type { CanvasDocument } from "@/lib/canvas/types";

/**
 * v6.2.1 — Documents tab: documents linked to this lead.
 *
 * Rows come from getLeadCanvasV2's document fetch (jsonb-filtered by
 * data.related_node_id). Includes brochures sent + uploaded contracts/IDs.
 * Click a row to open the signed URL in a new tab.
 */
export type DocumentsTabProps = {
  documents: CanvasDocument[];
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function kindLabel(kind: string | null): string {
  if (!kind) return "document";
  return kind.replace(/_/g, " ");
}

export function DocumentsTab({ documents }: DocumentsTabProps) {
  if (documents.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="documents-tab-empty"
      >
        No documents linked to this lead. Brochures sent + uploaded
        contracts / IDs will appear here.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="documents-tab">
      {documents.map((d) => (
        <li
          key={d.id}
          data-testid={`document-row-${d.id}`}
          className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">
              {d.label}
            </p>
            <p className="text-xs text-neutral-500">
              <span className="uppercase">{kindLabel(d.document_type)}</span>
              {" · "}
              <time dateTime={d.created_at}>{fmt(d.created_at)}</time>
            </p>
          </div>
          {d.storage_url && (
            <a
              href={d.storage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
              data-testid={`document-row-${d.id}-open`}
            >
              Open
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
