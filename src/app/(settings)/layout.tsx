import Link from "next/link";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-neutral-900 text-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/admin" className="font-semibold tracking-tight">
            Builtrix · Settings
          </Link>
          <Link href="/admin" className="text-xs text-neutral-300 hover:text-white">
            ← Back to admin
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl flex-1 w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
