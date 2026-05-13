import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  ResendEmailProvider,
  resendTestPing,
  type ResendConfig,
} from "@/lib/comms/email/providers/resend";
import { CommsError } from "@/lib/comms/types";

const CFG: ResendConfig = {
  credentials: { api_key: "re_test_key" },
  from_email: "hello@example.com",
  from_name: "Example Org",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("ResendEmailProvider — constructor", () => {
  it("requires api_key", () => {
    expect(
      () =>
        new ResendEmailProvider({
          ...CFG,
          credentials: { api_key: "" },
        }),
    ).toThrow(CommsError);
  });
  it("requires from_email", () => {
    expect(
      () => new ResendEmailProvider({ ...CFG, from_email: "" }),
    ).toThrow(/from_email required/);
  });
});

describe("ResendEmailProvider — send", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to Resend with Bearer auth and JSON body", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: "re-msg-1" }));
    const p = new ResendEmailProvider(CFG);
    const out = await p.send({
      kind: "custom",
      organization_id: "org-1",
      to: "lead@example.com",
      subject: "Welcome",
      body_text: "Hi there",
    });
    expect(out.provider_message_id).toBe("re-msg-1");
    expect(out.thread_id).toBe("re-msg-1");

    const call = fetchSpy.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer re_test_key");
    const sent = JSON.parse(init.body as string) as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(sent.from).toBe("Example Org <hello@example.com>");
    expect(sent.to).toBe("lead@example.com");
    expect(sent.subject).toBe("Welcome");
    expect(sent.text).toBe("Hi there");
  });

  it("uses bare from_email when no from_name is configured", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: "re-msg-2" }));
    const p = new ResendEmailProvider({ ...CFG, from_name: null });
    await p.send({
      kind: "custom",
      organization_id: "org-1",
      to: "lead@example.com",
      subject: "Hi",
      body_text: "x",
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { from: string };
    expect(sent.from).toBe("hello@example.com");
  });

  it("rejects templated mode (deferred to a follow-up directive)", async () => {
    const p = new ResendEmailProvider(CFG);
    await expect(
      p.send({
        kind: "templated",
        organization_id: "org-1",
        to: "x@y",
        template_id: "t-1",
        data: {},
      }),
    ).rejects.toThrow(/templated mode/);
  });

  it("rejects missing to / subject", async () => {
    const p = new ResendEmailProvider(CFG);
    await expect(
      p.send({
        kind: "custom",
        organization_id: "x",
        to: "",
        subject: "x",
        body_text: "x",
      }),
    ).rejects.toThrow(/missing to/);
    await expect(
      p.send({
        kind: "custom",
        organization_id: "x",
        to: "x@y",
        subject: "",
        body_text: "x",
      }),
    ).rejects.toThrow(/requires subject/);
  });

  it("wraps non-2xx HTTP responses as provider_error", async () => {
    fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const p = new ResendEmailProvider(CFG);
    await expect(
      p.send({
        kind: "custom",
        organization_id: "x",
        to: "x@y",
        subject: "s",
        body_text: "b",
      }),
    ).rejects.toThrow(/resend http 429/);
  });

  it("rejects responses missing id", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}));
    const p = new ResendEmailProvider(CFG);
    await expect(
      p.send({
        kind: "custom",
        organization_id: "x",
        to: "x@y",
        subject: "s",
        body_text: "b",
      }),
    ).rejects.toThrow(/missing id/);
  });
});

describe("resendTestPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok=true on 200", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ data: [] }));
    const r = await resendTestPing({ api_key: "re_test_key" });
    expect(r).toEqual({ ok: true, message: "api key verified" });
  });

  it("maps 401 to invalid-api_key message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
    const r = await resendTestPing({ api_key: "re_test_key" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401.*invalid/);
  });

  it("maps 403 to access-denied message", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 403 }));
    const r = await resendTestPing({ api_key: "re_test_key" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/403/);
  });

  it("returns ok=false on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    const r = await resendTestPing({ api_key: "re_test_key" });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("boom");
  });

  it("returns ok=false on missing credentials without contacting Resend", async () => {
    const r = await resendTestPing({ api_key: "" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing credentials/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
