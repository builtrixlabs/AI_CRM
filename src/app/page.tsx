// Root page. Middleware redirects authed users to their landing surface
// based on base_role; this component only renders when an unauthed user
// somehow lands here directly (e.g. before middleware or in dev).
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <h1 className="text-3xl font-semibold">Builtrix CRM</h1>
      <p className="mt-4 text-neutral-600">
        Multi-tenant AI-native CRM for Indian real-estate sales.
      </p>
      <p className="mt-8">
        <a href="/auth/sign-in" className="underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
