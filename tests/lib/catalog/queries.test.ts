import { describe, expect, it, vi } from "vitest";
import {
  getPropertyDetail,
  listProperties,
} from "@/lib/catalog/queries";

const ORG = "11111111-2222-4333-8444-555555555555";
const PROP_A = "22222222-3333-4444-8555-666666666666";
const PROP_B = "33333333-4444-4555-8666-777777777777";

type PropRow = {
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

type UnitRow = {
  id: string;
  state: string | null;
  data: {
    property_id?: string;
    unit_no?: string;
    bhk?: number;
    floor?: number;
    price?: number;
    carpet_area_sqft?: number;
  };
};

function makeListClient(opts: {
  properties: PropRow[];
  units: UnitRow[];
}) {
  let firstQueryResolved = false;
  return {
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => {
          firstQueryResolved = true;
          return Promise.resolve({ data: opts.properties, error: null });
        }),
        in: vi.fn(() =>
          Promise.resolve({
            data: firstQueryResolved ? opts.units : opts.units,
            error: null,
          })
        ),
      };
      return chain;
    }),
  };
}

function makeDetailClient(opts: {
  property: PropRow | null;
  units: UnitRow[];
}) {
  let call = 0;
  return {
    from: vi.fn(() => {
      const idx = call++;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() =>
          Promise.resolve({ data: opts.units, error: null })
        ),
        maybeSingle: vi.fn(() =>
          Promise.resolve({ data: opts.property, error: null })
        ),
      };
      return chain;
    }),
  };
}

describe("listProperties", () => {
  it("tallies units per property by state", async () => {
    const client = makeListClient({
      properties: [
        {
          id: PROP_A,
          state: "available",
          data: {
            name: "Skyline Towers",
            city: "Bengaluru",
            rera_number: "PRM/KA/RERA/1251/308/PR/200405/001234",
          },
        },
        {
          id: PROP_B,
          state: "available",
          data: { name: "Riverside Heights", city: "Pune" },
        },
      ],
      units: [
        { id: "u1", state: "available", data: { property_id: PROP_A } },
        { id: "u2", state: "booked", data: { property_id: PROP_A } },
        { id: "u3", state: "held", data: { property_id: PROP_A } },
        { id: "u4", state: "sold", data: { property_id: PROP_B } },
      ],
    });
    const rows = await listProperties(ORG, {}, client as never);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.id === PROP_A)!;
    expect(a.total_units).toBe(3);
    expect(a.by_state).toEqual({ available: 1, held: 1, booked: 1, sold: 0 });
    expect(a.rera_number).toBeTruthy();
    const b = rows.find((r) => r.id === PROP_B)!;
    expect(b.by_state.sold).toBe(1);
  });

  it("filters by city via the eq() chain", async () => {
    const client = makeListClient({
      properties: [
        {
          id: PROP_A,
          state: "available",
          data: { name: "Skyline", city: "Bengaluru" },
        },
      ],
      units: [],
    });
    const rows = await listProperties(ORG, { city: "Bengaluru" }, client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe("Bengaluru");
  });

  it("post-filter by status keeps only properties with units in that status", async () => {
    const client = makeListClient({
      properties: [
        { id: PROP_A, state: null, data: { name: "A", city: "X" } },
        { id: PROP_B, state: null, data: { name: "B", city: "X" } },
      ],
      units: [
        { id: "u1", state: "available", data: { property_id: PROP_A } },
        { id: "u2", state: "sold", data: { property_id: PROP_B } },
      ],
    });
    const rows = await listProperties(
      ORG,
      { status: "available" },
      client as never
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PROP_A);
  });

  it("returns empty array when no properties exist", async () => {
    const client = makeListClient({ properties: [], units: [] });
    const rows = await listProperties(ORG, {}, client as never);
    expect(rows).toEqual([]);
  });
});

describe("getPropertyDetail", () => {
  it("returns property + sorted units", async () => {
    const client = makeDetailClient({
      property: {
        id: PROP_A,
        state: "available",
        data: { name: "Skyline", city: "Bengaluru" },
      },
      units: [
        {
          id: "u3",
          state: "available",
          data: {
            property_id: PROP_A,
            unit_no: "C-301",
            bhk: 3,
            floor: 3,
            price: 7500000,
          },
        },
        {
          id: "u1",
          state: "booked",
          data: {
            property_id: PROP_A,
            unit_no: "A-101",
            bhk: 2,
            floor: 1,
            price: 5500000,
          },
        },
      ],
    });
    const detail = await getPropertyDetail(ORG, PROP_A, client as never);
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.units[0].unit_no).toBe("A-101");
    expect(detail.units[1].unit_no).toBe("C-301");
    expect(detail.total_units).toBe(2);
    expect(detail.by_state.booked).toBe(1);
  });

  it("returns null for cross-tenant property", async () => {
    const client = makeDetailClient({ property: null, units: [] });
    const detail = await getPropertyDetail(ORG, PROP_A, client as never);
    expect(detail).toBeNull();
  });

  it("treats unknown unit state as 'available'", async () => {
    const client = makeDetailClient({
      property: {
        id: PROP_A,
        state: "available",
        data: { name: "X", city: "Y" },
      },
      units: [
        {
          id: "u1",
          state: "weird_state",
          data: { property_id: PROP_A, unit_no: "A-1", bhk: 2, price: 1 },
        },
      ],
    });
    const detail = await getPropertyDetail(ORG, PROP_A, client as never);
    expect(detail?.by_state.available).toBe(1);
  });
});
