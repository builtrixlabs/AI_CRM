import { z } from "zod";

export const ACTIVITY_KINDS = [
  "whatsapp",
  "email",
  "note",
  "task",
  "meeting",
] as const;

export const activitySchema = z
  .object({
    subject_node_id: z.string().uuid(),
    kind: z.enum(ACTIVITY_KINDS),
    summary: z.string().min(1),
    body: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ActivityData = z.infer<typeof activitySchema>;
export default activitySchema;
