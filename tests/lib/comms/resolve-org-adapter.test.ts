import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";
import { encryptJson } from "@/lib/comms/encryption";
import { ResendEmailProvider } from "@/lib/comms/email/providers/resend";
import { MockEmailProvider } from "@/lib/comms/email/providers/mock";
import { Msg91SmsProvider } from "@/lib/comms/sms/providers/msg91";
import { GupshupWhatsAppProvider } from "@/lib/comms/whatsapp/providers/gupshup";
import { ExotelTelephonyProvider } from "@/lib/comms/telephony/providers/exotel";

const ORG = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4333-8444-555555555555";

/**
 * Mock Supabase client. Rows keyed by table name. The `.eq("organization_id",
 * …)` filter is replicated so a cross-tenant read returns no row — the
 * unit-level proof of the resolver's tenant guard.
 */
function makeClient(
  rows: Partial<Record<string, Record<string, unknown>>>,
): SupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.maybeSingle = () => {
            const row = rows[table];
            if (!row) return Promise.resolve({ data: null, error: null });
            if (filters.organization_id !== row.organization_id)
              return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: row, error: null });
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("resolveOrgAdapter — email", () => {
  it("missing config row → not_configured", async () => {
    const r = await resolveOrgAdapter("email", ORG, makeClient({}));
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("inactive config row → not_configured", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "re_test" }),
        from_email: "hello@example.com",
        from_name: null,
        is_active: false,
      },
    });
    const r = await resolveOrgAdapter("email", ORG, client);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("valid resend row → ok with ResendEmailProvider", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "re_test" }),
        from_email: "hello@example.com",
        from_name: null,
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("email", ORG, client);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("resend");
      expect(r.adapter).toBeInstanceOf(ResendEmailProvider);
    }
  });

  it("postmark (unsupported) → provider_error", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "postmark",
        encrypted_credentials: encryptJson({}),
        from_email: "x@y.com",
        from_name: null,
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("email", ORG, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("resend missing from_email → provider_error", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "re_test" }),
        from_email: null,
        from_name: null,
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("email", ORG, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("mock row → ok with provider=mock", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "mock",
        encrypted_credentials: encryptJson({}),
        from_email: null,
        from_name: null,
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("email", ORG, client);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("mock");
      expect(r.adapter).toBeInstanceOf(MockEmailProvider);
    }
  });
});

