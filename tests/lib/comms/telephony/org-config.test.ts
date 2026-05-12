import { describe, expect, it } from "vitest";
import { instantiateTelephonyAdapter } from "@/lib/comms/telephony/org-config";
import { encryptJson } from "@/lib/comms/encryption";
import { CommsError } from "@/lib/comms/types";
import { ExotelTelephonyProvider } from "@/lib/comms/telephony/providers/exotel";
import { MockTelephonyProvider } from "@/lib/comms/telephony/providers/mock";

describe("instantiateTelephonyAdapter", () => {
  it("constructs an ExotelTelephonyProvider when provider=exotel + active", () => {
    const encrypted = encryptJson({
      account_sid: "test-sid",
      api_key: "test-key",
      api_token: "test-token",
    });
    const a = instantiateTelephonyAdapter({
      organization_id: "00000000-0000-4000-8000-000000000000",
      provider: "exotel",
      encrypted_credentials: encrypted,
      virtual_number: "+91-22-99999999",
      is_active: true,
    });
    expect(a).toBeInstanceOf(ExotelTelephonyProvider);
    expect(a.provider).toBe("exotel");
  });

  it("constructs MockTelephonyProvider for provider=mock", () => {
    const a = instantiateTelephonyAdapter({
      organization_id: "x",
      provider: "mock",
      encrypted_credentials: encryptJson({}),
      virtual_number: null,
      is_active: true,
    });
    expect(a).toBeInstanceOf(MockTelephonyProvider);
  });

  it("throws not_configured when is_active=false", () => {
    expect(() =>
      instantiateTelephonyAdapter({
        organization_id: "x",
        provider: "exotel",
        encrypted_credentials: encryptJson({
          account_sid: "x",
          api_key: "y",
          api_token: "z",
        }),
        virtual_number: "+91-22-99999999",
        is_active: false,
      }),
    ).toThrow(CommsError);
  });

  it("throws invalid_args when virtual_number missing on exotel", () => {
    expect(() =>
      instantiateTelephonyAdapter({
        organization_id: "x",
        provider: "exotel",
        encrypted_credentials: encryptJson({
          account_sid: "x",
          api_key: "y",
          api_token: "z",
        }),
        virtual_number: null,
        is_active: true,
      }),
    ).toThrow(/virtual_number required/);
  });

  it("throws provider_unsupported for servetel/knowlarity/myoperator/ozonetel", () => {
    for (const p of ["servetel", "knowlarity", "myoperator", "ozonetel"] as const) {
      expect(() =>
        instantiateTelephonyAdapter({
          organization_id: "x",
          provider: p,
          encrypted_credentials: encryptJson({}),
          virtual_number: "+91-22-99999999",
          is_active: true,
        }),
      ).toThrow(/not yet supported/);
    }
  });
});
