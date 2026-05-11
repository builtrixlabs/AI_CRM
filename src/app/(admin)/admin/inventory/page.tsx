import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listProjects } from "@/lib/inventory";
import { INVENTORY_STATES } from "@/lib/inventory/transitions";
import { UnitStateBadge } from "@/components/inventory/unit-state-badge";
import { inventoryFormAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage(props: {
  searchParams: Promise<{ city?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("properties:view")) redirect("/403");
  const canCreate = perms.has("properties:create");

  const sp = await props.searchParams;
  const city = sp.city?.trim() ?? "";
  const projects = await listProjects(user.org_id, {
    city: city.length > 0 ? city : null,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-neutral-600">
            Projects → Towers → Units. State machine: Available → Held →
            Blocked → Booked → Sold → Registered → Possessed.
          </p>
        </div>
      </header>

      <form className="flex items-end gap-3" action="/admin/inventory">
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
        <button
          type="submit"
          className="rounded-md bg-neutral-900 text-white text-sm px-4 py-2"
        >
          Filter
        </button>
      </form>

      {canCreate && (
        <Card>
          <CardContent className="py-4">
            <form
              action={inventoryFormAction}
              className="flex flex-wrap items-end gap-3"
              data-testid="create-project-form"
            >
              <input type="hidden" name="intent" value="create_project" />
              <div className="space-y-1">
                <label htmlFor="np-name" className="text-xs uppercase tracking-wide text-neutral-500">
                  New project — name
                </label>
                <Input
                  id="np-name"
                  name="name"
                  placeholder="Prestige Lakeside Habitat"
                  required
                  className="w-72"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="np-city" className="text-xs uppercase tracking-wide text-neutral-500">
                  City
                </label>
                <Input id="np-city" name="city" placeholder="Bengaluru" required className="w-56" />
              </div>
              <div className="space-y-1">
                <label htmlFor="np-rera" className="text-xs uppercase tracking-wide text-neutral-500">
                  RERA number
                </label>
                <Input id="np-rera" name="rera_number" placeholder="PRM/KA/RERA/…" className="w-72" />
              </div>
              <Button type="submit" data-testid="create-project-submit">
                + Create project
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-neutral-600">
            No projects match. {canCreate ? "Use the form above to add one." : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/admin/inventory/${p.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardContent className="space-y-3 py-5">
                  <div>
                    <h2 className="text-base font-semibold">{p.name}</h2>
                    <p className="text-sm text-neutral-600">{p.city}</p>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {p.tower_count} tower{p.tower_count === 1 ? "" : "s"} ·{" "}
                    {p.unit_count} unit{p.unit_count === 1 ? "" : "s"}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {INVENTORY_STATES.filter((s) => p.by_state[s] > 0).map(
                      (s) => (
                        <span key={s} className="inline-block">
                          <UnitStateBadge state={s} />
                          <span className="ml-1 text-[10px] text-neutral-500">
                            ×{p.by_state[s]}
                          </span>
                        </span>
                      ),
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
