import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { embeddingRefresh } from "@/lib/inngest/functions/embedding-refresh";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [embeddingRefresh],
});
