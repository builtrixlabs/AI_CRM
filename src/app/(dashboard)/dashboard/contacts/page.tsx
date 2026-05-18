import { DashboardListPage } from "@/components/views/dashboard-list-page";

export const dynamic = "force-dynamic";

export default async function ContactsListPage(props: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <DashboardListPage
      config={{
        entity_type: "contact",
        title: "Contacts",
        view_permission: "contacts:view",
        base_path: "/dashboard/contacts",
        detail_path: (id) => `/dashboard/contacts/${id}`,
        default_columns: [
          { field: "label", label: "Contact" },
          { field: "phone", label: "Phone" },
          { field: "email", label: "Email" },
          { field: "created_at", label: "Created" },
        ],
      }}
      searchParams={sp}
    />
  );
}
