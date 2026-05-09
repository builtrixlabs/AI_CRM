import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

const NAV = [
  { href: "/cp/submit", label: "Submit lead" },
  { href: "/cp/submissions", label: "My submissions" },
];

export default async function CpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const displayName =
    user?.profile.display_name ?? user?.user.email ?? "channel_partner";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-emerald-900 text-emerald-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/cp" className="font-semibold tracking-tight">
            Builtrix · Channel Partner Portal
          </Link>
          <div className="flex items-center gap-3">
            <span
              className="text-xs text-emerald-200"
              title={user?.user.email ?? ""}
            >
              {displayName}
            </span>
            <SignOutButton
              className="rounded-md border border-emerald-700 bg-emerald-800 px-3 py-1 text-xs hover:bg-emerald-700"
              redirectTo="/auth/sign-in"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl flex-1 w-full px-6 py-8 grid grid-cols-[200px_1fr] gap-8">
        <nav className="text-sm">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-3 py-2 rounded-md hover:bg-neutral-100 text-neutral-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <p className="text-xs text-neutral-500 px-3">
            Submit qualified leads. Track your submissions. Real-estate
            channel partners are first-class.
          </p>
        </nav>
        <main>{children}</main>
      </div>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-neutral-500">
          Builtrix Labs · CP portal · D-221
        </div>
      </footer>
    </div>
  );
}
