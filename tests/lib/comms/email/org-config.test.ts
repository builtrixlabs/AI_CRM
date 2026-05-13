import { describe, expect, it } from "vitest";
import { instantiateEmailAdapter } from "@/lib/comms/email/org-config";
import { encryptJson } from "@/lib/comms/encryption";
import { CommsError } from "@/lib/comms/types";
import { ResendEmailProvider } from "@/lib/comms/email/providers/resend";
import { MockEmailProvider } from "@/lib/comms/email/providers/mock";

describe("instantiateEmailAdapter", () => {
  it("constructs a ResendEmailProvider when provider=resend + active", () => {
    const encrypted = encryptJson({ api_key: "re_test" });
    const a = instantiateEmailAdapter({
      organization_id: "00000000-0000-4000-8000-000000000000",
      provider: "resend",
      encrypted_credentials: encrypted,
      from_email: "hello@example.com",
      from_name: null,
      is_active: true,
    });
    expect(a).toBeInstanceOf(ResendEmailProvider);
    expect(a.provider).toBe("resend");
  });

  it("constructs MockEmailProvider for provider=mock", () => {
    const a = instantiateEmailAdapter({
      organization_id: "x",
      provider: "mock",
      encrypted_credentials: encryptJson({}),
      from_email: null,
      from_name: null,
      is_active: true,
    });
    expect(a).toBeInstanceOf(MockEmailProvider);
  });

  it("throws not_configured when is_active=false", () => {
    expect(() =>
      instantiateEmailAdapter({
        organization_id: "x",
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "x" }),
        from_email: "x@y.com",
        from_name: null,
        is_active: false,
      }),
    ).toThrow(CommsError);
  });

  it("throws invalid_args when from_email missing on resend", () => {
    expect(() =>
      instantiateEmailAdapter({
        organization_id: "x",
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "x" }),
        from_email: null,
        from_name: null,
        is_active: true,
      }),
    ).toThrow(/from_email required/);
  });

  it("throws provider_unsupported for postmark", () => {
    expect(() =>
      instantiateEmailAdapter({
        organization_id: "x",
        provider: "postmark",
        encrypted_credentials: encryptJson({}),
        from_email: "x@y.com",
        from_name: null,
        is_active: true,
      }),
    ).toThrow(/not yet supported/);
  });
});