describe("resolveOrgAdapter — sms", () => {
  it("missing config row → not_configured", async () => {
    const r = await resolveOrgAdapter("sms", ORG, makeClient({}));
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("inactive config row → not_configured", async () => {
    const client = makeClient({
      org_sms_config: {
        organization_id: ORG,
        provider: "msg91",
        encrypted_credentials: encryptJson({ authkey: "test-authkey" }),
        sender_id: "BLTRIX",
        dlt_entity_id: "1701",
        is_active: false,
      },
    });
    const r = await resolveOrgAdapter("sms", ORG, client);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("valid msg91 row → ok with Msg91SmsProvider", async () => {
    const client = makeClient({
      org_sms_config: {
        organization_id: ORG,
        provider: "msg91",
        encrypted_credentials: encryptJson({ authkey: "test-authkey" }),
        sender_id: "BLTRIX",
        dlt_entity_id: "1701",
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("sms", ORG, client, new Set(["1707T"]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("msg91");
      expect(r.adapter).toBeInstanceOf(Msg91SmsProvider);
    }
  });

  it("msg91 missing sender_id → provider_error", async () => {
    const client = makeClient({
      org_sms_config: {
        organization_id: ORG,
        provider: "msg91",
        encrypted_credentials: encryptJson({ authkey: "test-authkey" }),
        sender_id: null,
        dlt_entity_id: "1701",
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("sms", ORG, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("gupshup (unsupported) → provider_error", async () => {
    const client = makeClient({
      org_sms_config: {
        organization_id: ORG,
        provider: "gupshup",
        encrypted_credentials: encryptJson({}),
        sender_id: "BLTRIX",
        dlt_entity_id: "1701",
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("sms", ORG, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("threads allowedTemplates into the resolved adapter", async () => {
    const client = makeClient({
      org_sms_config: {
        organization_id: ORG,
        provider: "mock",
        encrypted_credentials: encryptJson({}),
        sender_id: null,
        dlt_entity_id: null,
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter(
      "sms",
      ORG,
      client,
      new Set(["follow_up_default"]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const sent = await r.adapter.send({
        kind: "templated",
        organization_id: ORG,
        template_id: "follow_up_default",
        to_phone_e164: "+919900011111",
        data: {},
      });
      expect(sent.template_id).toBe("follow_up_default");
    }
  });
});

describe("resolveOrgAdapter — whatsapp", () => {
  it("missing config row → not_configured", async () => {
    const r = await resolveOrgAdapter("whatsapp", ORG, makeClient({}));
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("raw active=false → not_configured (active→is_active mapping)", async () => {
    const client = makeClient({
      org_whatsapp_endpoints: {
        organization_id: ORG,
        provider: "gupshup",
        encrypted_credentials: encryptJson({
          api_key: "gs_test",
          app_name: "x",
        }),
        from_phone_number_id: null,
        from_display_number: "+919999999999",
        approved_template_ids: ["follow_up_default"],
        active: false,
      },
    });
    const r = await resolveOrgAdapter("whatsapp", ORG, client);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });

  it("valid gupshup with raw active=true → ok (active→is_active mapping)", async () => {
    const client = makeClient({
      org_whatsapp_endpoints: {
        organization_id: ORG,
        provider: "gupshup",
        encrypted_credentials: encryptJson({
          api_key: "gs_test",
          app_name: "x",
        }),
        from_phone_number_id: null,
        from_display_number: "+919999999999",
        approved_template_ids: ["follow_up_default"],
        active: true,
      },
    });
    const r = await resolveOrgAdapter("whatsapp", ORG, client);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("gupshup");
      expect(r.adapter).toBeInstanceOf(GupshupWhatsAppProvider);
    }
  });

  it("gupshup missing from_display_number → provider_error", async () => {
    const client = makeClient({
      org_whatsapp_endpoints: {
        organization_id: ORG,
        provider: "gupshup",
        encrypted_credentials: encryptJson({
          api_key: "gs_test",
          app_name: "x",
        }),
        from_phone_number_id: null,
        from_display_number: null,
        approved_template_ids: [],
        active: true,
      },
    });
    const r = await resolveOrgAdapter("whatsapp", ORG, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("provider=null endpoint row → not_configured", async () => {
    const client = makeClient({
      org_whatsapp_endpoints: {
        organization_id: ORG,
        provider: null,
        encrypted_credentials: null,
        from_phone_number_id: null,
        from_display_number: null,
        approved_template_ids: [],
        active: true,
      },
    });
    const r = await resolveOrgAdapter("whatsapp", ORG, client);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("resolveOrgAdapter — telephony", () => {
  it("valid exotel row → ok with ExotelTelephonyProvider", async () => {
    const client = makeClient({
      org_telephony_config: {
        organization_id: ORG,
        provider: "exotel",
        encrypted_credentials: encryptJson({
          account_sid: "test-sid",
          api_key: "test-key",
          api_token: "test-token",
        }),
        virtual_number: "+91-22-99999999",
        is_active: true,
      },
    });
    const r = await resolveOrgAdapter("telephony", ORG, client);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("exotel");
      expect(r.adapter).toBeInstanceOf(ExotelTelephonyProvider);
    }
  });

  it("missing config row → not_configured", async () => {
    const r = await resolveOrgAdapter("telephony", ORG, makeClient({}));
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("resolveOrgAdapter — cross-tenant isolation", () => {
  it("org B cannot resolve org A's config row", async () => {
    const client = makeClient({
      org_email_config: {
        organization_id: ORG,
        provider: "resend",
        encrypted_credentials: encryptJson({ api_key: "re_test" }),
        from_email: "a@example.com",
        from_name: null,
        is_active: true,
      },
    });
    // The .eq("organization_id", ORG_B) filter must exclude ORG's row.
    const rB = await resolveOrgAdapter("email", ORG_B, client);
    expect(rB).toEqual({ ok: false, reason: "not_configured" });
    // Sanity: ORG itself still resolves.
    const rA = await resolveOrgAdapter("email", ORG, client);
    expect(rA.ok).toBe(true);
  });
});
