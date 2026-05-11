import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  getProjectDetail,
  listTowersForProject,
  listUnitsForProject,
} from "@/lib/inventory";
import { INVENTORY_STATES, type UnitState } from "@/lib/inventory/transitions";
import { UnitStateBadge } from "@/components/inventory/unit-state-badge";
import { UnitStateActionMenu } from "@/components/inventory/unit-state-action-menu";
import { UNIT_TYPES } from "@/lib/inventory/types";
import { inventoryFormAction } from "../actions";

export const dynamic = "force-dynamic";

function inr(amount: number | null): string {
  if (amount == null || amount === 0) return "—";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default async function AdminInventoryProjectPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("properties:view")) redirect("/403");
  const { projectId } = await props.params;

  const detail = await getProjectDetail(user.org_id, projectId);
  if (!detail) notFound();
  const towers = await listTowersForProject(user.org_id, projectId);
  const units = await listUnitsForProject(user.org_id, projectId);

  const canCreate = perms.has("properties:create");
  const canCreateUnit = perms.has("units:create");
  const hasOverride = perms.has("catalog:admin_override");

  return (
    <div className="space-y-6">
      <Link
        href="/admin/inventory"
        className="text-sm text-neutral-600 hover:underline"
      >
        ← All projects
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="text-sm text-neutral-600">{detail.city}</p>
        <div className="flex items-center gap-2 flex-wrap">
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
            {detail.tower_count} tower{detail.tower_count === 1 ? "" : "s"} ·{" "}
            {detail.unit_count} unit{detail.unit_count === 1 ? "" : "s"}
          </span>
        </div>
        {detail.address && (
          <p className="text-sm text-neutral-700">{detail.address}</p>
        )}
      </header>

      <section className="flex flex-wrap gap-1.5">
        {INVENTORY_STATES.filter((s) => detail.by_state[s] > 0).map((s) => (
          <span key={s} className="inline-block">
            <UnitStateBadge state={s} />
            <span className="ml-1 text-[11px] text-neutral-600">
              ×{detail.by_state[s]}
            </span>
          </span>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Towers</h2>
        </div>
        {canCreate && (
          <Card data-testid="create-tower-card">
            <CardContent className="py-4">
              <form action={inventoryFormAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="intent" value="create_tower" />
                <input type="hidden" name="project_id" value={projectId} />
                <div className="space-y-1">
                  <label htmlFor="nt-name" className="text-xs uppercase tracking-wide text-neutral-500">
                    Tower name
                  </label>
                  <Input id="nt-name" name="name" placeholder="Tower A" required className="w-48" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nt-floors" className="text-xs uppercase tracking-wide text-neutral-500">
                    Floors
                  </label>
                  <Input id="nt-floors" name="total_floors" type="number" min={0} max={300} className="w-24" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nt-upf" className="text-xs uppercase tracking-wide text-neutral-500">
                    Units per floor
                  </label>
                  <Input id="nt-upf" name="units_per_floor" type="number" min={0} max={60} className="w-32" />
                </div>
                <Button type="submit" data-testid="create-tower-submit">
                  + Add tower
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        {towers.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-neutral-600">
              No towers on this project yet.
              {canCreate ? " Use the form above to add one." : ""}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tower</TableHead>
                  <TableHead>Floors</TableHead>
                  <TableHead>Units / floor</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>State mix</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {towers.map((t) => (
                  <TableRow key={t.id} data-testid={`tower-row-${t.id}`}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.total_floors ?? "—"}</TableCell>
                    <TableCell>{t.units_per_floor ?? "—"}</TableCell>
                    <TableCell>{t.unit_count}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {INVENTORY_STATES.filter((s) => t.by_state[s] > 0).map(
                          (s) => (
                            <span key={s} className="inline-block">
                              <UnitStateBadge state={s} />
                              <span className="ml-1 text-[10px] text-neutral-500">
                                ×{t.by_state[s]}
                              </span>
                            </span>
                          ),
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/inventory/${projectId}/towers/${t.id}`}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        Open →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Units ({units.length})</h2>
        </div>

        {canCreateUnit && (
          <Card data-testid="create-unit-card">
            <CardContent className="py-4">
              <form action={inventoryFormAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="intent" value="create_unit" />
                <input type="hidden" name="project_id" value={projectId} />
                <div className="space-y-1">
                  <label htmlFor="nu-tower" className="text-xs uppercase tracking-wide text-neutral-500">
                    Tower
                  </label>
                  <select
                    id="nu-tower"
                    name="tower_id"
                    defaultValue=""
                    className="rounded border border-neutral-300 bg-white text-sm px-2 py-1.5 w-40"
                  >
                    <option value="">— none —</option>
                    {towers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="nu-unitno" className="text-xs uppercase tracking-wide text-neutral-500">
                    Unit no
                  </label>
                  <Input id="nu-unitno" name="unit_no" required className="w-28" placeholder="A-1201" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nu-floor" className="text-xs uppercase tracking-wide text-neutral-500">
                    Floor
                  </label>
                  <Input id="nu-floor" name="floor" type="number" min={-5} max={300} className="w-20" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nu-type" className="text-xs uppercase tracking-wide text-neutral-500">
                    Type
                  </label>
                  <select
                    id="nu-type"
                    name="unit_type"
                    defaultValue="2bhk"
                    className="rounded border border-neutral-300 bg-white text-sm px-2 py-1.5 w-28"
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="nu-carpet" className="text-xs uppercase tracking-wide text-neutral-500">
                    Carpet (sqft)
                  </label>
                  <Input id="nu-carpet" name="carpet_area_sqft" type="number" min={0} className="w-28" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="nu-base" className="text-xs uppercase tracking-wide text-neutral-500">
                    Base price ₹
                  </label>
                  <Input id="nu-base" name="base_price" type="number" min={0} className="w-32" />
                </div>
                <Button type="submit" data-testid="create-unit-submit">
                  + Add unit
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {units.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-neutral-600">
              No units on this project yet.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Tower</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Carpet</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => {
                  const towerName =
                    towers.find((t) => t.id === u.tower_id)?.name ?? "—";
                  return (
                    <TableRow key={u.id} data-testid={`unit-row-${u.id}`}>
                      <TableCell className="font-mono text-sm">
                        {u.unit_no}
                      </TableCell>
                      <TableCell>{towerName}</TableCell>
                      <TableCell className="text-neutral-600">
                        {u.floor ?? "—"}
                      </TableCell>
                      <TableCell>{u.unit_type}</TableCell>
                      <TableCell className="text-neutral-600">
                        {u.carpet_area_sqft
                          ? `${u.carpet_area_sqft} sqft`
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {inr(u.base_price)}
                      </TableCell>
                      <TableCell>
                        <UnitStateBadge
                          state={u.state as UnitState}
                          state_expires_at={u.state_expires_at}
                        />
                      </TableCell>
                      <TableCell>
                        <UnitStateActionMenu
                          unit_id={u.id}
                          current_state={u.state as UnitState}
                          caller_perms={perms}
                          has_override={hasOverride}
                          formAction={inventoryFormAction}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
