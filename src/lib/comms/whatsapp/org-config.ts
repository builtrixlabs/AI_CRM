/**
 * D-432 — per-org WhatsApp adapter instantiation.
 *
 * Server-side helper: decrypts an org_whatsapp_endpoints row's encrypted
 * credentials and constructs the right WhatsAppAdapter. Mirrors the
 * pattern from telephony/email/sms but routes to two providers
 * (Gupshup BSP and Meta Cloud API direct).
 */

import { decryptJson, type EncryptedBlob } from "../encryption";
import { CommsError } from "../types";
import { MockWhatsAppProvider } from "./providers/mock";
import {
  GupshupWhatsAppProvider,
  type GupshupCredentials,
} from "./providers/gupshup";
import {
  CloudApiWhatsAppProvider,
  type CloudApiCredentials,
} from "./providers/cloud-api";
import type { WhatsAppAdapter, WhatsAppProviderId } from "./types";

export type OrgWhatsAppEndpointRow = {
  organization_id: string;
  provider: WhatsAppProviderId | null;
  encrypted_credentials: EncryptedBlob | null;
  from_phone_number_id: string | null;
  from_display_number: string | null;
  approved_template_ids: string[] | null;
  is_active: boolean;
};

export function instantiateWhatsAppAdapter(
  row: OrgWhatsAppEndpointRow,
): WhatsAppAdapter {
  if (!row.is_active) {
    throw new CommsError(
      "whatsapp not configured for org",
      "not_configured",
    );
  }
  if (!row.provider || !row.encrypted_credentials) {
    throw new CommsError(
      "whatsapp provider credentials missing",
      "not_configured",
    );
  }
  const allowed = new Set(row.approved_template_ids ?? []);
  switch (row.provider) {
    case "gupshup": {
      if (!row.from_display_number) {
        throw new CommsError(
          "whatsapp from_display_number required for gupshup",
          "invalid_args",
        );
      }
      const credentials = decryptJson<GupshupCredentials>(
        row.encrypted_credentials,
      );
      return new GupshupWhatsAppProvider({
        credentials,
        from_display_number: row.from_display_number,
        allowed_templates: allowed,
      });
    }
    case "cloud_api": {
      if (!row.from_phone_number_id) {
        throw new CommsError(
          "whatsapp from_phone_number_id required for cloud_api",
          "invalid_args",
        );
      }
      const credentials = decryptJson<CloudApiCredentials>(
        row.encrypted_credentials,
      );
      return new CloudApiWhatsAppProvider({
        credentials,
        from_phone_number_id: row.from_phone_number_id,
        allowed_templates: allowed,
      });
    }
    case "mock":
      return new MockWhatsAppProvider();
    default: {
      const exhaustive: never = row.provider;
      throw new CommsError(
        `whatsapp provider not yet supported: ${String(exhaustive)}`,
        "provider_unsupported",
      );
    }
  }
}
