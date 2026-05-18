import { beforeEach, describe, expect, it } from "vitest";
import * as telephony from "@/lib/comms/telephony";
import * as email from "@/lib/comms/email";
import * as sms from "@/lib/comms/sms";
import { CommsError } from "@/lib/comms/types";

describe("provider registries (telephony / email / sms)", () => {
  beforeEach(() => {
    // Each test starts with an empty registry then re-registers the mock so
    // we get deterministic listProviders() output.
    telephony._resetRegistry();
    email._resetRegistry();
    sms._resetRegistry();
    telephony.registerProvider("mock", () => new telephony.MockTelephonyProvider());
    email.registerProvider("mock", () => new email.MockEmailProvider());
    sms.registerProvider("mock", () => new sms.MockSmsProvider());
  });

  it("listProviders returns the registered ids", () => {
    expect(telephony.listProviders()).toEqual(["mock"]);
    expect(email.listProviders()).toEqual(["mock"]);
    expect(sms.listProviders()).toEqual(["mock"]);
  });

  it("getProvider returns a fresh adapter instance per call (no state bleed)", () => {
    const a = telephony.getProvider("mock");
    const b = telephony.getProvider("mock");
    expect(a).not.toBe(b);
    expect(a.provider).toBe("mock");
  });

  it("getProvider throws CommsError for unregistered id", () => {
    expect(() => telephony.getProvider("exotel")).toThrow(CommsError);
    expect(() => email.getProvider("postmark")).toThrow(CommsError);
    expect(() => sms.getProvider("msg91")).toThrow(CommsError);
  });

  it("registerProvider replaces an existing factory", () => {
    let calls = 0;
    telephony.registerProvider("mock", () => {
      calls++;
      return new telephony.MockTelephonyProvider();
    });
    telephony.getProvider("mock");
    expect(calls).toBe(1);
  });
});
