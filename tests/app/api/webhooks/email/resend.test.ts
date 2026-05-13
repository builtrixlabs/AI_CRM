import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/email/resend/route";

function makeRequest(opts: { body?: unknown; contentType?: string }): Request {
  const body =
    opts.body === undefined
      ? "{}"
      : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
  return new Request("http://test/api/webhooks/email/resend", {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "application/json",
    },
    body,
  });
}

describe("POST /api/webhooks/email/resend", () => {
  it("returns 400 when body is invalid JSON", async () => {
    const res = await POST(makeRequest({ body: "{not json}" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_json_body");
  });

  it("returns 200 ok on an empty envelope (logs only)", async () => {
    const res = await POST(makeRequest({ body: {} }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 200 ok on a typical email.delivered envelope", async () => {
    const res = await POST(
      makeRequest({
        body: {
          type: "email.delivered",
          data: {
            email_id: "re-msg-1",
            to: "lead@example.com",
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  it("handles array `to` field by joining recipients", async () => {
    const res = await POST(
      makeRequest({
        body: {
          type: "email.bounced",
          data: {
            email_id: "re-msg-2",
            to: ["a@x.com", "b@x.com"],
          },
        },
      }),
    );
    expect(res.status).toBe(200);
  });
});
