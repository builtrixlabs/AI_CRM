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
import { resolveForUser } from "@/lib/auth/permissions";
import {
  getProjectDetail,
  getTowerDetail,
  listUnitsForTower,
} from "@/lib/inventory";
import { INVENTORY_STATES, type UnitState } from "@/lib/inventory/transitions";
import { UnitStateBadge } from "@/components/inventory/unit-state-badge";
import { UnitStateActionMenu } from "@/components/inventory/unit-state-action-menu";
import { inventoryFormAction } from "../../../actions";

export const dynamic = "force-dynamic";

function inr(amount: number | null): string {
  if (amount == null || amount === 0) return "—";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default async function AdminInventoryTowerPage(props: {
  params: Promise<{ projectId: string; towerId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("properties:view")) redirect("/403");
  const { projectId, towerId } = await props.params;

  const project = await getProjectDetail(user.org_id, projectId);
  if (!project) notFound();
  const tower = await getTowerDetail(user.org_id, towerId);
  if (!tower) notFound();
  if (tower.project_id !== projectId) notFound();

  const units = await listUnitsForTower(user.org_id, towerId);
  const hasOverride = perms.has("catalog:admin_override");

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/inventory/${projectId}`}
        className="text-sm text-neutral-600 hover:underline"
      >
        ← {project.name}
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{tower.name}</h1>
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Badge variant="outline">{tower.total_floors ?? "—"} floors</Badge>
          <Badge variant="outline">
            {tower.units_per_floor ?? "—"} units/floor
          </Badge>
          <span>{tower.unit_count} unit{tower.unit_count === 1 ? "" : "s"}</span>
        </div>
      </header>

      <section className="flex flex-wrap gap-1.5">
        {INVENTORY_STATES.filter((s) => tower.by_state[s] > 0).map((s) => (
          <span key={s} className="inline-block">
            <UnitStateBadge state={s} />
            <span className="ml-1 text-[11px] text-neutral-600">
              ×{tower.by_state[s]}
            </span>
          </span>
        ))}
      </section>

      {units.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-neutral-600">
            No units in this tower yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Carpet</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.id} data-testid={`tower-unit-row-${u.id}`}>
                  <TableCell className="font-mono text-sm">{u.unit_no}</TableCell>
                  <TableCell className="text-neutral-600">
                    {u.floor ?? "—"}
                  </TableCell>
                  <TableCell>{u.unit_type}</TableCell>
                  <TableCell className="text-neutral-600">
                    {u.carpet_area_sqft ? `${u.carpet_area_sqft} sqft` : "—"}
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
