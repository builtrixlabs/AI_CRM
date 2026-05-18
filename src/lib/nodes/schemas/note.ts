import { z } from "zod";

export const noteSchema = z
  .object({
    body: z.string().min(1),
    pinned: z.boolean().optional(),
    /**
     * v6.2.1 — Comments tab on the lead canvas. When a note belongs to a
     * single subject (the canonical case for the new Comments thread), the
     * note row's `data.lead_id` points back to the lead so the canvas can
     * fetch its thread without a join through edges. Optional to preserve
     * any existing untargeted-note callers.
     */
    lead_id: z.string().uuid().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type NoteData = z.infer<typeof noteSchema>;
export default noteSchema;
