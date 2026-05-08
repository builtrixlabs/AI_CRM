import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadDialog } from "@/components/dashboard/new-lead-dialog";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  const canCreate = user
    ? resolveForUser(user).has("leads:create")
    : false;

  return (
    <main className="mx-auto max-w-3xl p-12">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        {canCreate ? <NewLeadDialog /> : null}
      </header>
      <p className="mt-4 text-sm">
        <Link href="/dashboard/leads/demo" className="underline">
          View demo lead canvas →
        </Link>
      </p>
    </main>
  );
}
