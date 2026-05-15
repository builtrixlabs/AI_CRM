import { beforeEach, describe, expect, it } from "vitest";
import { MockSmsProvider } from "@/lib/comms/sms/providers/mock";
import { CommsError } from "@/lib/comms/types";

let p: MockSmsProvider;
beforeEach(() => {
  p = new MockSmsProvider();
  p.reset();
});

describe("MockSmsProvider", () => {
  it("registered template sends + records to outbox", async () => {
    p.registerTemplate("welcome_dlt_42");
    const r = await p.send({
      kind: "templated",
      organization_id: "org-1",
      template_id: "welcome_dlt_42",
      to_phone_e164: "+919900011111",
      data: { name: "Patel" },
    });
    expect(r.provider_message_id).toMatch(/^mock-sms-/);
    expect(r.template_id).toBe("welcome_dlt_42");
    expect(p.getOutbox()).toHaveLength(1);
  });

  it("rejects unregistered DLT template with template_not_found", async () => {
    await expect(
      p.send({
        kind: "templated",
        organization_id: "org-1",
        template_id: "not_registered",
        to_phone_e164: "+919900011111",
        data: {},
      }),
    ).rejects.toMatchObject({
      name: "CommsError",
      kind: "template_not_found",
    });
  });

  it("rejects missing recipient", async () => {
    p.registerTemplate("t1");
    await expect(
      p.send({
        kind: "templated",
        organization_id: "org-1",
        template_id: "t1",
        to_phone_e164: "",
        data: {},
      }),
    ).rejects.toBeInstanceOf(CommsError);
  });

  it("seed constructor pre-fills the DLT registry without registerTemplate", async () => {
    const seeded = new MockSmsProvider(new Set(["follow_up_default"]));
    const r = await seeded.send({
      kind: "templated",
      organization_id: "org-1",
      template_id: "follow_up_default",
      to_phone_e164: "+919900011111",
      data: { name: "Patel" },
    });
    expect(r.template_id).toBe("follow_up_default");
    expect(seeded.getOutbox()).toHaveLength(1);
  });

  it("no-arg constructor still starts with an empty registry", async () => {
    const empty = new MockSmsProvider();
    await expect(
      empty.send({
        kind: "templated",
        organization_id: "org-1",
        template_id: "follow_up_default",
        to_phone_e164: "+919900011111",
        data: {},
      }),
    ).rejects.toMatchObject({ kind: "template_not_found" });
  });
});
