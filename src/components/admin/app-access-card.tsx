import Link from "next/link";
import { Boxes, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AppEntry = {
  slug: string;
  name: string;
  description: string;
  status: "active" | "coming_soon";
  href?: string;
  Icon?: LucideIcon;
};

type Props = {
  apps: AppEntry[];
};

/**
 * D-501 — App-access cross-product subscription tiles.
 *
 * Replaces the inline "App access" stub on /admin with a real tile grid
 * showing each Builtrix product the org is subscribed to (or that's
 * coming soon). Active tiles link to the product's home; coming-soon
 * tiles render as dim, non-interactive.
 *
 * The data is intentionally a prop — the page composes the list from
 * org subscription state + a static "coming soon" catalog. Cross-app
 * entitlements wire into this in a follow-up directive.
 */
export function AppAccessCard({ apps }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {apps.map((app) => (
        <AppTile key={app.slug} app={app} />
      ))}
    </div>
  );
}

function AppTile({ app }: { app: AppEntry }) {
  const Icon = app.Icon ?? Boxes;
  const inner = (
    <div
      className={[
        "rounded-xl border p-4 transition-colors",
        app.status === "coming_soon"
          ? "border-dashed opacity-60"
          : "hover:border-[color:var(--amethyst-500)]/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between pb-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon
            className="h-5 w-5"
            style={{ color: "var(--amethyst-700)" }}
          />
          {app.name}
        </div>
        {app.status === "active" ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Coming soon
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{app.description}</p>
    </div>
  );
  if (app.href && app.status === "active") {
    return (
      <Link href={app.href} aria-label={app.name}>
        {inner}
      </Link>
    );
  }
  return inner;
}
