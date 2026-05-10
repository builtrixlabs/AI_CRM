import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { savePropertyAction } from "./actions";

export const dynamic = "force-dynamic";

type PropertyRow = {
  id: string;
  data: {
    name?: string;
    city?: string;
    address?: string | null;
    rera_number?: string | null;
  } | null;
  updated_at: string;
};

export default async function EditPropertyPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("properties:edit")) {
    redirect("/403");
  }
  const { id } = await props.params;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("nodes")
    .select("id, data, updated_at")
    .eq("organization_id", user.org_id)
    .eq("node_type", "property")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) notFound();

  const prop = data as PropertyRow;
  const d = prop.data ?? {};

  async function save(formData: FormData): Promise<void> {
    "use server";
    await savePropertyAction(id, formData);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="space-y-1">
        <Link
          href={`/admin/catalog/${id}`}
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← Back to property
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit property
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Property attributes</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={save} className="space-y-4">
            <input
              type="hidden"
              name="expected_updated_at"
              value={prop.updated_at}
            />

            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={d.name ?? ""} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={d.city ?? ""} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={d.address ?? ""} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rera_number">RERA number</Label>
              <Input
                id="rera_number"
                name="rera_number"
                defaultValue={d.rera_number ?? ""}
                placeholder="e.g. P51800001234"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit">Save</Button>
              <Link
                href={`/admin/catalog/${id}`}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-neutral-300 px-3 py-2 hover:bg-neutral-50"
              >
                Cancel
              </Link>
            </div>
            <p className="text-xs text-neutral-500">
              Optimistic-locked: if someone else edits the same property in
              the meantime, you&apos;ll be asked to refresh and retry.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
