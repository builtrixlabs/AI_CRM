/**
 * D-432 — live Meta Cloud API WhatsApp adapter (direct).
 *
 * Meta Graph API template send:
 *   POST https://graph.facebook.com/v17.0/<phone_number_id>/messages
 *   header: Authorization: Bearer <access_token>
 *   body (JSON):
 *     {
 *       messaging_product: "whatsapp",
 *       to: "<E.164 minus +>",
 *       type: "template",
 *       template: {
 *         name: "<template_name>",
 *         language: { code: "en_US" },
 *         components: [{ type: "body", parameters: [{type:"text",text:"..."}] }]
 *       }
 *     }
 */

import { CommsError } from "../../types";
import type {
  InboundWhatsAppEvent,
  WhatsAppAdapter,
  WhatsAppSendArgs,
  WhatsAppSendResult,
} from "../types";

export type CloudApiCredentials = {
  access_token: string;
};

export type CloudApiConfig = {
  credentials: CloudApiCredentials;
  from_phone_number_id: string;
  allowed_templates: ReadonlySet<string>;
};

const GRAPH_VERSION = "v17.0";
const BASE_URL = "https://graph.facebook.com";

export class CloudApiWhatsAppProvider implements WhatsAppAdapter {
  readonly provider = "cloud_api" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: true,
  };

  private inboundHandlers = new Set<
    (e: InboundWhatsAppEvent) => void | Promise<void>
  >();

  constructor(private readonly cfg: CloudApiConfig) {
    if (!cfg.credentials.access_token)
      throw new CommsError(
        "cloud_api: access_token required",
        "invalid_args",
      );
    if (!cfg.from_phone_number_id)
      throw new CommsError(
        "cloud_api: from_phone_number_id required",
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

    const to = args.to_phone_e164.replace(/^\+/, "");
    const language = args.language_code ?? "en_US";
    const parameters = Object.keys(args.data)
      .sort()
      .map((k) => ({ type: "text", text: args.data[k] }));

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: args.template_id,
        language: { code: language },
        components:
          parameters.length === 0
            ? []
            : [{ type: "body", parameters }],
      },
    };

    const res = await fetch(
      `${BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(this.cfg.from_phone_number_id)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.credentials.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `cloud_api http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    const id = data.messages?.[0]?.id ?? "";
    if (!id) {
      throw new CommsError(
        "cloud_api: missing message id in response",
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
 * Verify Cloud API credentials by hitting the phone-number GET endpoint.
 * 200 = ok; 401 = invalid token; 404 = wrong phone_number_id.
 */
export async function cloudApiTestPing(
  creds: CloudApiCredentials,
  phone_number_id: string,
): Promise<{ ok: boolean; message: string }> {
  if (!creds.access_token) {
    return { ok: false, message: "missing credentials" };
  }
  if (!phone_number_id) {
    return { ok: false, message: "missing phone_number_id" };
  }
  try {
    const res = await fetch(
      `${BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(phone_number_id)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
          Accept: "application/json",
        },
      },
    );
    if (res.ok) return { ok: true, message: "access token verified" };
    if (res.status === 401)
      return { ok: false, message: "401 — invalid access_token" };
    if (res.status === 403)
      return { ok: false, message: "403 — access denied" };
    if (res.status === 404)
      return { ok: false, message: "404 — phone_number_id not found" };
    return { ok: false, message: `http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
