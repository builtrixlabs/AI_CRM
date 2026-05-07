import { z } from "zod";

export const DOCUMENT_KINDS = [
  "offer_letter",
  "booking_form",
  "agreement_to_sell",
  "allotment_letter",
  "registration_ack",
  "id_proof",
  "other",
] as const;

export const documentSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    signed_url: z.string().url(),
    version: z.number().int().min(1),
    related_node_id: z.string().uuid().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type DocumentData = z.infer<typeof documentSchema>;
export default documentSchema;
