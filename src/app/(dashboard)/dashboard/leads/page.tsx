import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listFieldsForType } from "@/lib/customfields/admin";
import {
  getViewBySlug,
  listNodesByView,
  listViewsForType,
  type ColumnSpec,
  type CustomViewRow,
  type NodeListRow,
  isCustomFieldRef,
  customFieldKey,
} from "@/lib/views";
import { ViewSelector } from "@/components/views/view-selector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const DEFAULT_COLUMNS: ColumnSpec[] = [
  { field: "label", label: "Lead" },
  { field: "state", label: "State" },
  { field: "created_at", label: "Created" },
];

export default async function LeadsListPage(props: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { view: viewSlugRaw, page: pageRaw } = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return (
      <main className="mx-auto max-w-5xl p-12">
        <p className="text-sm text-neutral-600">
          Your account is not yet linked to an organization. Contact your admin.
        </p>
      </main>
    );
  }
  const perms = resolveForUser(user);
  if (!perms.has("leads:view")) redirect("/403");

  const orgId = user.org_id;
  const profileId = user.user.id;

  // Available views + custom fields for the lead entity in this org.
  const [views, customFieldDefs] = await Promise.all([
    listViewsForType(orgId, "lead", profileId),
    listFieldsForType(orgId, "lead"),
  ]);
  const availableCustomFieldKeys = new Set(
    customFieldDefs.map((f) => f.field_key),
  );

  // Resolve the current view:
  // 1. Explicit ?view=<slug> wins.
  // 2. Else fall back to user's view_defaults.lead (if set + readable).
  // 3. Else null → system default applies (created_at desc, default columns).
  let resolved: CustomViewRow | null = null;
  if (typeof viewSlugRaw === "string" && viewSlugRaw.length > 0) {
    resolved = await getViewBySlug(orgId, "lead", viewSlugRaw, profileId);
  } else {
    const defaultId = user.profile.view_defaults?.lead as string | undefined;
    if (defaultId) {
      const found = views.find((v) => v.id === defaultId);
      resolved = found ?? null;
    }
  }

  const columns = pickColumns(resolved, customFieldDefs);
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);

  const { rows, total, warnings, page_size } = await listNodesByView({
    organization_id: orgId,
    entity_type: "lead",
    view: resolved,
    available_custom_field_keys: availableCustomFieldKeys,
    page,
    page_size: 50,
  });

  const totalPages = Math.max(1, Math.ceil(total / page_size));
  const currentSlug = resolved?.slug ?? null;
  const showSavedBadge = resolved ? `Showing: ${resolved.name}` : null;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          {showSavedBadge && (
            <p className="mt-1 text-xs text-neutral-500">{showSavedBadge}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ViewSelector
            views={views}
            currentSlug={currentSlug}
            basePath="/dashboard/leads"
          />
          {perms.has("views:customize") ? (
            <Link
              href="/admin/views"
              className="text-xs text-neutral-600 underline hover:text-neutral-900"
            >
              Manage views
            </Link>
          ) : null}
        </div>
      </header>

      {warnings.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"
        >
          Some filters in this view could not be applied:{" "}
          {warnings.map((w) => `${w.field} (${w.reason})`).join(", ")}.
        </div>
      )}

      <section className="mt-6 rounded-md border border-neutral-200 bg-white">
        <Table data-testid="leads-list-table">
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.field}>{c.label ?? c.field}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-sm text-neutral-500"
                >
                  No leads match this view.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-testid={`leads-row-${row.id}`}>
                  {columns.map((c) => (
                    <TableCell key={c.field}>
                      {renderCell(c.field, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <footer className="mt-4 flex items-center justify-between text-xs text-neutral-600">
        <span>
          {total} total · page {page} of {totalPages}
        </span>
        <Pager
          basePath="/dashboard/leads"
          page={page}
          totalPages={totalPages}
          slug={currentSlug}
        />
      </footer>
    </main>
  );
}

function pickColumns(
  view: CustomViewRow | null,
  customFieldDefs: { field_key: string; label: string }[],
): ColumnSpec[] {
  if (!view || view.columns.length === 0) return DEFAULT_COLUMNS;
  const customByKey = new Map(customFieldDefs.map((f) => [f.field_key, f.label]));
  return view.columns
    .filter((c) => {
      if (!isCustomFieldRef(c.field)) return true;
      const k = customFieldKey(c.field);
      return customByKey.has(k);
    })
    .map((c) => {
      if (c.label) return c;
      if (isCustomFieldRef(c.field)) {
        const k = customFieldKey(c.field);
        return { ...c, label: customByKey.get(k) ?? k };
      }
      return c;
    });
}

function renderCell(field: string, row: NodeListRow): React.ReactNode {
  if (field === "label") {
    return (
      <Link
        href={`/dashboard/leads/${row.id}`}
        className="font-medium underline hover:text-neutral-900"
      >
        {row.label}
      </Link>
    );
  }
  if (field === "state") {
    return (
      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
        {row.state ?? "—"}
      </span>
    );
  }
  if (field === "created_at" || field === "updated_at") {
    const raw = field === "created_at" ? row.created_at : row.updated_at;
    return <time dateTime={raw}>{formatDate(raw)}</time>;
  }
  if (isCustomFieldRef(field)) {
    const k = customFieldKey(field);
    const custom = (row.data?.custom as Record<string, unknown> | undefined) ?? {};
    const v = custom[k];
    return v == null || v === "" ? "—" : String(v);
  }
  // Built-in attribute from data
  const v = (row.data as Record<string, unknown> | undefined)?.[field];
  return v == null || v === "" ? "—" : String(v);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function Pager(props: {
  basePath: string;
  page: number;
  totalPages: number;
  slug: string | null;
}) {
  const back = props.page > 1 ? linkHref(props, props.page - 1) : null;
  const fwd = props.page < props.totalPages ? linkHref(props, props.page + 1) : null;
  return (
    <nav className="flex items-center gap-3">
      {back ? (
        <Link href={back} className="underline">
          ← Prev
        </Link>
      ) : (
        <span className="text-neutral-400">← Prev</span>
      )}
      {fwd ? (
        <Link href={fwd} className="underline">
          Next →
        </Link>
      ) : (
        <span className="text-neutral-400">Next →</span>
      )}
    </nav>
  );
}

function linkHref(
  props: { basePath: string; slug: string | null },
  page: number,
): string {
  const params = new URLSearchParams();
  if (props.slug) params.set("view", props.slug);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${props.basePath}?${qs}` : props.basePath;
}
