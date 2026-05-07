import { z } from "zod";

export const contactSchema = z
  .object({
    phone: z.string().min(7).optional(),
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    relationship: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((d) => !!d.phone || !!d.email, {
    message: "contact requires at least one of phone or email",
  });

export type ContactData = z.infer<typeof contactSchema>;
export default contactSchema;
