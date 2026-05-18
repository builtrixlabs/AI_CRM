import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  GupshupWhatsAppProvider,
  gupshupTestPing,
  type GupshupConfig,
} from "@/lib/comms/whatsapp/providers/gupshup";
import { CommsError } from "@/lib/comms/types";

const CFG: GupshupConfig = {
  credentials: { api_key: "gs_test_key", app_name: "test_app" },
  from_display_number: "+919999999999",
  allowed_templates: new Set(["welcome_v3"]),
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("GupshupWhatsAppProvider — constructor", () => {
  it("requires api_key", () => {
    expect(
      () =>
        new GupshupWhatsAppProvider({
          ...CFG,
          credentials: { api_key: "" },
        }),
    ).toThrow(CommsError);
  });
  it("requires from_display_number", () => {
    expect(
      () =>
        new GupshupWhatsAppProvider({ ...CFG, from_display_number: "" }),
    ).toThrow(/from_display_number required/);
  });
});

describe("GupshupWhatsAppProvider — send", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs Gupshup template/msg with apikey header + form-encoded body", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ status: "submitted", messageId: "gs-msg-1" }),
    );
    const p = new GupshupWhatsAppProvider(CFG);
    const out = await p.send({
      kind: "template",
      organization_id: "org-1",
      template_id: "welcome_v3",
      to_phone_e164: "+919876543210",
      data: { var1: "Alice", var2: "Casagrand" },
    });
    expect(out.provider_message_id).toBe("gs-msg-1");
    expect(out.template_id).toBe("welcome_v3");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("gs_test_key");
    const params = new URLSearchParams(init.body as string);
    expect(params.get("source")).toBe("919999999999");
    expect(params.get("destination")).toBe("919876543210");
    const tmpl = JSON.parse(params.get("template")!) as {
      id: string;
      params: string[];
    };
    expect(tmpl.id).toBe("welcome_v3");
    expect(tmpl.params).toEqual(["Alice", "Casagrand"]);
  });

  it("rejects sends with unregistered template_id", async () => {
    const p = new GupshupWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "org-1",
        template_id: "UNREGISTERED",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/not in approved registry/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wraps non-2xx HTTP responses as provider_error", async () => {
    fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const p = new GupshupWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "welcome_v3",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/gupshup http 429/);
  });

  it("rejects non-submitted status envelopes", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ status: "error", message: "bad template" }),
    );
    const p = new GupshupWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "welcome_v3",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/gupshup rejected: bad template/);
  });

  it("rejects responses missing messageId", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ status: "submitted" }));
    const p = new GupshupWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "welcome_v3",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/missing messageId/);
  });
});

describe("gupshupTestPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok=true on 200", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ app: "ok" }));
    const r = await gupshupTestPing({ api_key: "gs_test_key", app_name: "x" });
    expect(r).toEqual({ ok: true, message: "api key verified" });
  });

  it("maps 401 to invalid-api_key message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
    const r = await gupshupTestPing({ api_key: "gs_test_key" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401.*invalid/);
  });

  it("returns ok=false on missing credentials", async () => {
    const r = await gupshupTestPing({ api_key: "" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing credentials/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
