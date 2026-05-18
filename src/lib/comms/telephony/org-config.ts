/**
 * D-433 — per-org telephony adapter instantiation.
 *
 * Server-side helper: given an org_telephony_config row read by the
 * caller (typically via getSupabaseAdmin to get the encrypted blob),
 * decrypts the credentials and constructs the right TelephonyAdapter.
 *
 * Throws:
 *   - CommsError('not_configured') when is_active=false
 *   - CommsError('invalid_args') when virtual_number missing
 *   - CommsError('provider_unsupported') for providers without an adapter
 *
 * The mock provider is supported for tests; everything else routes to
 * its real adapter (today only exotel).
 */

import { decryptJson, type EncryptedBlob } from "../encryption";
import { CommsError } from "../types";
import { MockTelephonyProvider } from "./providers/mock";
import {
  ExotelTelephonyProvider,
  type ExotelCredentials,
} from "./providers/exotel";
import type { TelephonyAdapter, TelephonyProviderId } from "./types";

export type OrgTelephonyConfigRow = {
  organization_id: string;
  provider: TelephonyProviderId;
  encrypted_credentials: EncryptedBlob;
  virtual_number: string | null;
  is_active: boolean;
};

export function instantiateTelephonyAdapter(
  row: OrgTelephonyConfigRow,
): TelephonyAdapter {
  if (!row.is_active) {
    throw new CommsError(
      "telephony not configured for org",
      "not_configured",
    );
  }
  switch (row.provider) {
    case "exotel": {
      if (!row.virtual_number) {
        throw new CommsError(
          "telephony virtual_number required",
          "invalid_args",
        );
      }
      const credentials = decryptJson<ExotelCredentials>(
        row.encrypted_credentials,
      );
      return new ExotelTelephonyProvider({
        credentials,
        virtual_number: row.virtual_number,
      });
    }
    case "mock":
      return new MockTelephonyProvider();
    case "servetel":
    case "knowlarity":
    case "myoperator":
    case "ozonetel":
      throw new CommsError(
        `telephony provider not yet supported: ${row.provider}`,
        "provider_unsupported",
      );
    default: {
      const exhaustive: never = row.provider;
      throw new CommsError(
        `telephony provider not yet supported: ${String(exhaustive)}`,
        "provider_unsupported",
      );
    }
  }
}
