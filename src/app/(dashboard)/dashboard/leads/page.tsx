import { DashboardListPage } from "@/components/views/dashboard-list-page";
import { cannedLeadFilters } from "@/lib/leads/canned-views";

export const dynamic = "force-dynamic";

export default async function LeadsListPage(props: {
  searchParams: Promise<{ view?: string; page?: string; canned?: string }>;
}) {
  const sp = await props.searchParams;
  // D-617 — a Cmd+K `?canned=<slug>` shortcut applies a built-in filter
  // on top of any selected view.
  const adHocFilters = sp.canned
    ? (cannedLeadFilters(sp.canned) ?? undefined)
    : undefined;

  return (
    <DashboardListPage
      config={{
        entity_type: "lead",
        title: "Leads",
        view_permission: "leads:view",
        base_path: "/dashboard/leads",
        detail_path: (id) => `/dashboard/leads/${id}`,
        default_columns: [
          { field: "label", label: "Lead" },
          { field: "state", label: "State" },
          { field: "created_at", label: "Created" },
        ],
      }}
      searchParams={sp}
      adHocFilters={adHocFilters}
    />
  );
}
