import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CloudApiWhatsAppProvider,
  cloudApiTestPing,
  type CloudApiConfig,
} from "@/lib/comms/whatsapp/providers/cloud-api";
import { CommsError } from "@/lib/comms/types";

const CFG: CloudApiConfig = {
  credentials: { access_token: "EAA-test" },
  from_phone_number_id: "1234567890123456",
  allowed_templates: new Set(["welcome_v3"]),
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("CloudApiWhatsAppProvider — constructor", () => {
  it("requires access_token", () => {
    expect(
      () =>
        new CloudApiWhatsAppProvider({
          ...CFG,
          credentials: { access_token: "" },
        }),
    ).toThrow(CommsError);
  });
  it("requires from_phone_number_id", () => {
    expect(
      () =>
        new CloudApiWhatsAppProvider({
          ...CFG,
          from_phone_number_id: "",
        }),
    ).toThrow(/from_phone_number_id required/);
  });
});

describe("CloudApiWhatsAppProvider — send", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs Graph API messages with Bearer auth + JSON body", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.xx" }] }),
    );
    const p = new CloudApiWhatsAppProvider(CFG);
    const out = await p.send({
      kind: "template",
      organization_id: "org-1",
      template_id: "welcome_v3",
      to_phone_e164: "+919876543210",
      data: { var1: "Alice", var2: "Casagrand" },
    });
    expect(out.provider_message_id).toBe("wamid.xx");

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("graph.facebook.com");
    expect(url).toContain("/v17.0/1234567890123456/messages");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer EAA-test");

    const body = JSON.parse(init.body as string) as {
      messaging_product: string;
      to: string;
      type: string;
      template: {
        name: string;
        language: { code: string };
        components: Array<{
          type: string;
          parameters: Array<{ type: string; text: string }>;
        }>;
      };
    };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("919876543210");
    expect(body.template.name).toBe("welcome_v3");
    expect(body.template.language.code).toBe("en_US");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "Alice" },
      { type: "text", text: "Casagrand" },
    ]);
  });

  it("respects language_code override", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.yy" }] }),
    );
    const p = new CloudApiWhatsAppProvider(CFG);
    await p.send({
      kind: "template",
      organization_id: "org-1",
      template_id: "welcome_v3",
      to_phone_e164: "+919876543210",
      language_code: "hi",
      data: {},
    });
    const body = JSON.parse(
      fetchSpy.mock.calls[0][1]!.body as string,
    ) as { template: { language: { code: string } } };
    expect(body.template.language.code).toBe("hi");
  });

  it("rejects sends with unregistered template_id", async () => {
    const p = new CloudApiWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "UNREGISTERED",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/not in approved registry/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wraps non-2xx HTTP responses as provider_error", async () => {
    fetchSpy.mockResolvedValue(new Response("err", { status: 500 }));
    const p = new CloudApiWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "welcome_v3",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/cloud_api http 500/);
  });

  it("rejects responses missing message id", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ messages: [] }));
    const p = new CloudApiWhatsAppProvider(CFG);
    await expect(
      p.send({
        kind: "template",
        organization_id: "x",
        template_id: "welcome_v3",
        to_phone_e164: "+919876543210",
        data: {},
      }),
    ).rejects.toThrow(/missing message id/);
  });
});

describe("cloudApiTestPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok=true on 200", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: "1234567890123456" }));
    const r = await cloudApiTestPing(
      { access_token: "EAA-test" },
      "1234567890123456",
    );
    expect(r).toEqual({ ok: true, message: "access token verified" });
  });

  it("maps 401 to invalid-access_token message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
    const r = await cloudApiTestPing(
      { access_token: "EAA-test" },
      "1234567890123456",
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401.*invalid access_token/);
  });

  it("maps 404 to phone_number_id-not-found message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 404 }));
    const r = await cloudApiTestPing(
      { access_token: "EAA-test" },
      "missing",
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/404.*phone_number_id/);
  });

  it("returns ok=false on missing credentials", async () => {
    const r = await cloudApiTestPing({ access_token: "" }, "1234567890");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing credentials/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
