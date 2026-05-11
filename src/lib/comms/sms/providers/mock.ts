import { CommsError } from "../../types";
import type { SmsAdapter, SmsSendArgs, SmsSendResult } from "../types";

let counter = 0;
const nextId = () => `mock-sms-${++counter}`;

type Recorded = SmsSendArgs & { provider_message_id: string; at: string };

/**
 * MockSmsProvider enforces DLT-template-registry checks identically to live
 * providers so tests catch missing templates before they would hit the wire.
 * Tests register templates via `registerTemplate()`.
 */
export class MockSmsProvider implements SmsAdapter {
  readonly provider = "mock" as const;
  readonly capabilities = {
    inbound: false,
    delivery_receipts: true,
    templates_required: true,
  };

  private outbox: Recorded[] = [];
  private dltTemplates = new Set<string>();

  async send(args: SmsSendArgs): Promise<SmsSendResult> {
    if (!args.to_phone_e164 || !args.organization_id) {
      throw new CommsError(
        "missing to_phone_e164/organization_id",
        "invalid_args",
      );
    }
    if (!this.dltTemplates.has(args.template_id)) {
      throw new CommsError(
        `Template not in DLT registry: ${args.template_id}`,
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

  // ── Test helpers ───────────────────────────────────────────────
  registerTemplate(id: string): void {
    this.dltTemplates.add(id);
  }

  getOutbox(): readonly Recorded[] {
    return this.outbox.slice();
  }

  reset(): void {
    this.outbox = [];
    this.dltTemplates.clear();
  }
}
