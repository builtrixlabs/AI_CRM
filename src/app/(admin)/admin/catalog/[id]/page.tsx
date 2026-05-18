import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getPropertyDetail, type UnitStatus } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";

const STATUS_TINT: Record<UnitStatus, string> = {
  available: "bg-emerald-100 text-emerald-900",
  held: "bg-amber-100 text-amber-900",
  booked: "bg-blue-100 text-blue-900",
  sold: "bg-neutral-200 text-neutral-700",
};

function inr(amount: number): string {
  if (amount === 0) return "—";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default async function CatalogPropertyPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  const role = user.profile.base_role;
  if (role !== "org_owner" && role !== "org_admin" && role !== "super_admin") {
    redirect("/admin");
  }

  const { id } = await props.params;
  const detail = await getPropertyDetail(user.org_id, id);
  if (!detail) notFound();

  const canEditProperty = BASE_ROLE_PERMS[user.profile.base_role].has(
    "properties:edit"
  );
  const canEditUnit = BASE_ROLE_PERMS[user.profile.base_role].has(
    "units:edit"
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/catalog" className="text-sm text-neutral-600 hover:underline">
        ← All properties
      </Link>

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
            <p className="text-sm text-neutral-600">{detail.city}</p>
          </div>
          {canEditProperty && (
            <Link
              href={`/admin/catalog/${id}/edit`}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
            >
              Edit property
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {detail.rera_number ? (
            <Badge
              variant="default"
              className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
              title={detail.rera_number}
            >
              RERA · {detail.rera_number}
            </Badge>
          ) : (
            <Badge variant="outline">RERA missing</Badge>
          )}
          <span className="text-xs text-neutral-500">
            {detail.total_units} unit{detail.total_units === 1 ? "" : "s"}
          </span>
        </div>
        {detail.address && (
          <p className="text-sm text-neutral-700">{detail.address}</p>
        )}
      </header>

      <section className="flex flex-wrap gap-2">
        {(Object.entries(detail.by_state) as Array<[UnitStatus, number]>).map(
          ([s, n]) =>
            n > 0 ? (
              <span
                key={s}
                className={`text-xs px-2 py-0.5 rounded-md ${STATUS_TINT[s]}`}
              >
                {n} {s}
              </span>
            ) : null
        )}
      </section>

      <section>
        {detail.units.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-neutral-600">
              No units on file for this property.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>BHK</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Carpet</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  {canEditUnit && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-sm">{u.unit_no}</TableCell>
                    <TableCell>{u.bhk} BHK</TableCell>
                    <TableCell className="text-neutral-600">
                      {u.floor ?? "—"}
                    </TableCell>
                    <TableCell className="text-neutral-600">
                      {u.carpet_area_sqft ? `${u.carpet_area_sqft} sqft` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{inr(u.price)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_TINT[u.status]}`}>
                        {u.status}
                      </span>
                    </TableCell>
                    {canEditUnit && (
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/catalog/${id}/units/${u.id}/edit`}
                          className="text-xs text-blue-700 hover:underline"
                        >
                          Edit
                        </Link>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
