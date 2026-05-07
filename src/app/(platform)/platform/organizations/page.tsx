import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { listOrgs } from "@/lib/platform/queries";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationsListPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const sp = await props.searchParams;
  const search = sp.q?.trim() ?? "";
  const orgs = await listOrgs({ search, limit: 50 }, user.user.id);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-neutral-600">
            All provisioned orgs across the platform. Click a row to drill in.
          </p>
        </div>
        <Link
          href="/platform/organizations/new"
          className="inline-flex items-center rounded-md bg-neutral-900 text-white text-sm px-4 py-2"
        >
          + New organization
        </Link>
      </header>

      <form className="max-w-md" action="/platform/organizations">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Search by name or slug…"
        />
      </form>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-neutral-500 py-8 text-center">
                  No organizations yet. Provision the first one →
                </TableCell>
              </TableRow>
            )}
            {orgs.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/platform/organizations/${o.id}`}
                    className="hover:underline"
                  >
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell className="text-neutral-600">{o.slug}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {o.plan_tier}
                  </Badge>
                </TableCell>
                <TableCell className="text-neutral-500 text-sm">
                  {new Date(o.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
