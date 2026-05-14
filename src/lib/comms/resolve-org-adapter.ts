/**
 * D-603 — resolve a live per-org comms adapter for a channel.
 *
 * Reads the org's `org_{channel}_config` row and hands it to the channel's
 * `instantiate{Channel}Adapter` factory (D-432–D-435), which decrypts the
 * stored credentials and constructs the real provider. Returns a
 * discriminated result:
 *   - `not_configured`  — no row, an inactive row, or a row with no
 *     provider/credentials. Callers treat this as "not sent + warn the
 *     operator", never a hard failure.
 *   - `provider_error`  — the row exists but the factory rejected it
 *     (unsupported provider, missing required field, decrypt failure).
 *   - `ok`              — a live adapter, plus the resolved provider id.
 *
 * The `.eq("organization_id", …)` filter on every read is the load-bearing
 * tenant guard: this runs on the service-role client, which bypasses RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CommsError } from "./types";
import {
  instantiateEmailAdapter,
  type OrgEmailConfigRow,
} from "./email/org-config";
import {
  instantiateSmsAdapter,
  type OrgSmsConfigRow,
} from "./sms/org-config";
import {
  instantiateWhatsAppAdapter,
  type OrgWhatsAppEndpointRow,
} from "./whatsapp/org-config";
import {
  instantiateTelephonyAdapter,
  type OrgTelephonyConfigRow,
} from "./telephony/org-config";
import type { EmailAdapter } from "./email/types";
import type { SmsAdapter } from "./sms/types";
import type { WhatsAppAdapter } from "./whatsapp/types";
import type { TelephonyAdapter } from "./telephony/types";

export type ResolvableChannel = "email" | "sms" | "whatsapp" | "telephony";

type AdapterByChannel = {
  email: EmailAdapter;
  sms: SmsAdapter;
  whatsapp: WhatsAppAdapter;
  telephony: TelephonyAdapter;
};

export type ResolveOrgAdapterResult<C extends ResolvableChannel> =
  | { ok: true; adapter: AdapterByChannel[C]; provider: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "provider_error"; message: string };

// org_whatsapp_endpoints stores the column as `active`; OrgWhatsAppEndpointRow
// and instantiateWhatsAppAdapter read `is_active`. The resolver selects raw
// and maps it (D-603 risk note — miss this and every org's WhatsApp breaks).
type OrgWhatsAppEndpointRawRow = Omit<OrgWhatsAppEndpointRow, "is_active"> & {
  active: boolean;
};

const NOT_CONFIGURED: { ok: false; reason: "not_configured" } = {
  ok: false,
  reason: "not_configured",
};

function isNotConfigured(err: unknown): boolean {
  return err instanceof CommsError && err.kind === "not_configured";
}

function providerError(err: unknown): {
  ok: false;
  reason: "provider_error";
  message: string;
} {
  const message =
    err instanceof CommsError
      ? `${err.kind}: ${err.message}`
      : err instanceof Error
        ? err.message
        : "unknown adapter error";
  return { ok: false, reason: "provider_error", message };
}

type Resolved<A> =
  | { ok: true; adapter: A; provider: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "provider_error"; message: string };

/**
 * Shared select → instantiate → discriminate flow. `build` carries the
 * per-channel glue (which factory, the sms allowed-templates arg, the
 * whatsapp active→is_active map).
 */
async function resolveVia<A>(
  client: SupabaseClient,
  table: string,
  columns: string,
  organization_id: string,
  build: (row: Record<string, unknown>) => { adapter: A; provider: string },
): Promise<Resolved<A>> {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (error || !data) return NOT_CONFIGURED;
  try {
    const { adapter, provider } = build(data as Record<string, unknown>);
    return { ok: true, adapter, provider };
  } catch (err) {
    return isNotConfigured(err) ? NOT_CONFIGURED : providerError(err);
  }
}

export async function resolveOrgAdapter<C extends ResolvableChannel>(
  channel: C,
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
  allowedTemplates: ReadonlySet<string> = new Set(),
): Promise<ResolveOrgAdapterResult<C>> {
  switch (channel) {
    case "email":
      return resolveVia(
        client,
        "org_email_config",
        "organization_id, provider, encrypted_credentials, from_email, from_name, is_active",
        organization_id,
        (row) => {
          const r = row as unknown as OrgEmailConfigRow;
          return { adapter: instantiateEmailAdapter(r), provider: r.provider };
        },
      ) as Promise<ResolveOrgAdapterResult<C>>;
    case "sms":
      return resolveVia(
        client,
        "org_sms_config",
        "organization_id, provider, encrypted_credentials, sender_id, dlt_entity_id, is_active",
        organization_id,
        (row) => {
          const r = row as unknown as OrgSmsConfigRow;
          return {
            adapter: instantiateSmsAdapter(r, allowedTemplates),
            provider: r.provider,
          };
        },
      ) as Promise<ResolveOrgAdapterResult<C>>;
    case "whatsapp":
      return resolveVia(
        client,
        "org_whatsapp_endpoints",
        "organization_id, provider, encrypted_credentials, from_phone_number_id, from_display_number, approved_template_ids, active",
        organization_id,
        (row) => {
          const raw = row as unknown as OrgWhatsAppEndpointRawRow;
          const r: OrgWhatsAppEndpointRow = { ...raw, is_active: raw.active };
          return {
            adapter: instantiateWhatsAppAdapter(r),
            provider: String(r.provider),
          };
        },
      ) as Promise<ResolveOrgAdapterResult<C>>;
    case "telephony":
      return resolveVia(
        client,
        "org_telephony_config",
        "organization_id, provider, encrypted_credentials, virtual_number, is_active",
        organization_id,
        (row) => {
          const r = row as unknown as OrgTelephonyConfigRow;
          return {
            adapter: instantiateTelephonyAdapter(r),
            provider: r.provider,
          };
        },
      ) as Promise<ResolveOrgAdapterResult<C>>;
    default: {
      const exhaustive: never = channel;
      throw new Error(`unsupported channel: ${String(exhaustive)}`);
    }
  }
}
