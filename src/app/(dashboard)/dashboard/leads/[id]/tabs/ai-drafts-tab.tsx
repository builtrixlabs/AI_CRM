"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DraftCard,
  type DraftCardItem,
} from "@/components/agents/draft-card";
import { SiteVisitBookingCard } from "@/components/agents/site-visit-booking-card";
import type { PendingDraft } from "@/lib/canvas/types";
import {
  approveDraftOnLeadAction,
  rejectDraftOnLeadAction,
  confirmSiteVisitOnLeadAction,
} from "../actions/draft-actions";

/**
 * v6.2.1 — AI Drafts tab on the lead canvas (the headline new surface).
 *
 * Server-side, the page passes in `drafts` (the pending queue rows for this
 * lead) and `canApprove`. Client-side, we subscribe to INSERT events on
 * agent_approval_queue filtered by lead_id and call router.refresh() on
 * each new row so the server re-fetches and the badge increments.
 *
 * canApprove drives the DraftCard's button state:
 *   - true  → buttons enabled, owner / manager / admin can approve.
 *   - false → buttons disabled with tooltip; non-owner reps can SEE the
 *             draft but cannot dispatch it.
 *
 * Empty state echoes the spec mock: a soft prompt explaining how drafts
 * appear (Voice IQ analysis → AI suggestion → here).
 */

export type AiDraftsTabProps = {
  leadId: string;
  drafts: PendingDraft[];
  /** True when the current user can dispatch a draft on this lead. */
  canApprove: boolean;
  /** Optional tooltip to show on disabled buttons when canApprove is false. */
  disabledReason?: string;
  /** Inject for tests. */
  client?: SupabaseClient;
  /** When true, skip the realtime subscription (tests / SSR-only renders). */
  realtimePaused?: boolean;
};

function asDraftCardItem(d: PendingDraft, leadLabel: string): DraftCardItem {
  return {
    id: d.id,
    lead_id: d.lead_id,
    lead_label: leadLabel,
    channel: d.channel,
    draft_body: d.draft_body,
    agent_kind: d.agent_kind,
    created_at: d.created_at,
    attachments: d.attachments,
    error: d.error,
  };
}

export function AiDraftsTab({
  leadId,
  drafts,
  canApprove,
  disabledReason,
  client,
  realtimePaused = false,
}: AiDraftsTabProps) {
  const router = useRouter();

  useEffect(() => {
    if (realtimePaused) return;
    const supabase = client ?? createSupabaseBrowserClient();
    const channel = supabase.channel(`drafts:${leadId}`);

    (channel as unknown as {
      on: (
        event: "postgres_changes",
        filter: {
          event: string;
          schema: string;
          table: string;
          filter: string;
        },
        cb: (payload: unknown) => void,
      ) => unknown;
    }).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "agent_approval_queue",
        filter: `lead_id=eq.${leadId}`,
      },
      () => router.refresh(),
    );

    const subscription = channel.subscribe();
    return () => {
      try {
        (subscription as unknown as { unsubscribe?: () => void })
          .unsubscribe?.();
      } catch {
        // best-effort cleanup
      }
    };
  }, [leadId, realtimePaused, client, router]);

  if (drafts.length === 0) {
    return (
      <div
        className="flex min-h-[200px] items-center justify-center rounded border border-dashed border-neutral-300 p-6"
        data-testid="ai-drafts-tab-empty"
      >
        <div className="max-w-md text-center text-sm text-neutral-600">
          <p className="font-medium text-neutral-800">No AI drafts pending.</p>
          <p className="mt-1">
            When Voice IQ analyzes your next call with this customer,
            AI-suggested actions (brochures, site visits, follow-ups) will
            appear here for you to approve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="ai-drafts-tab">
      {drafts.map((d) => {
        if (d.agent_kind === "site_visit_booking") {
          return (
            <SiteVisitBookingCard
              key={d.id}
              queueId={d.id}
              leadId={d.lead_id}
              leadLabel={`Lead ${d.lead_id.slice(0, 8)}`}
              canSubmit={canApprove}
              disabledReason={disabledReason}
              onSubmit={confirmSiteVisitOnLeadAction}
            />
          );
        }
        return (
          <DraftCard
            key={d.id}
            item={asDraftCardItem(d, `Lead ${d.lead_id.slice(0, 8)}`)}
            canApprove={canApprove}
            onApprove={approveDraftOnLeadAction}
            onReject={rejectDraftOnLeadAction}
            disabledReason={disabledReason}
          />
        );
      })}
    </div>
  );
}
