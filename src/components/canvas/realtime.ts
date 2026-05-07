"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasActivity } from "@/lib/canvas/types";
import { leadCanvasChannel } from "@/lib/canvas/api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SubscriptionLike = {
  unsubscribe: () => void;
};

export type RealtimeArgs = {
  lead_id: string;
  initial: CanvasActivity[];
  /**
   * Defense-in-depth: every message whose payload organization_id !==
   * currentOrgId is dropped before merge. Even though Supabase Realtime
   * already filters via RLS, we re-check on the client per Constitution II.
   */
  currentOrgId: string;
  /**
   * Defense-in-depth — workspace match. Optional because some surfaces
   * span the org's workspaces; the canvas always passes its own.
   */
  currentWorkspaceId?: string;
  /** When `true`, the hook short-circuits and never subscribes (demo mode). */
  paused?: boolean;
  /** Inject for tests. Defaults to the browser Supabase client. */
  client?: SupabaseClient;
};

function isCanvasActivity(value: unknown): value is CanvasActivity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.organization_id === "string" &&
    typeof v.workspace_id === "string"
  );
}

/**
 * Subscribe to leadCanvasChannel(lead_id) and merge new activity rows
 * into local state. Initial array is the server-fetched seed (≤ 50,
 * DESC by created_at). Cleans up on unmount.
 */
export function useLeadActivityStream(args: RealtimeArgs): CanvasActivity[] {
  const {
    lead_id,
    initial,
    currentOrgId,
    currentWorkspaceId,
    paused = false,
    client,
  } = args;
  const [activities, setActivities] = useState<CanvasActivity[]>(initial);

  useEffect(() => {
    if (paused) return;
    const supabase = client ?? createSupabaseBrowserClient();
    const channel = supabase.channel(leadCanvasChannel(lead_id));

    (channel as unknown as {
      on: (
        event: "postgres_changes",
        filter: { event: string; schema: string; table: string; filter: string },
        cb: (payload: { new?: unknown }) => void
      ) => unknown;
    }).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "nodes",
        filter: "node_type=eq.activity",
      },
      (payload) => {
        const candidate = payload?.new;
        if (!isCanvasActivity(candidate)) return;
        if (candidate.organization_id !== currentOrgId) return;
        if (currentWorkspaceId && candidate.workspace_id !== currentWorkspaceId) return;
        setActivities((prev) => {
          if (prev.some((a) => a.id === candidate.id)) return prev;
          return [candidate, ...prev];
        });
      }
    );

    const subscription: SubscriptionLike = channel.subscribe();
    return () => {
      try {
        subscription.unsubscribe();
      } catch {
        // best-effort cleanup
      }
    };
  }, [lead_id, paused, currentOrgId, currentWorkspaceId, client]);

  return activities;
}
