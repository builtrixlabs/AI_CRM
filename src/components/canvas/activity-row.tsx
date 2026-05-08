"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import type { CanvasActivity } from "@/lib/canvas/types";
import { TierBadge } from "./tier-badge";

type Props = {
  activity: CanvasActivity;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ActivityRow({ activity }: Props) {
  const isAI = activity.agent_tier !== null;
  const summary =
    typeof activity.data?.summary === "string"
      ? (activity.data.summary as string)
      : typeof activity.data?.text === "string"
        ? (activity.data.text as string)
        : null;

  return (
    <motion.li
      data-testid="activity-row"
      data-actor={isAI ? "agent" : "human"}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-1 border-b border-neutral-200 py-3 last:border-b-0"
    >
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <time dateTime={activity.created_at}>{formatTime(activity.created_at)}</time>
        {isAI ? (
          <>
            <span aria-hidden>· 🤖</span>
            <TierBadge tier={activity.agent_tier} />
            <Link
              href={`/admin/audit?record_id=${activity.id}`}
              className="ml-auto underline"
            >
              audit
            </Link>
          </>
        ) : null}
      </div>
      <p className="text-sm font-medium text-neutral-900">{activity.label}</p>
      {summary ? <p className="text-sm text-neutral-600">{summary}</p> : null}
    </motion.li>
  );
}
