"use client";

import {
  DraftCard,
  type DraftCardAttachment,
  type DraftCardItem,
} from "@/components/agents/draft-card";
import { SiteVisitBookingCard } from "@/components/agents/site-visit-booking-card";
import {
  approveQueueItemAction,
  rejectQueueItemAction,
} from "./actions";

/** Re-exported for callers of the admin route + existing tests that imported
 *  these types from this file before the v6.2.1 extraction. */
export type QueueAttachment = DraftCardAttachment;
export type QueueItemRow = DraftCardItem;

/**
 * Admin-route dispatcher: hands the queue row to the right shared card and
 * wires admin server actions. `agents:view_activity` gating happens upstream
 * in page.tsx + the action gate, so `canApprove` is unconditionally true
 * here — anyone who reached this component is permitted.
 */
export function QueueItem({ item }: { item: QueueItemRow }) {
  if (item.agent_kind === "site_visit_booking") {
    return (
      <SiteVisitBookingCard
        queueId={item.id}
        leadId={item.lead_id}
        leadLabel={item.lead_label}
      />
    );
  }

  return (
    <DraftCard
      item={item}
      canApprove={true}
      onApprove={approveQueueItemAction}
      onReject={rejectQueueItemAction}
    />
  );
}
