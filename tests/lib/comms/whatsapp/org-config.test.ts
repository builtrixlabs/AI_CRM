import { describe, expect, it } from "vitest";
import { instantiateWhatsAppAdapter } from "@/lib/comms/whatsapp/org-config";
import { encryptJson } from "@/lib/comms/encryption";
import { CommsError } from "@/lib/comms/types";
import { GupshupWhatsAppProvider } from "@/lib/comms/whatsapp/providers/gupshup";
import { CloudApiWhatsAppProvider } from "@/lib/comms/whatsapp/providers/cloud-api";
import { MockWhatsAppProvider } from "@/lib/comms/whatsapp/providers/mock";

describe("instantiateWhatsAppAdapter", () => {
  it("constructs a Gupshup adapter when provider=gupshup + active", () => {
    const encrypted = encryptJson({ api_key: "gs_test", app_name: "x" });
    const a = instantiateWhatsAppAdapter({
      organization_id: "x",
      provider: "gupshup",
      encrypted_credentials: encrypted,
      from_phone_number_id: null,
      from_display_number: "+919999999999",
      approved_template_ids: ["welcome_v3"],
      is_active: true,
    });
    expect(a).toBeInstanceOf(GupshupWhatsAppProvider);
  });

  it("constructs a Cloud API adapter when provider=cloud_api + active", () => {
    const encrypted = encryptJson({ access_token: "EAA-x" });
    const a = instantiateWhatsAppAdapter({
      organization_id: "x",
      provider: "cloud_api",
      encrypted_credentials: encrypted,
      from_phone_number_id: "1234567890123456",
      from_display_number: null,
      approved_template_ids: ["welcome_v3"],
      is_active: true,
    });
    expect(a).toBeInstanceOf(CloudApiWhatsAppProvider);
  });

  it("constructs MockWhatsAppProvider for provider=mock", () => {
    const a = instantiateWhatsAppAdapter({
      organization_id: "x",
      provider: "mock",
      encrypted_credentials: encryptJson({}),
      from_phone_number_id: null,
      from_display_number: null,
      approved_template_ids: null,
      is_active: true,
    });
    expect(a).toBeInstanceOf(MockWhatsAppProvider);
  });

  it("throws not_configured when is_active=false", () => {
    expect(() =>
      instantiateWhatsAppAdapter({
        organization_id: "x",
        provider: "gupshup",
        encrypted_credentials: encryptJson({ api_key: "x" }),
        from_phone_number_id: null,
        from_display_number: "+919999999999",
        approved_template_ids: ["welcome_v3"],
        is_active: false,
      }),
    ).toThrow(CommsError);
  });

  it("throws not_configured when provider or credentials missing", () => {
    expect(() =>
      instantiateWhatsAppAdapter({
        organization_id: "x",
        provider: null,
        encrypted_credentials: null,
        from_phone_number_id: null,
        from_display_number: null,
        approved_template_ids: null,
        is_active: true,
      }),
    ).toThrow(/whatsapp provider credentials missing/);
  });

  it("throws invalid_args when from_display_number missing on gupshup", () => {
    expect(() =>
      instantiateWhatsAppAdapter({
        organization_id: "x",
        provider: "gupshup",
        encrypted_credentials: encryptJson({ api_key: "x" }),
        from_phone_number_id: null,
        from_display_number: null,
        approved_template_ids: [],
        is_active: true,
      }),
    ).toThrow(/from_display_number required for gupshup/);
  });

  it("throws invalid_args when from_phone_number_id missing on cloud_api", () => {
    expect(() =>
      instantiateWhatsAppAdapter({
        organization_id: "x",
        provider: "cloud_api",
        encrypted_credentials: encryptJson({ access_token: "x" }),
        from_phone_number_id: null,
        from_display_number: null,
        approved_template_ids: [],
        is_active: true,
      }),
    ).toThrow(/from_phone_number_id required for cloud_api/);
  });
});
