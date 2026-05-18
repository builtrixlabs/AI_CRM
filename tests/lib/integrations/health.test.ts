import { describe, expect, it } from "vitest";
import {
  buildTelephonyHealth,
  buildEmailHealth,
  buildSmsHealth,
  buildWhatsAppHealth,
  buildVoiceIqHealth,
} from "@/lib/integrations/health";

describe("buildTelephonyHealth", () => {
  it("reports not_configured when no row exists", () => {
    const h = buildTelephonyHealth(null);
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/No credentials saved/i);
    expect(h.last_check_at).toBeNull();
  });

  it("reports not_configured when row exists but is_configured=false", () => {
    const h = buildTelephonyHealth({
      is_configured: false,
      is_active: false,
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("not_configured");
  });

  it("reports not_configured (deactivated) when is_active=false", () => {
    const h = buildTelephonyHealth({
      is_configured: true,
      is_active: false,
      test_ping_at: "2026-05-12T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: null,
    });
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/Deactivated/);
    expect(h.last_check_at).toBe("2026-05-12T10:00:00Z");
  });

  it("reports warning when active but never test-pinged", () => {
    const h = buildTelephonyHealth({
      is_configured: true,
      is_active: true,
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/never test-pinged/i);
  });

  it("reports warning when active + last test_ping_ok=false", () => {
    const h = buildTelephonyHealth({
      is_configured: true,
      is_active: true,
      test_ping_at: "2026-05-12T11:00:00Z",
      test_ping_ok: false,
      test_ping_message: "401 — invalid api_key",
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toBe("401 — invalid api_key");
    expect(h.last_check_at).toBe("2026-05-12T11:00:00Z");
  });

  it("reports warning with a fallback message when test_ping_message is missing", () => {
    const h = buildTelephonyHealth({
      is_configured: true,
      is_active: true,
      test_ping_at: "2026-05-12T11:00:00Z",
      test_ping_ok: false,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/Last test ping failed/);
  });

  it("reports healthy when active + last test_ping_ok=true", () => {
    const h = buildTelephonyHealth({
      is_configured: true,
      is_active: true,
      test_ping_at: "2026-05-12T11:00:00Z",
      test_ping_ok: true,
      test_ping_message: "credentials verified",
    });
    expect(h.status).toBe("healthy");
    expect(h.detail).toBe("Test ping ok");
    expect(h.last_check_at).toBe("2026-05-12T11:00:00Z");
  });
});

describe("buildEmailHealth", () => {
  it("reports not_configured when no row exists", () => {
    const h = buildEmailHealth(null);
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/No credentials saved/i);
  });

  it("reports not_configured (deactivated) when is_active=false", () => {
    const h = buildEmailHealth({
      is_configured: true,
      is_active: false,
      from_email: "x@y.com",
      verified_at: null,
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: null,
    });
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/Deactivated/);
  });

  it("reports warning when active but from_email is missing", () => {
    const h = buildEmailHealth({
      is_configured: true,
      is_active: true,
      from_email: null,
      verified_at: null,
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/no from_email/i);
  });

  it("reports warning when active but never test-pinged", () => {
    const h = buildEmailHealth({
      is_configured: true,
      is_active: true,
      from_email: "x@y.com",
      verified_at: null,
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/never test-pinged/i);
  });

  it("reports warning when active + last test_ping_ok=false", () => {
    const h = buildEmailHealth({
      is_configured: true,
      is_active: true,
      from_email: "x@y.com",
      verified_at: null,
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: false,
      test_ping_message: "401 — invalid api_key",
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toBe("401 — invalid api_key");
  });

  it("reports healthy when active + from_email set + last test_ping_ok=true", () => {
    const h = buildEmailHealth({
      is_configured: true,
      is_active: true,
      from_email: "x@y.com",
      verified_at: "2026-05-13T09:00:00Z",
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: "api key verified",
    });
    expect(h.status).toBe("healthy");
    expect(h.last_check_at).toBe("2026-05-13T10:00:00Z");
  });
});

describe("buildSmsHealth", () => {
  it("reports not_configured when no row exists", () => {
    const h = buildSmsHealth(null);
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/No credentials saved/i);
  });

  it("reports not_configured (deactivated) when is_active=false", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: false,
      sender_id: "BLTRIX",
      dlt_entity_id: "1701",
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: null,
    });
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/Deactivated/);
  });

  it("reports warning when active but sender_id missing", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: true,
      sender_id: null,
      dlt_entity_id: "1701",
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/sender_id \/ dlt_entity_id missing/i);
  });

  it("reports warning when active but dlt_entity_id missing", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: true,
      sender_id: "BLTRIX",
      dlt_entity_id: null,
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
  });

  it("reports warning when active but never test-pinged", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: true,
      sender_id: "BLTRIX",
      dlt_entity_id: "1701",
      test_ping_at: null,
      test_ping_ok: null,
      test_ping_message: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/never test-pinged/i);
  });

  it("reports warning when active + last test_ping_ok=false", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: true,
      sender_id: "BLTRIX",
      dlt_entity_id: "1701",
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: false,
      test_ping_message: "401 — invalid authkey",
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toBe("401 — invalid authkey");
  });

  it("reports healthy when active + DLT bits set + last test_ping_ok=true", () => {
    const h = buildSmsHealth({
      is_configured: true,
      is_active: true,
      sender_id: "BLTRIX",
      dlt_entity_id: "1701",
      test_ping_at: "2026-05-13T10:00:00Z",
      test_ping_ok: true,
      test_ping_message: "authkey verified",
    });
    expect(h.status).toBe("healthy");
    expect(h.last_check_at).toBe("2026-05-13T10:00:00Z");
  });
});

