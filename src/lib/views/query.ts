// D-413 / query — apply a compiled view to a nodes query and return rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compileFilters, compileSort } from "./compile-filters";
import type { CustomViewRow, ViewEntityType } from "./types";

export type NodeListRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  node_type: string;
  label: string;
  state: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ListByViewArgs = {
  organization_id: string;
  entity_type: ViewEntityType;
  view: CustomViewRow | null;
  /** custom field keys present for (org, entity_type), passed to the compiler. */
  available_custom_field_keys: ReadonlySet<string>;
  page?: number;
  page_size?: number;
  /** Optional ad-hoc URL-state filter merge (applied AFTER the view's clauses). */
  ad_hoc_filters?: CustomViewRow["filters"];
  ad_hoc_sort?: CustomViewRow["sort"];
  /** Injectable for deterministic date-relative tests. */
  now?: Date;
};

export type ListByViewResult = {
  rows: NodeListRow[];
  total: number;
  warnings: { field: string; reason: string }[];
  page: number;
  page_size: number;
};

const DEFAULT_PAGE_SIZE = 50;

export async function listNodesByView(
  args: ListByViewArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ListByViewResult> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, args.page_size ?? DEFAULT_PAGE_SIZE));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const baseFilters = args.view?.filters ?? [];
  const adHoc = args.ad_hoc_filters ?? [];
  const merged = [...baseFilters, ...adHoc];

  const { ops, warnings } = compileFilters(
    merged,
    args.available_custom_field_keys,
    args.now ?? new Date(),
  );

  let q = client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, node_type, label, state, data, created_at, updated_at",
      { count: "exact" },
    )
    .eq("organization_id", args.organization_id)
    .eq("node_type", args.entity_type)
    .is("deleted_at", null);

  for (const op of ops) {
    switch (op.method) {
      case "eq":
        q = q.eq(op.column, op.value);
        break;
      case "neq":
        q = q.neq(op.column, op.value);
        break;
      case "ilike":
        q = q.ilike(op.column, op.value);
        break;
      case "is_null":
        q = q.is(op.column, null);
        break;
      case "is_not_null":
        q = q.not(op.column, "is", null);
        break;
      case "lt":
        q = q.lt(op.column, op.value as never);
        break;
      case "gt":
        q = q.gt(op.column, op.value as never);
        break;
      case "lte":
        q = q.lte(op.column, op.value as never);
        break;
      case "gte":
        q = q.gte(op.column, op.value as never);
        break;
      case "in":
        q = q.in(op.column, op.value as never[]);
        break;
      case "not_in":
        q = q.not(op.column, "in", `(${(op.value as unknown[]).map(formatInValue).join(",")})`);
        break;
    }
  }

  const sort = compileSort(args.ad_hoc_sort ?? args.view?.sort ?? null) ?? {
    column: "created_at",
    ascending: false,
  };
  q = q.order(sort.column, { ascending: sort.ascending });
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) {
    return {
      rows: [],
      total: 0,
      warnings: [
        ...warnings.map((w) => ({ field: w.field, reason: w.reason as string })),
        { field: "_query", reason: error.message },
      ],
      page,
      page_size: pageSize,
    };
  }

  return {
    rows: (data ?? []) as NodeListRow[],
    total: count ?? 0,
    warnings: warnings.map((w) => ({ field: w.field, reason: w.reason as string })),
    page,
    page_size: pageSize,
  };
}

function formatInValue(v: unknown): string {
  // PostgREST `not.in.(a,b,c)` value list — strings need double-quote escaping.
  const s = String(v);
  if (/[,()\s"]/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}
