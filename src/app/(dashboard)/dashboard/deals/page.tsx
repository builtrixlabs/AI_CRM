import { DashboardListPage } from "@/components/views/dashboard-list-page";

export const dynamic = "force-dynamic";

export default async function DealsListPage(props: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <DashboardListPage
      config={{
        entity_type: "deal",
        title: "Deals",
        view_permission: "deals:view",
        base_path: "/dashboard/deals",
        detail_path: (id) => `/dashboard/deals/${id}`,
        default_columns: [
          { field: "label", label: "Deal" },
          { field: "state", label: "Stage" },
          { field: "created_at", label: "Created" },
        ],
      }}
      searchParams={sp}
    />
  );
}
