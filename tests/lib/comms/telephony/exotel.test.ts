import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  ExotelTelephonyProvider,
  exotelTestPing,
  type ExotelConfig,
} from "@/lib/comms/telephony/providers/exotel";
import { CommsError } from "@/lib/comms/types";

const CFG: ExotelConfig = {
  credentials: {
    account_sid: "test-sid-12345",
    api_key: "test-api-key",
    api_token: "test-api-token",
  },
  virtual_number: "+91-22-99999999",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("ExotelTelephonyProvider — constructor", () => {
  it("requires account_sid", () => {
    expect(
      () =>
        new ExotelTelephonyProvider({
          ...CFG,
          credentials: { ...CFG.credentials, account_sid: "" },
        }),
    ).toThrow(CommsError);
  });
  it("requires api_key", () => {
    expect(
      () =>
        new ExotelTelephonyProvider({
          ...CFG,
          credentials: { ...CFG.credentials, api_key: "" },
        }),
    ).toThrow(/api_key required/);
  });
  it("requires api_token", () => {
    expect(
      () =>
        new ExotelTelephonyProvider({
          ...CFG,
          credentials: { ...CFG.credentials, api_token: "" },
        }),
    ).toThrow(/api_token required/);
  });
  it("requires virtual_number", () => {
    expect(
      () => new ExotelTelephonyProvider({ ...CFG, virtual_number: "" }),
    ).toThrow(/virtual_number required/);
  });
});

describe("ExotelTelephonyProvider — outboundClickToCall", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to Exotel with Basic auth and form-encoded body", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Call: { Sid: "EX-CALL-1" } }));
    const p = new ExotelTelephonyProvider(CFG);
    const out = await p.outboundClickToCall({
      organization_id: "00000000-0000-4000-8000-000000000000",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      from_user_id: "00000000-0000-4000-8000-000000000002",
      to_phone_e164: "+91-9999999999",
    });
    expect(out.provider_call_id).toBe("EX-CALL-1");
    expect(out.status).toEqual({ state: "queued" });

    const call = fetchSpy.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain("api.exotel.com");
    expect(url).toContain("/Calls/connect.json");
    expect(init.method).toBe("POST");
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Basic /);
    expect(init.body).toContain("From=");
    expect(init.body).toContain("To=");
  });

  it("D-609 — uses from_phone_e164 as the From leg when supplied (bridge mode)", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Call: { Sid: "EX-CALL-2" } }));
    const p = new ExotelTelephonyProvider(CFG);
    await p.outboundClickToCall({
      organization_id: "00000000-0000-4000-8000-000000000000",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      from_user_id: "00000000-0000-4000-8000-000000000002",
      from_phone_e164: "+919812345678",
      to_phone_e164: "+91-9999999999",
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const params = new URLSearchParams(String(init.body));
    // From = the rep's phone; CallerId stays the org's virtual number.
    expect(params.get("From")).toBe("+919812345678");
    expect(params.get("CallerId")).toBe(CFG.virtual_number);
  });

  it("D-609 — falls back to the virtual number for From when from_phone_e164 is omitted", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Call: { Sid: "EX-CALL-3" } }));
    const p = new ExotelTelephonyProvider(CFG);
    await p.outboundClickToCall({
      organization_id: "00000000-0000-4000-8000-000000000000",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      from_user_id: "00000000-0000-4000-8000-000000000002",
      to_phone_e164: "+91-9999999999",
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const params = new URLSearchParams(String(init.body));
    expect(params.get("From")).toBe(CFG.virtual_number);
  });

  it("rejects missing to_phone_e164", async () => {
    const p = new ExotelTelephonyProvider(CFG);
    await expect(
      p.outboundClickToCall({
        organization_id: "x",
        workspace_id: "y",
        from_user_id: "z",
        to_phone_e164: "",
      }),
    ).rejects.toThrow(/to_phone_e164/);
  });

  it("wraps non-2xx HTTP responses as provider_error", async () => {
    fetchSpy.mockResolvedValue(
      new Response("server is upset", { status: 500 }),
    );
    const p = new ExotelTelephonyProvider(CFG);
    await expect(
      p.outboundClickToCall({
        organization_id: "x",
        workspace_id: "y",
        from_user_id: "z",
        to_phone_e164: "+91-9999999999",
      }),
    ).rejects.toThrow(/exotel http 500/);
  });

  it("rejects responses missing Call.Sid", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Call: {} }));
    const p = new ExotelTelephonyProvider(CFG);
    await expect(
      p.outboundClickToCall({
        organization_id: "x",
        workspace_id: "y",
        from_user_id: "z",
        to_phone_e164: "+91-9999999999",
      }),
    ).rejects.toThrow(/missing Call.Sid/);
  });
});

describe("ExotelTelephonyProvider — lookupCallStatus", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns null on 404", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 404 }));
    const p = new ExotelTelephonyProvider(CFG);
    expect(await p.lookupCallStatus("missing-sid")).toBeNull();
  });

  it("maps 'in-progress' to ringing", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ Call: { Status: "in-progress" } }),
    );
    const p = new ExotelTelephonyProvider(CFG);
    const s = await p.lookupCallStatus("ex-1");
    expect(s).toEqual({ state: "ringing", provider_call_id: "ex-1" });
  });

  it("maps 'completed' to ended with duration", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        Call: {
          Status: "completed",
          Duration: "127",
          EndTime: "2026-05-12T10:00:00Z",
        },
      }),
    );
    const p = new ExotelTelephonyProvider(CFG);
    const s = await p.lookupCallStatus("ex-1");
    expect(s).toEqual({
      state: "ended",
      provider_call_id: "ex-1",
      ended_at: "2026-05-12T10:00:00Z",
      duration_s: 127,
    });
  });

  it("maps 'busy' / 'no-answer' / 'failed' to failed", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Call: { Status: "busy" } }));
    const p = new ExotelTelephonyProvider(CFG);
    const s = await p.lookupCallStatus("ex-1");
    expect(s).toEqual({
      state: "failed",
      provider_call_id: "ex-1",
      reason: "busy",
    });
  });
});

describe("exotelTestPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok=true on 200", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ Account: {} }));
    const r = await exotelTestPing(CFG.credentials);
    expect(r).toEqual({ ok: true, message: "credentials verified" });
  });

  it("maps 401 to invalid-credentials message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
    const r = await exotelTestPing(CFG.credentials);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401.*invalid/);
  });

  it("maps 404 to account_sid-not-found message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 404 }));
    const r = await exotelTestPing(CFG.credentials);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/404.*account_sid/);
  });

  it("returns ok=false on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    const r = await exotelTestPing(CFG.credentials);
    expect(r.ok).toBe(false);
    expect(r.message).toBe("boom");
  });

  it("returns ok=false on missing credentials without contacting Exotel", async () => {
    const r = await exotelTestPing({
      account_sid: "",
      api_key: "",
      api_token: "",
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing credentials/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
