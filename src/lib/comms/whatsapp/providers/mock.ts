import { CommsError } from "../../types";
import type {
  InboundWhatsAppEvent,
  WhatsAppAdapter,
  WhatsAppSendArgs,
  WhatsAppSendResult,
} from "../types";

let counter = 0;
const nextId = () => `mock-wa-${++counter}`;

type Recorded = WhatsAppSendArgs & {
  provider_message_id: string;
  at: string;
};

export class MockWhatsAppProvider implements WhatsAppAdapter {
  readonly provider = "mock" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: true,
  };

  private outbox: Recorded[] = [];
  private approvedTemplates: Set<string>;
  private inboundHandlers = new Set<
    (e: InboundWhatsAppEvent) => void | Promise<void>
  >();

  // `seed` pre-fills the approved-template registry so a mock instantiated
  // via instantiateWhatsAppAdapter(row) behaves like the real Gupshup /
  // Cloud API adapters, which take their approved templates at construction.
  constructor(seed?: ReadonlySet<string>) {
    this.approvedTemplates = new Set(seed);
  }

  async send(args: WhatsAppSendArgs): Promise<WhatsAppSendResult> {
    if (!args.to_phone_e164 || !args.organization_id) {
      throw new CommsError(
        "missing to_phone_e164/organization_id",
        "invalid_args",
      );
    }
    if (!this.approvedTemplates.has(args.template_id)) {
      throw new CommsError(
        `Template not in approved registry: ${args.template_id}`,
        "template_not_found",
      );
    }
    const provider_message_id = nextId();
    this.outbox.push({
      ...args,
      provider_message_id,
      at: new Date().toISOString(),
    });
    return { provider_message_id, template_id: args.template_id };
  }

  subscribeInbound(
    handler: (e: InboundWhatsAppEvent) => void | Promise<void>,
  ) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  // Test helpers
  approveTemplate(id: string): void {
    this.approvedTemplates.add(id);
  }

  getOutbox(): readonly Recorded[] {
    return this.outbox.slice();
  }

  async emitInbound(e: InboundWhatsAppEvent): Promise<void> {
    for (const h of this.inboundHandlers) await h(e);
  }

  reset(): void {
    this.outbox = [];
    this.approvedTemplates.clear();
    this.inboundHandlers.clear();
  }
}
