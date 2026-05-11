import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFieldsBlock } from "@/components/canvas/custom-fields-block";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getContactCanvas } from "@/lib/contacts/api";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function ContactCanvasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("contacts:view")) redirect("/403");

  const { id } = await props.params;
  const data = await getContactCanvas(id, user.org_id);
  if (!data) notFound();

  const { contact, leads, deals, site_visits, activities } = data;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-2">
        <Link
          href="/dashboard/contacts"
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← Back to contacts
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {contact.label}
          </h1>
          <span className="text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-700">
            Contact
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Contact info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Email" value={contact.email} />
            <Row label="Phone" value={contact.phone} mono />
            <Row label="Primary address" value={contact.primary_address} />
            <Row
              label="Created"
              value={dateFmt.format(new Date(contact.created_at))}
            />
            <Row
              label="Updated"
              value={dateFmt.format(new Date(contact.updated_at))}
            />
            <CustomFieldsBlock
              node={{
                organization_id: contact.organization_id,
                data: contact.data,
              }}
              entityType="contact"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Linked leads ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-sm text-neutral-500">No leads linked.</p>
            ) : (
              <ul className="divide-y">
                {leads.map((l) => (
                  <li
                    key={l.id}
                    className="py-2 flex items-center justify-between"
                  >
                    <Link
                      href={`/dashboard/leads/${l.id}`}
                      className="text-sm hover:underline"
                    >
                      {l.label}
                    </Link>
                    <span className="text-xs text-neutral-500">
                      {l.state ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Linked deals ({deals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <p className="text-sm text-neutral-500">No deals linked.</p>
          ) : (
            <ul className="divide-y">
              {deals.map((d) => (
                <li
                  key={d.id}
                  className="py-2 flex items-center justify-between"
                >
                  <Link
                    href={`/dashboard/deals/${d.id}`}
                    className="text-sm hover:underline"
                  >
                    {d.label}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {d.stage ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Site visits ({site_visits.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {site_visits.length === 0 ? (
            <p className="text-sm text-neutral-500">No site visits.</p>
          ) : (
            <ul className="divide-y">
              {site_visits.map((s) => (
                <li
                  key={s.id}
                  className="py-2 flex items-center justify-between"
                >
                  <span className="text-sm">{s.label}</span>
                  <span className="text-xs text-neutral-500">
                    {s.state ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Activity stream ({activities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.slice(0, 25).map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-xs text-neutral-500">
                    · {dateFmt.format(new Date(a.created_at))} · {a.created_via}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row(props: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{props.label}</p>
      <p className={props.mono ? "font-mono tabular-nums" : ""}>
        {props.value ?? "—"}
      </p>
    </div>
  );
}
