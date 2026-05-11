import { CommsError } from "../../types";
import type {
  EmailAdapter,
  EmailSendArgs,
  EmailSendResult,
  InboundEmailEvent,
} from "../types";

let counter = 0;
const nextId = () => `mock-email-${++counter}`;

type Recorded = EmailSendArgs & { provider_message_id: string; at: string };

export class MockEmailProvider implements EmailAdapter {
  readonly provider = "mock" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: false,
  };

  private outbox: Recorded[] = [];
  private inboundHandlers = new Set<
    (e: InboundEmailEvent) => void | Promise<void>
  >();

  async send(args: EmailSendArgs): Promise<EmailSendResult> {
    if (!args.to || !args.organization_id) {
      throw new CommsError("missing to/organization_id", "invalid_args");
    }
    if (args.kind === "templated" && !args.template_id) {
      throw new CommsError(
        "templated send requires template_id",
        "invalid_args",
      );
    }
    if (args.kind === "custom" && !args.subject) {
      throw new CommsError("custom send requires subject", "invalid_args");
    }
    const provider_message_id = nextId();
    const thread_id = args.thread_id ?? provider_message_id;
    this.outbox.push({
      ...args,
      provider_message_id,
      at: new Date().toISOString(),
    });
    return { provider_message_id, thread_id };
  }

  subscribeInboundParsed(
    handler: (e: InboundEmailEvent) => void | Promise<void>,
  ) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  // ── Test helpers ───────────────────────────────────────────────
  getOutbox(): readonly Recorded[] {
    return this.outbox.slice();
  }

  async emitInbound(e: InboundEmailEvent): Promise<void> {
    for (const h of this.inboundHandlers) await h(e);
  }

  reset(): void {
    this.outbox = [];
    this.inboundHandlers.clear();
  }
}
