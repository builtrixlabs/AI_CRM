import Link from "next/link";

// /dashboard — operational landing.
// Lead create / edit lands in D-007; D-006 ships the read-only Canvas with a
// public demo at /dashboard/leads/demo.
export default function DashboardHomePage() {
  return (
    <main className="mx-auto max-w-3xl p-12">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-neutral-600">
        Lead create + lifecycle land in D-007.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/dashboard/leads/demo" className="underline">
          View demo lead canvas →
        </Link>
      </p>
    </main>
  );
}
