/**
 * D-434 — per-org email adapter instantiation.
 *
 * Server-side helper: decrypts an org_email_config row's encrypted
 * credentials and constructs the right EmailAdapter. Mirrors
 * src/lib/comms/telephony/org-config.ts from D-433.
 */

import { decryptJson, type EncryptedBlob } from "../encryption";
import { CommsError } from "../types";
import { MockEmailProvider } from "./providers/mock";
import {
  ResendEmailProvider,
  type ResendCredentials,
} from "./providers/resend";
import type { EmailAdapter, EmailProviderId } from "./types";

export type OrgEmailConfigRow = {
  organization_id: string;
  provider: EmailProviderId;
  encrypted_credentials: EncryptedBlob;
  from_email: string | null;
  from_name: string | null;
  is_active: boolean;
};

export function instantiateEmailAdapter(
  row: OrgEmailConfigRow,
): EmailAdapter {
  if (!row.is_active) {
    throw new CommsError("email not configured for org", "not_configured");
  }
  switch (row.provider) {
    case "resend": {
      if (!row.from_email) {
        throw new CommsError("email from_email required", "invalid_args");
      }
      const credentials = decryptJson<ResendCredentials>(
        row.encrypted_credentials,
      );
      return new ResendEmailProvider({
        credentials,
        from_email: row.from_email,
        from_name: row.from_name,
      });
    }
    case "mock":
      return new MockEmailProvider();
    case "postmark":
      throw new CommsError(
        `email provider not yet supported: ${row.provider}`,
        "provider_unsupported",
      );
    default: {
      const exhaustive: never = row.provider;
      throw new CommsError(
        `email provider not yet supported: ${String(exhaustive)}`,
        "provider_unsupported",
      );
    }
  }
}
