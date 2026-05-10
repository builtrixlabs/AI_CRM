import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { UserMenu } from "@/components/auth/user-menu";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-neutral-900 text-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Builtrix · Settings
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-xs text-neutral-300 hover:text-white"
            >
              ← Back to admin
            </Link>
            {user && (
              <UserMenu
                displayName={user.profile.display_name}
                email={user.user.email}
                settingsHref="/dashboard/settings"
                nameClassName="text-xs text-neutral-400"
                buttonClassName="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs hover:bg-neutral-700"
              />
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl flex-1 w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
