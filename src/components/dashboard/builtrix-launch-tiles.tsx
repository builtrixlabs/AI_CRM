"use client";

import Link from "next/link";
import {
  ChevronRight,
  Map,
  PhoneCall,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useNewLeadDialog } from "@/components/dashboard/new-lead-dialog-context";

type Tile = {
  key: string;
  title: string;
  sub: string;
  tone: "intelligence" | "copper" | "foundation";
  Icon: LucideIcon;
  href?: string;
  action?: "new-lead";
};

const AGENT_TILES: Tile[] = [
  {
    key: "new-lead",
    title: "Quick add lead",
    sub: "Capture from your last call",
    tone: "copper",
    Icon: UserPlus,
    action: "new-lead",
  },
  {
    key: "log-call",
    title: "Log a call",
    sub: "Phone, WhatsApp, or in-person",
    tone: "intelligence",
    Icon: PhoneCall,
    href: "/dashboard/deals",
  },
  {
    key: "schedule-visit",
    title: "Schedule site visit",
    sub: "Today / This week",
    tone: "foundation",
    Icon: Map,
    href: "/dashboard/site-visits",
  },
];

const MANAGER_TILES: Tile[] = [
  {
    key: "new-lead",
    title: "Assign a new lead",
    sub: "Pull from MIH or webform",
    tone: "copper",
    Icon: UserPlus,
    action: "new-lead",
  },
  {
    key: "pipeline",
    title: "Open pipeline view",
    sub: "Stage health · this week",
    tone: "intelligence",
    Icon: PhoneCall,
    href: "/admin/views",
  },
  {
    key: "site-visits",
    title: "Today's site visits",
    sub: "Coordinator board",
    tone: "foundation",
    Icon: Map,
    href: "/dashboard/site-visits",
  },
];

type Props = {
  variant: "agent" | "manager";
};

export function BuiltrixLaunchTiles({ variant }: Props) {
  const { openDialog } = useNewLeadDialog();
  const tiles = variant === "agent" ? AGENT_TILES : MANAGER_TILES;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.Icon;
        const body = (
          <>
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background:
                  tile.tone === "copper"
                    ? "rgba(30,58,95,0.10)"
                    : "rgba(255,255,255,0.18)",
              }}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="bcmd-launch-tile-title truncate">{tile.title}</div>
              <div className="bcmd-launch-tile-sub truncate">{tile.sub}</div>
            </div>
            <ChevronRight className="h-5 w-5 opacity-80" aria-hidden="true" />
          </>
        );
        if (tile.action === "new-lead") {
          return (
            <button
              key={tile.key}
              type="button"
              className="bcmd-launch-tile"
              data-tone={tile.tone}
              onClick={() => openDialog()}
              data-testid={`bcmd-launch-${tile.key}`}
            >
              {body}
            </button>
          );
        }
        return (
          <Link
            key={tile.key}
            href={tile.href ?? "/dashboard"}
            className="bcmd-launch-tile"
            data-tone={tile.tone}
            data-testid={`bcmd-launch-${tile.key}`}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}
