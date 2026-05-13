import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  Msg91SmsProvider,
  msg91TestPing,
  type Msg91Config,
} from "@/lib/comms/sms/providers/msg91";
import { CommsError } from "@/lib/comms/types";

const CFG: Msg91Config = {
  credentials: { authkey: "test-authkey" },
  sender_id: "BLTRIX",
  allowed_templates: new Set(["1707TEMPL"]),
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Msg91SmsProvider — constructor", () => {
  it("requires authkey", () => {
    expect(
      () =>
        new Msg91SmsProvider({
          ...CFG,
          credentials: { authkey: "" },
        }),
    ).toThrow(CommsError);
  });
  it("requires sender_id", () => {
    expect(() => new Msg91SmsProvider({ ...CFG, sender_id: "" })).toThrow(
      /sender_id required/,
    );
  });
});

describe("Msg91SmsProvider — send", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to MSG91 v5 flow with authkey header + JSON body", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ type: "success", request_id: "rq-1" }),
    );
    const p = new Msg91SmsProvider(CFG);
    const out = await p.send({
      kind: "templated",
      organization_id: "org-1",
      template_id: "1707TEMPL",
      to_phone_e164: "+919999999999",
      data: { var1: "Alice", var2: "tomorrow" },
    });
    expect(out.provider_message_id).toBe("rq-1");
    expect(out.template_id).toBe("1707TEMPL");

    const call = fetchSpy.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authkey).toBe("test-authkey");
    const sent = JSON.parse(init.body as string) as {
      template_id: string;
      sender: string;
      recipients: Array<{ mobiles: string; var1?: string; var2?: string }>;
    };
    expect(sent.template_id).toBe("1707TEMPL");
    expect(sent.sender).toBe("BLTRIX");
    expect(sent.recipients[0].mobiles).toBe("919999999999"); // leading + stripped
    expect(sent.recipients[0].var1).toBe("Alice");
    expect(sent.recipients[0].var2).toBe("tomorrow");
  });

  it("rejects sends with a template_id not in the org's DLT registry", async () => {
    const p = new Msg91SmsProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "org-1",
        template_id: "UNREGISTERED",
        to_phone_e164: "+919999999999",
        data: {},
      }),
    ).rejects.toThrow(/Template not in DLT registry/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects missing to_phone_e164 / organization_id", async () => {
    const p = new Msg91SmsProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "x",
        template_id: "1707TEMPL",
        to_phone_e164: "",
        data: {},
      }),
    ).rejects.toThrow(/missing to_phone_e164/);
  });

  it("wraps non-2xx HTTP responses as provider_error", async () => {
    fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const p = new Msg91SmsProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "x",
        template_id: "1707TEMPL",
        to_phone_e164: "+919999999999",
        data: {},
      }),
    ).rejects.toThrow(/msg91 http 429/);
  });

  it("wraps MSG91 non-success envelopes as provider_error", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ type: "error", message: "Invalid template" }),
    );
    const p = new Msg91SmsProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "x",
        template_id: "1707TEMPL",
        to_phone_e164: "+919999999999",
        data: {},
      }),
    ).rejects.toThrow(/msg91 rejected: Invalid template/);
  });

  it("rejects responses missing request_id", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ type: "success" }));
    const p = new Msg91SmsProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "x",
        template_id: "1707TEMPL",
        to_phone_e164: "+919999999999",
        data: {},
      }),
    ).rejects.toThrow(/missing request_id/);
  });
});

describe("msg91TestPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok=true with balance on success", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ type: "success", balance: 1500 }),
    );
    const r = await msg91TestPing({ authkey: "test-authkey" });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/balance: 1500/);
  });

  it("returns ok=false on non-success envelope", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ type: "error" }));
    const r = await msg91TestPing({ authkey: "test-authkey" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/non-success response/);
  });

  it("maps 401 to invalid-authkey message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
    const r = await msg91TestPing({ authkey: "test-authkey" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401.*invalid authkey/);
  });

  it("returns ok=false on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    const r = await msg91TestPing({ authkey: "test-authkey" });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("boom");
  });

  it("returns ok=false on missing credentials without contacting MSG91", async () => {
    const r = await msg91TestPing({ authkey: "" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing credentials/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
