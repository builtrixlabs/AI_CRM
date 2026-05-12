import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users,
  ShieldCheck,
  Plug,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export const dynamic = "force-dynamic";

type Tile = {
  href: string;
  Icon: LucideIcon;
  title: string;
  subtitle: string;
};

const TILES: Tile[] = [
  {
    href: "/settings/users",
    Icon: Users,
    title: "Users",
    subtitle: "Invite + manage team members",
  },
  {
    href: "/settings/roles",
    Icon: ShieldCheck,
    title: "Roles",
    subtitle: "Customize role-level permission overrides",
  },
  {
    href: "/settings/integrations",
    Icon: Plug,
    title: "Integrations",
    subtitle: "Email, WhatsApp, telephony, SMS — per-org config",
  },
  {
    href: "/admin",
    Icon: SettingsIcon,
    title: "Admin cockpit",
    subtitle: "Subscription, billing, app access, onboarding",
  },
];

export default async function SettingsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace, members, roles, and integrations. Account-level
          controls (billing, onboarding, app access) live in the{" "}
          <Link href="/admin" className="underline">
            admin cockpit
          </Link>
          .
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {TILES.map((tile) => (
          <SettingTile key={tile.href} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function SettingTile({ tile }: { tile: Tile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={tile.href}
      className="rounded-xl border p-4 transition-colors hover:border-[color:var(--amethyst-500)]/60"
      aria-label={tile.title}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" style={{ color: "var(--amethyst-700)" }} />
        <div>
          <div className="font-medium">{tile.title}</div>
          <div className="text-xs text-muted-foreground">{tile.subtitle}</div>
        </div>
      </div>
    </Link>
  );
}
