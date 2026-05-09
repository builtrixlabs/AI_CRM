import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listProperties, type UnitStatus } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";

const STATUSES: UnitStatus[] = ["available", "held", "booked", "sold"];

const STATUS_TINT: Record<UnitStatus, string> = {
  available: "bg-emerald-100 text-emerald-900",
  held: "bg-amber-100 text-amber-900",
  booked: "bg-blue-100 text-blue-900",
  sold: "bg-neutral-200 text-neutral-700",
};

function isUnitStatus(s: string | null): s is UnitStatus {
  return s !== null && (STATUSES as ReadonlyArray<string>).includes(s);
}

export default async function CatalogIndexPage(props: {
  searchParams: Promise<{ city?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  const role = user.profile.base_role;
  if (role !== "org_owner" && role !== "org_admin" && role !== "super_admin") {
    redirect("/admin");
  }

  const sp = await props.searchParams;
  const city = sp.city?.trim() ?? "";
  const status = isUnitStatus(sp.status ?? null) ? (sp.status as UnitStatus) : null;

  const properties = await listProperties(user.org_id, {
    city: city.length > 0 ? city : null,
    status,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-neutral-600">
          Properties + units across this org. Read-only — editing lands in V3.
        </p>
      </header>

      <form className="flex items-end gap-3" action="/admin/catalog">
        <div className="space-y-1">
          <label htmlFor="city" className="text-xs uppercase tracking-wide text-neutral-500">
            City
          </label>
          <Input
            id="city"
            name="city"
            defaultValue={city}
            placeholder="e.g. Bengaluru"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="text-xs uppercase tracking-wide text-neutral-500">
            Has units in
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-white px-3 py-1.5 text-sm"
          >
            <option value="">— any —</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 text-white text-sm px-4 py-2"
        >
          Filter
        </button>
      </form>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-neutral-600">
            No properties match. Catalog import surface lands in V3.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <Link key={p.id} href={`/admin/catalog/${p.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-neutral-600">{p.city}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.rera_number ? (
                      <Badge
                        variant="default"
                        className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
                        title={p.rera_number}
                      >
                        RERA · {p.rera_number.slice(-4)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">RERA missing</Badge>
                    )}
                    <span className="text-xs text-neutral-500">
                      {p.total_units} unit{p.total_units === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) =>
                      p.by_state[s] > 0 ? (
                        <span
                          key={s}
                          className={`text-xs px-2 py-0.5 rounded-md ${STATUS_TINT[s]}`}
                        >
                          {p.by_state[s]} {s}
                        </span>
                      ) : null
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
