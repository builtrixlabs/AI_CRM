/**
 * D-434 — live Resend email adapter.
 *
 * Implements EmailAdapter from D-418 (src/lib/comms/email/types.ts).
 *
 * Construction: per-org. The server resolves the calling user's
 * organization_id, reads + decrypts the org_email_config row, then
 * builds a ResendEmailProvider with the org's credentials + verified
 * sender. The framework never holds shared / global Resend credentials.
 *
 * API surface used:
 *   - POST /emails       (send)
 *   - GET  /domains      (test ping — verify API key round-trip)
 *
 * Auth: HTTP Bearer with the org's api_key. Body is JSON.
 */

import { CommsError } from "../../types";
import type {
  EmailAdapter,
  EmailSendArgs,
  EmailSendResult,
  InboundEmailEvent,
} from "../types";

export type ResendCredentials = {
  api_key: string;
};

export type ResendConfig = {
  credentials: ResendCredentials;
  from_email: string;
  from_name: string | null;
};

const BASE_URL = "https://api.resend.com";

export class ResendEmailProvider implements EmailAdapter {
  readonly provider = "resend" as const;
  readonly capabilities = {
    inbound: false,
    delivery_receipts: true,
    templates_required: false,
  };

  private inboundHandlers = new Set<
    (e: InboundEmailEvent) => void | Promise<void>
  >();

  constructor(private readonly cfg: ResendConfig) {
    if (!cfg.credentials.api_key)
      throw new CommsError("resend: api_key required", "invalid_args");
    if (!cfg.from_email)
      throw new CommsError("resend: from_email required", "invalid_args");
  }

  async send(args: EmailSendArgs): Promise<EmailSendResult> {
    if (args.kind !== "custom") {
      throw new CommsError(
        "resend: templated mode not yet supported via D-434 (use kind=custom)",
        "invalid_args",
      );
    }
    if (!args.to) {
      throw new CommsError("missing to", "invalid_args");
    }
    if (!args.subject) {
      throw new CommsError("custom send requires subject", "invalid_args");
    }
    const from = this.cfg.from_name
      ? `${this.cfg.from_name} <${this.cfg.from_email}>`
      : this.cfg.from_email;
    const body = {
      from,
      to: args.to,
      subject: args.subject,
      text: args.body_text,
      ...(args.body_html ? { html: args.body_html } : {}),
    };
    const res = await fetch(`${BASE_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.credentials.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `resend http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (!data.id) {
      throw new CommsError(
        "resend: missing id in response",
        "provider_error",
      );
    }
    return {
      provider_message_id: data.id,
      thread_id: args.thread_id ?? data.id,
    };
  }

  subscribeInboundParsed(
    handler: (e: InboundEmailEvent) => void | Promise<void>,
  ) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  /** Webhook dispatcher hook — D-434 scaffolding leaves this empty. */
  async dispatchInbound(e: InboundEmailEvent): Promise<void> {
    for (const h of this.inboundHandlers) await h(e);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Verify a Resend API key by hitting the domains endpoint. Returns a
 * structured result for the admin UI's Test ping button.
 */
export async function resendTestPing(
  creds: ResendCredentials,
): Promise<{ ok: boolean; message: string }> {
  if (!creds.api_key) {
    return { ok: false, message: "missing credentials" };
  }
  try {
    const res = await fetch(`${BASE_URL}/domains`, {
      headers: { Authorization: `Bearer ${creds.api_key}` },
    });
    if (res.ok) return { ok: true, message: "api key verified" };
    if (res.status === 401)
      return { ok: false, message: "401 — invalid api_key" };
    if (res.status === 403)
      return { ok: false, message: "403 — access denied" };
    return { ok: false, message: `http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
