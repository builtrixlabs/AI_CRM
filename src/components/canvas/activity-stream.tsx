"use client";
import { AnimatePresence } from "framer-motion";
import type { CanvasActivity } from "@/lib/canvas/types";
import { useLeadActivityStream, type RealtimeArgs } from "./realtime";
import { ActivityRow } from "./activity-row";

type Props = {
  lead_id: string;
  initial: CanvasActivity[];
  currentOrgId: string;
  currentWorkspaceId?: string;
  paused?: boolean;
  client?: RealtimeArgs["client"];
};

export function ActivityStream(props: Props) {
  const activities = useLeadActivityStream(props);

  return (
    <div data-testid="activity-stream" className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        Activity Stream
      </h2>
      {activities.length === 0 ? (
        <p data-testid="activity-empty" className="text-sm text-neutral-500">
          No activity yet.
        </p>
      ) : (
        <ul data-testid="activity-list">
          <AnimatePresence initial={false}>
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