describe("buildWhatsAppHealth", () => {
  const baseHealthy = {
    is_configured: true,
    is_active: true,
    provider: "gupshup" as const,
    from_phone_number_id: null,
    from_display_number: "+919999999999",
    approved_templates_count: 3,
    test_ping_at: "2026-05-13T10:00:00Z",
    test_ping_ok: true,
    test_ping_message: null,
  };

  it("reports not_configured when no row exists", () => {
    const h = buildWhatsAppHealth(null);
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/No credentials saved/i);
  });

  it("reports not_configured (deactivated) when is_active=false", () => {
    const h = buildWhatsAppHealth({ ...baseHealthy, is_active: false });
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/Deactivated/);
  });

  it("reports warning when gupshup active but from_display_number missing", () => {
    const h = buildWhatsAppHealth({
      ...baseHealthy,
      from_display_number: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/Gupshup active but from_display_number missing/);
  });

  it("reports warning when cloud_api active but from_phone_number_id missing", () => {
    const h = buildWhatsAppHealth({
      ...baseHealthy,
      provider: "cloud_api",
      from_display_number: null,
      from_phone_number_id: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/Cloud API active but from_phone_number_id missing/);
  });

  it("reports warning when no approved templates registered", () => {
    const h = buildWhatsAppHealth({ ...baseHealthy, approved_templates_count: 0 });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/no approved templates registered/i);
  });

  it("reports warning when active but never test-pinged", () => {
    const h = buildWhatsAppHealth({
      ...baseHealthy,
      test_ping_at: null,
      test_ping_ok: null,
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toMatch(/never test-pinged/i);
  });

  it("reports warning when active + last test_ping_ok=false", () => {
    const h = buildWhatsAppHealth({
      ...baseHealthy,
      test_ping_ok: false,
      test_ping_message: "401 — invalid api_key",
    });
    expect(h.status).toBe("warning");
    expect(h.detail).toBe("401 — invalid api_key");
  });

  it("reports healthy when active + provider routing set + last test_ping_ok=true", () => {
    const h = buildWhatsAppHealth(baseHealthy);
    expect(h.status).toBe("healthy");
    expect(h.last_check_at).toBe("2026-05-13T10:00:00Z");
  });
});

describe("buildVoiceIqHealth", () => {
  it("reports not_configured when secret row is missing", () => {
    const h = buildVoiceIqHealth(null);
    expect(h.status).toBe("not_configured");
    expect(h.detail).toMatch(/HMAC secret not set/i);
    expect(h.last_check_at).toBeNull();
  });

  it("reports healthy when secret is present, surfacing rotated_at", () => {
    const h = buildVoiceIqHealth({ rotated_at: "2026-05-10T10:00:00Z" });
    expect(h.status).toBe("healthy");
    expect(h.detail).toMatch(/HMAC secret configured/i);
    expect(h.last_check_at).toBe("2026-05-10T10:00:00Z");
  });
});
