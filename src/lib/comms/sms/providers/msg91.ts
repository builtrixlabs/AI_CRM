/**
 * D-435 — live MSG91 SMS adapter.
 *
 * Implements SmsAdapter from D-418 (src/lib/comms/sms/types.ts).
 *
 * MSG91 v5 Flow API: POST /api/v5/flow/ with authkey header.
 * Body shape (minimal): { template_id, short_url, recipients: [{ mobiles, var1, ... }] }.
 *
 * DLT enforcement: the adapter is constructed with an `allowedTemplates`
 * set scoped to the calling org. Any send() with a template_id outside
 * that set fails-closed with template_not_found — without ever
 * contacting MSG91. This is the same contract the mock enforces in
 * D-418 tests, just lifted to the live wire.
 *
 * Auth: `authkey` HTTP header on every request.
 */

import { CommsError } from "../../types";
import type { SmsAdapter, SmsSendArgs, SmsSendResult } from "../types";

export type Msg91Credentials = {
  authkey: string;
};

export type Msg91Config = {
  credentials: Msg91Credentials;
  sender_id: string;
  allowed_templates: ReadonlySet<string>;
};

const BASE_URL = "https://control.msg91.com";

export class Msg91SmsProvider implements SmsAdapter {
  readonly provider = "msg91" as const;
  readonly capabilities = {
    inbound: false,
    delivery_receipts: true,
    templates_required: true,
  };

  constructor(private readonly cfg: Msg91Config) {
    if (!cfg.credentials.authkey)
      throw new CommsError("msg91: authkey required", "invalid_args");
    if (!cfg.sender_id)
      throw new CommsError("msg91: sender_id required", "invalid_args");
  }

  async send(args: SmsSendArgs): Promise<SmsSendResult> {
    if (!args.to_phone_e164 || !args.organization_id) {
      throw new CommsError(
        "missing to_phone_e164/organization_id",
        "invalid_args",
      );
    }
    if (!this.cfg.allowed_templates.has(args.template_id)) {
      throw new CommsError(
        `Template not in DLT registry: ${args.template_id}`,
        "template_not_found",
      );
    }

    // MSG91 expects mobile without leading + (E.164 minus the plus).
    const mobile = args.to_phone_e164.replace(/^\+/, "");
    const recipient: Record<string, string> = { mobiles: mobile };
    // Flatten data vars (template variables) onto the recipient as
    // VAR1/VAR2/... MSG91 picks them up by name match.
    for (const [k, v] of Object.entries(args.data)) {
      recipient[k] = String(v);
    }

    const body = {
      template_id: args.template_id,
      sender: this.cfg.sender_id,
      short_url: 0,
      recipients: [recipient],
    };

    const res = await fetch(`${BASE_URL}/api/v5/flow/`, {
      method: "POST",
      headers: {
        authkey: this.cfg.credentials.authkey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `msg91 http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      type?: string;
      message?: string;
      request_id?: string;
    };
    if (data.type && data.type !== "success") {
      throw new CommsError(
        `msg91 rejected: ${data.message ?? "unknown error"}`,
        "provider_error",
      );
    }
    const id = data.request_id ?? "";
    if (!id) {
      throw new CommsError(
        "msg91: missing request_id in response",
        "provider_error",
      );
    }
    return { provider_message_id: id, template_id: args.template_id };
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
 * Verify an MSG91 authkey by hitting the balance endpoint. Returns a
 * structured result for the admin UI's Test ping button.
 */
export async function msg91TestPing(
  creds: Msg91Credentials,
): Promise<{ ok: boolean; message: string }> {
  if (!creds.authkey) {
    return { ok: false, message: "missing credentials" };
  }
  try {
    // type=4 → transactional SMS balance check on MSG91.
    const res = await fetch(`${BASE_URL}/api/v5/getBalance/?type=4`, {
      headers: { authkey: creds.authkey, Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        type?: string;
        balance?: number;
      };
      if (data.type === "success") {
        return {
          ok: true,
          message: `authkey verified${typeof data.balance === "number" ? ` (balance: ${data.balance})` : ""}`,
        };
      }
      return { ok: false, message: "non-success response" };
    }
    if (res.status === 401)
      return { ok: false, message: "401 — invalid authkey" };
    if (res.status === 403) return { ok: false, message: "403 — access denied" };
    return { ok: false, message: `http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
