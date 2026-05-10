import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listViewsForType } from "@/lib/views/admin";
import {
  ENTITY_LABEL,
  VIEW_ENTITY_TYPES,
  type CustomViewRow,
  type ViewEntityType,
} from "@/lib/views/types";
import { viewsFormAction } from "./actions";
import { NewViewDialog } from "./new-view-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function AdminViewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("views:customize")) redirect("/403");

  const orgId = user.org_id;
  const profileId = user.user.id;

  const allViews = await Promise.all(
    VIEW_ENTITY_TYPES.map(async (et) => ({
      entity_type: et,
      views: (await listViewsForType(orgId, et, profileId)).filter(
        (v) => v.scope === "org",
      ),
    })),
  );

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Saved views</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Shared views are visible to everyone in this org. Each user can also
          save private views directly on a list page.
        </p>
      </header>

      <div className="mt-6 space-y-8">
        {allViews.map((group) => (
          <section key={group.entity_type}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">
                {ENTITY_LABEL[group.entity_type]}
              </h2>
              <NewViewDialog entityType={group.entity_type} />
            </div>
            <Separator className="my-3" />
            <ul
              data-testid={`views-list-${group.entity_type}`}
              className="space-y-2"
            >
              {group.views.length === 0 ? (
                <li className="text-sm text-neutral-500">
                  No shared views yet for {ENTITY_LABEL[group.entity_type]}.
                </li>
              ) : (
                group.views.map((v) => (
                  <ViewRow key={v.id} view={v} entityType={group.entity_type} />
                ))
              )}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function ViewRow(props: { view: CustomViewRow; entityType: ViewEntityType }) {
  const { view } = props;
  return (
    <li className="flex items-center justify-between rounded border border-neutral-200 px-4 py-2">
      <div>
        <div className="font-medium">{view.name}</div>
        <div className="text-xs text-neutral-500">
          slug:&nbsp;<code>{view.slug}</code> · {view.filters.length} filter(s),{" "}
          {view.columns.length} column(s)
        </div>
      </div>
      <form action={viewsFormAction}>
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={view.id} />
        <input type="hidden" name="reason" value="removed by org admin" />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          data-testid={`view-delete-${view.slug}`}
        >
          Delete
        </Button>
      </form>
    </li>
  );
}
