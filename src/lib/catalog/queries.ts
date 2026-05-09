import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type UnitStatus = "available" | "held" | "booked" | "sold";

export type PropertyRow = {
  id: string;
  name: string;
  city: string;
  rera_number: string | null;
  address: string | null;
  unit_count_declared: number | null;
  state: string | null;
  by_state: Record<UnitStatus, number>;
  total_units: number;
};

export type PropertyDetail = PropertyRow & {
  units: UnitRow[];
};

export type UnitRow = {
  id: string;
  unit_no: string;
  bhk: number;
  floor: number | null;
  price: number;
  carpet_area_sqft: number | null;
  status: UnitStatus;
};

export type ListPropertiesFilters = {
  city?: string | null;
  status?: UnitStatus | null;
};

const STATUSES: UnitStatus[] = ["available", "held", "booked", "sold"];

function emptyByState(): Record<UnitStatus, number> {
  return { available: 0, held: 0, booked: 0, sold: 0 };
}

export async function listProperties(
  organization_id: string,
  filters: ListPropertiesFilters = {},
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PropertyRow[]> {
  // 1) Properties scoped to org. Apply city filter before order/limit so the
  //    chain stays a single PostgrestFilterBuilder rather than splitting into
  //    a transformer that drops .eq().
  let propsQ = client
    .from("nodes")
    .select("id, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "property")
    .is("deleted_at", null);
  if (filters.city) {
    propsQ = propsQ.eq("data->>city", filters.city);
  }
  const propRes = await propsQ
    .order("created_at", { ascending: false })
    .limit(200);
  if (propRes.error || !propRes.data) return [];

  const props = (propRes.data as Array<{
    id: string;
    state: string | null;
    data: {
      name?: string;
      city?: string;
      rera_number?: string;
      address?: string;
      unit_count?: number;
    };
  }>).map((p) => ({
    id: p.id,
    name: p.data?.name ?? "—",
    city: p.data?.city ?? "—",
    rera_number: p.data?.rera_number ?? null,
    address: p.data?.address ?? null,
    unit_count_declared: typeof p.data?.unit_count === "number" ? p.data.unit_count : null,
    state: p.state,
    by_state: emptyByState(),
    total_units: 0,
  }));

  if (props.length === 0) return [];

  // 2) Units across these properties (single query — bounded by limit).
  const propIds = props.map((p) => p.id);
  const unitsRes = await client
    .from("nodes")
    .select("id, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .in("data->>property_id", propIds);

  if (!unitsRes.error && unitsRes.data) {
    for (const u of unitsRes.data as Array<{
      id: string;
      state: string | null;
      data: { property_id?: string };
    }>) {
      const owner = props.find((p) => p.id === u.data?.property_id);
      if (!owner) continue;
      const status = (
        STATUSES as ReadonlyArray<string>
      ).includes(u.state ?? "")
        ? (u.state as UnitStatus)
        : "available";
      owner.by_state[status] += 1;
      owner.total_units += 1;
    }
  }

  // 3) Apply status filter as a final pass (keeps property in the list iff it
  //    has ≥1 unit in the requested status).
  if (filters.status) {
    return props.filter((p) => p.by_state[filters.status as UnitStatus] > 0);
  }
  return props;
}

export async function getPropertyDetail(
  organization_id: string,
  property_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PropertyDetail | null> {
  const propRes = await client
    .from("nodes")
    .select("id, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "property")
    .eq("id", property_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (propRes.error || !propRes.data) return null;

  const p = propRes.data as {
    id: string;
    state: string | null;
    data: {
      name?: string;
      city?: string;
      rera_number?: string;
      address?: string;
      unit_count?: number;
    };
  };

  const unitsRes = await client
    .from("nodes")
    .select("id, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .eq("data->>property_id", property_id)
    .limit(200);

  const units: UnitRow[] = [];
  const by_state = emptyByState();
  if (!unitsRes.error && unitsRes.data) {
    for (const row of unitsRes.data as Array<{
      id: string;
      state: string | null;
      data: {
        unit_no?: string;
        bhk?: number;
        floor?: number;
        price?: number;
        carpet_area_sqft?: number;
      };
    }>) {
      const status = (STATUSES as ReadonlyArray<string>).includes(row.state ?? "")
        ? (row.state as UnitStatus)
        : "available";
      by_state[status] += 1;
      units.push({
        id: row.id,
        unit_no: row.data?.unit_no ?? "—",
        bhk: row.data?.bhk ?? 0,
        floor: row.data?.floor ?? null,
        price: typeof row.data?.price === "number" ? row.data.price : 0,
        carpet_area_sqft:
          typeof row.data?.carpet_area_sqft === "number"
            ? row.data.carpet_area_sqft
            : null,
        status,
      });
    }
  }
  units.sort((a, b) => a.unit_no.localeCompare(b.unit_no));

  return {
    id: p.id,
    name: p.data?.name ?? "—",
    city: p.data?.city ?? "—",
    rera_number: p.data?.rera_number ?? null,
    address: p.data?.address ?? null,
    unit_count_declared:
      typeof p.data?.unit_count === "number" ? p.data.unit_count : null,
    state: p.state,
    by_state,
    total_units: units.length,
    units,
  };
}
