// /platform — super_admin home (placeholder for D-001).
// Full surfaces (orgs CRUD, subscriptions, analytics, audit) ship in D-004.
export default function PlatformHomePage() {
  return (
    <main className="mx-auto max-w-3xl p-12">
      <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-amber-900">
        You have <strong>zero</strong> access to operational data inside any
        organization. This surface is for platform administration only.
      </div>
      <h1 className="mt-8 text-3xl font-semibold">Platform</h1>
      <p className="mt-4 text-neutral-600">Coming next directive — D-004 super_admin surfaces.</p>
    </main>
  );
}
