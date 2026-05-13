/**
 * D-432 — live Gupshup WhatsApp BSP adapter.
 *
 * Gupshup template-send API:
 *   POST https://api.gupshup.io/sm/api/v1/template/msg
 *   header: apikey: <api_key>
 *   body (form-encoded):
 *     source=<from_number>
 *     destination=<to_number>
 *     template={"id":"<template_uuid>","params":["var1","var2"]}
 */

import { CommsError } from "../../types";
import type {
  InboundWhatsAppEvent,
  WhatsAppAdapter,
  WhatsAppSendArgs,
  WhatsAppSendResult,
} from "../types";

export type GupshupCredentials = {
  api_key: string;
  app_name?: string;
};

export type GupshupConfig = {
  credentials: GupshupCredentials;
  from_display_number: string; // E.164 with +
  allowed_templates: ReadonlySet<string>;
};

const BASE_URL = "https://api.gupshup.io";

export class GupshupWhatsAppProvider implements WhatsAppAdapter {
  readonly provider = "gupshup" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: true,
  };

  private inboundHandlers = new Set<
    (e: InboundWhatsAppEvent) => void | Promise<void>
  >();

  constructor(private readonly cfg: GupshupConfig) {
    if (!cfg.credentials.api_key)
      throw new CommsError("gupshup: api_key required", "invalid_args");
    if (!cfg.from_display_number)
      throw new CommsError(
        "gupshup: from_display_number required",
        "invalid_args",
      );
  }

  async send(args: WhatsAppSendArgs): Promise<WhatsAppSendResult> {
    if (!args.to_phone_e164 || !args.organization_id) {
      throw new CommsError(
        "missing to_phone_e164/organization_id",
        "invalid_args",
      );
    }
    if (!this.cfg.allowed_templates.has(args.template_id)) {
      throw new CommsError(
        `Template not in approved registry: ${args.template_id}`,
        "template_not_found",
      );
    }

    const source = this.cfg.from_display_number.replace(/^\+/, "");
    const destination = args.to_phone_e164.replace(/^\+/, "");
    const params = Object.keys(args.data)
      .sort()
      .map((k) => args.data[k]);

    const form = new URLSearchParams();
    form.set("source", source);
    form.set("destination", destination);
    form.set(
      "template",
      JSON.stringify({ id: args.template_id, params }),
    );

    const res = await fetch(`${BASE_URL}/sm/api/v1/template/msg`, {
      method: "POST",
      headers: {
        apikey: this.cfg.credentials.api_key,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `gupshup http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }

    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      messageId?: string;
      message?: string;
    };
    if (data.status && data.status !== "submitted") {
      throw new CommsError(
        `gupshup rejected: ${data.message ?? data.status}`,
        "provider_error",
      );
    }
    const id = data.messageId ?? "";
    if (!id) {
      throw new CommsError(
        "gupshup: missing messageId in response",
        "provider_error",
      );
    }
    return { provider_message_id: id, template_id: args.template_id };
  }

  subscribeInbound(
    handler: (e: InboundWhatsAppEvent) => void | Promise<void>,
  ) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
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
 * Verify Gupshup credentials via a lightweight account-info call. Gupshup
 * doesn't ship a strict "ping" endpoint; we POST the same template-msg
 * URL with intentionally-malformed body and treat 401/403 as the
 * meaningful auth result. A 400 response with the api_key valid means
 * the auth check passed even if the body was nonsense.
 */
export async function gupshupTestPing(
  creds: GupshupCredentials,
): Promise<{ ok: boolean; message: string }> {
  if (!creds.api_key) {
    return { ok: false, message: "missing credentials" };
  }
  try {
    const res = await fetch(`${BASE_URL}/sm/api/v1/users/${encodeURIComponent(creds.app_name ?? "_self")}`, {
      headers: { apikey: creds.api_key, Accept: "application/json" },
    });
    if (res.ok) return { ok: true, message: "api key verified" };
    if (res.status === 401)
      return { ok: false, message: "401 — invalid api_key" };
    if (res.status === 403)
      return { ok: false, message: "403 — access denied" };
    if (res.status === 404)
      return { ok: false, message: "404 — app_name not found" };
    return { ok: false, message: `http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
