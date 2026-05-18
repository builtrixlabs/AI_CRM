import { describe, expect, it } from "vitest";
import { instantiateSmsAdapter } from "@/lib/comms/sms/org-config";
import { encryptJson } from "@/lib/comms/encryption";
import { CommsError } from "@/lib/comms/types";
import { Msg91SmsProvider } from "@/lib/comms/sms/providers/msg91";
import { MockSmsProvider } from "@/lib/comms/sms/providers/mock";

describe("instantiateSmsAdapter", () => {
  it("constructs a Msg91SmsProvider when provider=msg91 + active", () => {
    const encrypted = encryptJson({ authkey: "test-authkey" });
    const a = instantiateSmsAdapter(
      {
        organization_id: "00000000-0000-4000-8000-000000000000",
        provider: "msg91",
        encrypted_credentials: encrypted,
        sender_id: "BLTRIX",
        dlt_entity_id: "1701",
        is_active: true,
      },
      new Set(["1707T"]),
    );
    expect(a).toBeInstanceOf(Msg91SmsProvider);
    expect(a.provider).toBe("msg91");
  });

  it("constructs MockSmsProvider for provider=mock", () => {
    const a = instantiateSmsAdapter(
      {
        organization_id: "x",
        provider: "mock",
        encrypted_credentials: encryptJson({}),
        sender_id: null,
        dlt_entity_id: null,
        is_active: true,
      },
      new Set(),
    );
    expect(a).toBeInstanceOf(MockSmsProvider);
  });

  it("throws not_configured when is_active=false", () => {
    expect(() =>
      instantiateSmsAdapter(
        {
          organization_id: "x",
          provider: "msg91",
          encrypted_credentials: encryptJson({ authkey: "x" }),
          sender_id: "BLTRIX",
          dlt_entity_id: "1701",
          is_active: false,
        },
        new Set(),
      ),
    ).toThrow(CommsError);
  });

  it("throws invalid_args when sender_id missing on msg91", () => {
    expect(() =>
      instantiateSmsAdapter(
        {
          organization_id: "x",
          provider: "msg91",
          encrypted_credentials: encryptJson({ authkey: "x" }),
          sender_id: null,
          dlt_entity_id: "1701",
          is_active: true,
        },
        new Set(),
      ),
    ).toThrow(/sender_id required/);
  });

  it("throws provider_unsupported for gupshup", () => {
    expect(() =>
      instantiateSmsAdapter(
        {
          organization_id: "x",
          provider: "gupshup",
          encrypted_credentials: encryptJson({}),
          sender_id: "BLTRIX",
          dlt_entity_id: "1701",
          is_active: true,
        },
        new Set(),
      ),
    ).toThrow(/not yet supported/);
  });
});
