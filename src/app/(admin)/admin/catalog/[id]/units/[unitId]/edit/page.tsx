import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import {
  isForwardTransition,
  STATUS_ORDER,
} from "@/lib/catalog/transitions";
import type { UnitStatus } from "@/lib/catalog/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { saveUnitAction } from "./actions";

export const dynamic = "force-dynamic";

type UnitRow = {
  id: string;
  state: string | null;
  data: {
    unit_no?: string;
    bhk?: number;
    floor?: number | null;
    price?: number;
    carpet_area_sqft?: number | null;
    property_id?: string;
  } | null;
  updated_at: string;
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  held: "Held",
  booked: "Booked",
  sold: "Sold",
};

export default async function EditUnitPage(props: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("units:edit")) {
    redirect("/403");
  }
  const has_override = BASE_ROLE_PERMS[user.profile.base_role].has(
    "catalog:admin_override"
  );

  const { id: property_id, unitId } = await props.params;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("nodes")
    .select("id, state, data, updated_at")
    .eq("organization_id", user.org_id)
    .eq("node_type", "unit")
    .eq("id", unitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) notFound();

  const unit = data as UnitRow;
  const d = unit.data ?? {};
  const curStatus: UnitStatus = (
    STATUS_ORDER as ReadonlyArray<string>
  ).includes(unit.state ?? "")
    ? (unit.state as UnitStatus)
    : "available";

  async function save(formData: FormData): Promise<void> {
    "use server";
    await saveUnitAction(property_id, unitId, formData);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="space-y-1">
        <Link
          href={`/admin/catalog/${property_id}`}
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← Back to property
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit unit {d.unit_no ?? ""}
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unit attributes</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={save} className="space-y-4">
            <input
              type="hidden"
              name="expected_updated_at"
              value={unit.updated_at}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="unit_no">Unit number</Label>
                <Input
                  id="unit_no"
                  name="unit_no"
                  defaultValue={d.unit_no ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bhk">BHK</Label>
                <Input
                  id="bhk"
                  name="bhk"
                  type="number"
                  min="0"
                  max="20"
                  defaultValue={d.bhk ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor">Floor</Label>
                <Input
                  id="floor"
                  name="floor"
                  type="number"
                  defaultValue={d.floor ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="carpet_area_sqft">Carpet (sqft)</Label>
                <Input
                  id="carpet_area_sqft"
                  name="carpet_area_sqft"
                  type="number"
                  min="0"
                  defaultValue={d.carpet_area_sqft ?? ""}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="price">Price (₹)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  defaultValue={d.price ?? ""}
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={curStatus}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {STATUS_ORDER.map((s) => {
                  const isForward = isForwardTransition(curStatus, s);
                  const disabled = !isForward && !has_override;
                  return (
                    <option key={s} value={s} disabled={disabled}>
                      {STATUS_LABEL[s]}
                      {disabled ? " (admin override required)" : ""}
                    </option>
                  );
                })}
              </select>
              {!has_override && (
                <p className="text-xs text-neutral-500">
                  Forward-only by default. Backward moves require an
                  org-admin with the catalog override permission.
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit">Save</Button>
              <Link
                href={`/admin/catalog/${property_id}`}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-neutral-300 px-3 py-2 hover:bg-neutral-50"
              >
                Cancel
              </Link>
            </div>
            <p className="text-xs text-neutral-500">
              Optimistic-locked: if a colleague edits this unit while you
              had the form open, your save will be rejected — re-open the
              page and re-apply your changes.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
