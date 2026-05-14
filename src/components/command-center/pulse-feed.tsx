"use client";

import { useEffect, useState } from "react";
import {
  Phone,
  MessageSquare,
  Mic,
  Mail,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CcPulseActivity } from "@/lib/command-center/data";

const CHANNEL_ICON: Record<string, LucideIcon> = {
  voice: Phone,
  whatsapp: MessageSquare,
  voice_note: Mic,
  email: Mail,
};

function iconFor(a: CcPulseActivity): LucideIcon {
  return (a.channel && CHANNEL_ICON[a.channel]) || ActivityIcon;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type RealtimeNodeRow = {
  id: string;
  organization_id: string;
  node_type: string;
  label: string;
  created_via: string;
  created_at: string;
  data: Record<string, unknown> | null;
};

function isActivityRow(v: unknown): v is RealtimeNodeRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.organization_id === "string" &&
    r.node_type === "activity"
  );
}

/**
 * D-605 — live org activity pulse. Server-fetched seed + a realtime
 * subscription to `nodes` INSERT (node_type=activity). The org id is
 * re-checked on every payload (defense-in-depth, per the canvas hook).
 */
export function PulseFeed({
  initialActivities,
  orgId,
  client,
}: {
  initialActivities: CcPulseActivity[];
  orgId: string;
  /** Inject for tests. Defaults to the browser Supabase client. */
  client?: SupabaseClient;
}) {
  const [activities, setActivities] =
    useState<CcPulseActivity[]>(initialActivities);
  const now = Date.now();

  useEffect(() => {
    const supabase = client ?? createSupabaseBrowserClient();
    const channel = supabase.channel(`org:pulse:${orgId}`);
    (
      channel as unknown as {
        on: (
          event: "postgres_changes",
          filter: {
            event: string;
            schema: string;
            table: string;
            filter: string;
          },
          cb: (payload: { new?: unknown }) => void,
        ) => unknown;
      }
    ).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "nodes",
        filter: "node_type=eq.activity",
      },
      (payload) => {
        const c = payload?.new;
        if (!isActivityRow(c)) return;
        if (c.organization_id !== orgId) return;
        setActivities((prev) => {
          if (prev.some((a) => a.id === c.id)) return prev;
          return [
            {
              id: c.id,
              label: c.label,
              created_via: c.created_via,
              created_at: c.created_at,
              channel:
                typeof c.data?.channel === "string" ? c.data.channel : null,
            },
            ...prev,
          ].slice(0, 20);
        });
      },
    );
    const sub = channel.subscribe();
    return () => {
      try {
        sub.unsubscribe();
      } catch {
        // best-effort cleanup
      }
    };
  }, [orgId, client]);

  return (
    <section
      className="cc-card flex h-full flex-col overflow-hidden"
      data-testid="cc-pulse-feed"
    >
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">01 · The Pulse</div>
          <h2 className="mt-1 text-base font-semibold">Recent activity</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="cc-live-dot" aria-hidden="true" />
          <span>live</span>
        </div>
      </header>
      <ul
        aria-label="Live activity feed"
        className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {activities.length === 0 ? (
          <li
            className="px-3 py-6 text-center text-sm text-muted-foreground"
            data-testid="cc-pulse-empty"
          >
            No activity yet.
          </li>
        ) : (
          activities.map((a) => {
            const Icon = iconFor(a);
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.02]"
                data-testid="cc-pulse-row"
              >
                <span className="cc-sigil-violet flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="truncate text-sm font-medium">
                      {a.label}
                    </div>
                    <div className="cc-eyebrow cc-eyebrow-soft shrink-0">
                      {ago(a.created_at, now)}
                    </div>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.channel ? `${a.channel} · ` : ""}
                    {a.created_via}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
