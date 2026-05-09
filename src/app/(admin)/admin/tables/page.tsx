import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listFieldsForOrg } from "@/lib/customfields/admin";
import {
  CUSTOM_FIELD_NODE_TYPES,
  FIELD_KIND_LABEL,
  NODE_TYPE_LABEL,
  type CustomFieldNodeType,
  type CustomFieldRow,
} from "@/lib/customfields/types";
import { customFieldsFormAction } from "./actions";
import { NewFieldDialog } from "./new-field-dialog";

export const dynamic = "force-dynamic";

function FieldsSection({
  node_type,
  rows,
}: {
  node_type: CustomFieldNodeType;
  rows: CustomFieldRow[];
}) {
  return (
    <section
      className="space-y-3"
      data-testid={`fields-section-${node_type}`}
    >
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
            {NODE_TYPE_LABEL[node_type]}
          </h2>
          <p className="text-xs text-neutral-500">
            {rows.length === 0
              ? "No custom fields yet."
              : `${rows.length} field${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <NewFieldDialog node_type={node_type} />
      </div>

      {rows.length > 0 && (
        <div className="rounded-md border bg-white">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Key</th>
                <th className="px-3 py-2 text-left font-medium">Label</th>
                <th className="px-3 py-2 text-left font-medium">Kind</th>
                <th className="px-3 py-2 text-left font-medium">Required</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.field_key}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {FIELD_KIND_LABEL[row.kind]}
                    </Badge>
                    {row.kind === "select" && row.options.length > 0 && (
                      <span className="ml-2 text-xs text-neutral-500">
                        {row.options.length} option
                        {row.options.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.required ? (
                      <Badge variant="default" className="text-[10px]">
                        Required
                      </Badge>
                    ) : (
                      <span className="text-neutral-400">Optional</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={customFieldsFormAction}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="text-xs text-rose-700 hover:underline"
                        data-testid={`delete-field-${row.id}`}
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Delete custom field "${row.label}"? Existing data on the JSONB slot will remain but stop rendering.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminTablesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("tables:customize")) redirect("/403");

  const allFields = await listFieldsForOrg(user.org_id);
  const byType = new Map<CustomFieldNodeType, CustomFieldRow[]>();
  for (const f of allFields) {
    const list = byType.get(f.node_type) ?? [];
    list.push(f);
    byType.set(f.node_type, list);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tables &amp; fields
        </h1>
        <p className="text-sm text-neutral-600">
          Add custom fields per node type. Storage uses each node&apos;s reserved
          <code className="mx-1 px-1.5 py-0.5 bg-neutral-100 text-xs rounded">
            data.custom
          </code>
          JSONB slot. Lead canvas renders these under the existing field block.
        </p>
      </header>

      {CUSTOM_FIELD_NODE_TYPES.map((nt) => (
        <FieldsSection
          key={nt}
          node_type={nt}
          rows={byType.get(nt) ?? []}
        />
      ))}
    </div>
  );
}
