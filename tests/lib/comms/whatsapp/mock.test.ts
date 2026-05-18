import { describe, expect, it } from "vitest";
import { MockWhatsAppProvider } from "@/lib/comms/whatsapp/providers/mock";
import { CommsError } from "@/lib/comms/types";

describe("MockWhatsAppProvider", () => {
  it("approved template sends + records to outbox", async () => {
    const p = new MockWhatsAppProvider();
    p.approveTemplate("welcome_v3");
    const r = await p.send({
      kind: "template",
      organization_id: "org-1",
      template_id: "welcome_v3",
      to_phone_e164: "+919900011111",
      data: { name: "Patel" },
    });
    expect(r.provider_message_id).toMatch(/^mock-wa-/);
    expect(r.template_id).toBe("welcome_v3");
    expect(p.getOutbox()).toHaveLength(1);
  });

  it("rejects unapproved template with template_not_found", async () => {
    const p = new MockWhatsAppProvider();
    await expect(
      p.send({
        kind: "template",
        organization_id: "org-1",
        template_id: "not_approved",
        to_phone_e164: "+919900011111",
        data: {},
      }),
    ).rejects.toMatchObject({ name: "CommsError", kind: "template_not_found" });
  });

  it("rejects missing recipient", async () => {
    const p = new MockWhatsAppProvider();
    p.approveTemplate("t1");
    await expect(
      p.send({
        kind: "template",
        organization_id: "org-1",
        template_id: "t1",
        to_phone_e164: "",
        data: {},
      }),
    ).rejects.toBeInstanceOf(CommsError);
  });

  it("seed constructor pre-fills the approved-template registry", async () => {
    const seeded = new MockWhatsAppProvider(new Set(["follow_up_default"]));
    const r = await seeded.send({
      kind: "template",
      organization_id: "org-1",
      template_id: "follow_up_default",
      to_phone_e164: "+919900011111",
      data: { name: "Patel" },
    });
    expect(r.template_id).toBe("follow_up_default");
    expect(seeded.getOutbox()).toHaveLength(1);
  });

  it("no-arg constructor still starts with an empty registry", async () => {
    const empty = new MockWhatsAppProvider();
    await expect(
      empty.send({
        kind: "template",
        organization_id: "org-1",
        template_id: "follow_up_default",
        to_phone_e164: "+919900011111",
        data: {},
      }),
    ).rejects.toMatchObject({ kind: "template_not_found" });
  });
});
