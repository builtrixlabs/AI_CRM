/**
 * Client-safe canvas helpers.
 *
 * Lives in its own module (no server-only imports) so it can be bundled
 * into Client Components that need to format the Realtime channel name
 * without dragging in `next/headers`.
 */

/** Default activity-row fetch limit; baseline 112 documents this. */
export const DEFAULT_ACTIVITY_LIMIT = 50;

/** Edge types that connect an activity to its lead/deal. */
export const ACTIVITY_EDGE_TYPES = [
  "mentioned_in",
  "related_to",
  "belongs_to",
] as const;

/**
 * Format a Supabase Realtime channel name for a lead's canvas.
 * Locked into baseline 112: `canvas:lead:<lead_id>`.
 */
export function leadCanvasChannel(lead_id: string): string {
  return `canvas:lead:${lead_id}`;
}
