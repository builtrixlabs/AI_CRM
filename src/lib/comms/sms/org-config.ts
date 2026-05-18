/**
 * D-435 — per-org SMS adapter instantiation.
 *
 * Server-side helper: decrypts an org_sms_config row's encrypted
 * credentials, loads the org's DLT template registry, and constructs
 * the right SmsAdapter. Mirrors src/lib/comms/email/org-config.ts.
 */

import { decryptJson, type EncryptedBlob } from "../encryption";
import { CommsError } from "../types";
import { MockSmsProvider } from "./providers/mock";
import {
  Msg91SmsProvider,
  type Msg91Credentials,
} from "./providers/msg91";
import type { SmsAdapter, SmsProviderId } from "./types";

export type OrgSmsConfigRow = {
  organization_id: string;
  provider: SmsProviderId;
  encrypted_credentials: EncryptedBlob;
  sender_id: string | null;
  dlt_entity_id: string | null;
  is_active: boolean;
};

export function instantiateSmsAdapter(
  row: OrgSmsConfigRow,
  allowed_templates: ReadonlySet<string>,
): SmsAdapter {
  if (!row.is_active) {
    throw new CommsError("sms not configured for org", "not_configured");
  }
  switch (row.provider) {
    case "msg91": {
      if (!row.sender_id) {
        throw new CommsError("sms sender_id required", "invalid_args");
      }
      const credentials = decryptJson<Msg91Credentials>(
        row.encrypted_credentials,
      );
      return new Msg91SmsProvider({
        credentials,
        sender_id: row.sender_id,
        allowed_templates,
      });
    }
    case "mock":
      return new MockSmsProvider(allowed_templates);
    case "gupshup":
      throw new CommsError(
        `sms provider not yet supported: ${row.provider}`,
        "provider_unsupported",
      );
    default: {
      const exhaustive: never = row.provider;
      throw new CommsError(
        `sms provider not yet supported: ${String(exhaustive)}`,
        "provider_unsupported",
      );
    }
  }
}
