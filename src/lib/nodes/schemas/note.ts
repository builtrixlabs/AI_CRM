import { z } from "zod";

export const noteSchema = z
  .object({
    body: z.string().min(1),
    pinned: z.boolean().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type NoteData = z.infer<typeof noteSchema>;
export default noteSchema;
