export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <h1 className="text-3xl font-semibold">Access forbidden</h1>
      <p className="mt-4 text-neutral-600">
        Your account does not have access to this resource. If you believe this
        is in error, contact your organization administrator.
      </p>
    </main>
  );
}
