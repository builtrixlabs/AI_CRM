/**
 * D-433 — live Exotel telephony adapter.
 *
 * Implements TelephonyAdapter from D-418 (src/lib/comms/telephony/types.ts).
 *
 * Construction: per-org. The server resolves the calling user's
 * organization_id, reads + decrypts the org_telephony_config row, then
 * builds an ExotelTelephonyProvider with the org's credentials and
 * virtual number. The framework never holds shared / global Exotel
 * credentials — see memory/per_org_integration_model.
 *
 * API surface used:
 *   - POST /v1/Accounts/{sid}/Calls/connect.json  (outboundClickToCall)
 *   - GET  /v1/Accounts/{sid}/Calls/{call_sid}.json  (lookupCallStatus)
 *   - GET  /v1/Accounts/{sid}.json  (test ping — verify creds round-trip)
 *
 * Auth: HTTP Basic with `api_key:api_token`. Account SID is in the URL
 * path. Body for connect.json is form-urlencoded.
 */

import { CommsError } from "../../types";
import type {
  CallStatus,
  DispositionEvent,
  InboundCallEvent,
  OutboundCallArgs,
  TelephonyAdapter,
} from "../types";

export type ExotelCredentials = {
  account_sid: string;
  api_key: string;
  api_token: string;
};

export type ExotelConfig = {
  credentials: ExotelCredentials;
  virtual_number: string;
};

export class ExotelTelephonyProvider implements TelephonyAdapter {
  readonly provider = "exotel" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: false,
  };

  private inboundHandlers = new Set<
    (e: InboundCallEvent) => void | Promise<void>
  >();
  private dispoHandlers = new Set<
    (e: DispositionEvent) => void | Promise<void>
  >();

  constructor(private readonly cfg: ExotelConfig) {
    if (!cfg.credentials.account_sid)
      throw new CommsError("exotel: account_sid required", "invalid_args");
    if (!cfg.credentials.api_key)
      throw new CommsError("exotel: api_key required", "invalid_args");
    if (!cfg.credentials.api_token)
      throw new CommsError("exotel: api_token required", "invalid_args");
    if (!cfg.virtual_number)
      throw new CommsError("exotel: virtual_number required", "invalid_args");
  }

  private get baseUrl(): string {
    return `https://api.exotel.com/v1/Accounts/${encodeURIComponent(
      this.cfg.credentials.account_sid,
    )}`;
  }

  private authHeader(): string {
    const basic = Buffer.from(
      `${this.cfg.credentials.api_key}:${this.cfg.credentials.api_token}`,
      "utf8",
    ).toString("base64");
    return `Basic ${basic}`;
  }

  async outboundClickToCall(
    args: OutboundCallArgs,
  ): Promise<{ provider_call_id: string; status: CallStatus }> {
    if (!args.to_phone_e164) {
      throw new CommsError("missing to_phone_e164", "invalid_args");
    }
    // D-609 — bridge the rep's phone to the customer when from_phone_e164
    // is supplied; fall back to the virtual number (pre-D-609 behavior).
    const body = new URLSearchParams();
    body.set("From", args.from_phone_e164 ?? this.cfg.virtual_number);
    body.set("To", args.to_phone_e164);
    body.set("CallerId", this.cfg.virtual_number);
    body.set("CallType", "trans");

    const res = await fetch(`${this.baseUrl}/Calls/connect.json`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `exotel http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      Call?: { Sid?: string };
    };
    const sid = data?.Call?.Sid;
    if (!sid) {
      throw new CommsError(
        "exotel: missing Call.Sid in response",
        "provider_error",
      );
    }
    return { provider_call_id: sid, status: { state: "queued" } };
  }

  async lookupCallStatus(
    provider_call_id: string,
  ): Promise<CallStatus | null> {
    const res = await fetch(
      `${this.baseUrl}/Calls/${encodeURIComponent(provider_call_id)}.json`,
      { headers: { Authorization: this.authHeader() } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await safeText(res);
      throw new CommsError(
        `exotel http ${res.status}: ${text.slice(0, 200)}`,
        "provider_error",
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      Call?: { Status?: string; EndTime?: string; Duration?: string };
    };
    const status = String(data?.Call?.Status ?? "").toLowerCase();
    if (status === "queued") return { state: "queued" };
    if (status === "in-progress" || status === "ringing") {
      return { state: "ringing", provider_call_id };
    }
    if (status === "completed") {
      return {
        state: "ended",
        provider_call_id,
        ended_at: data?.Call?.EndTime ?? new Date().toISOString(),
        duration_s: parseInt(data?.Call?.Duration ?? "0", 10),
      };
    }
    if (status === "busy" || status === "no-answer" || status === "failed") {
      return { state: "failed", provider_call_id, reason: status };
    }
    // Unknown status — treat as queued (caller polls again).
    return { state: "queued" };
  }

  subscribeInbound(handler: (e: InboundCallEvent) => void | Promise<void>) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }
  subscribeDisposition(
    handler: (e: DispositionEvent) => void | Promise<void>,
  ) {
    this.dispoHandlers.add(handler);
    return () => this.dispoHandlers.delete(handler);
  }

  /** Used by the webhook handler to dispatch parsed events. */
  async dispatchInbound(e: InboundCallEvent): Promise<void> {
    for (const h of this.inboundHandlers) await h(e);
  }
  async dispatchDisposition(e: DispositionEvent): Promise<void> {
    for (const h of this.dispoHandlers) await h(e);
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
 * Verify a set of Exotel credentials by hitting the account-info endpoint.
 * Returns a structured result so the admin UI can render a friendly message
 * without exposing the raw HTTP error. Used by the "Test ping" button on
 * /admin/integrations/telephony.
 */
export async function exotelTestPing(
  creds: ExotelCredentials,
): Promise<{ ok: boolean; message: string }> {
  if (!creds.account_sid || !creds.api_key || !creds.api_token) {
    return { ok: false, message: "missing credentials" };
  }
  const basic = Buffer.from(
    `${creds.api_key}:${creds.api_token}`,
    "utf8",
  ).toString("base64");
  try {
    const res = await fetch(
      `https://api.exotel.com/v1/Accounts/${encodeURIComponent(creds.account_sid)}.json`,
      { headers: { Authorization: `Basic ${basic}` } },
    );
    if (res.ok) return { ok: true, message: "credentials verified" };
    if (res.status === 401)
      return { ok: false, message: "401 — invalid api_key / api_token" };
    if (res.status === 403) return { ok: false, message: "403 — access denied" };
    if (res.status === 404)
      return { ok: false, message: "404 — account_sid not found" };
    return { ok: false, message: `http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
