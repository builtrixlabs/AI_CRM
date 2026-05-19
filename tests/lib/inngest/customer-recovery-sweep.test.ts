import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runRecoverySweep: vi.fn(),
}));
vi.mock("@/lib/recovery/sweep", () => ({
  runRecoverySweep: mocks.runRecoverySweep,
}));

import { customerRecoverySweep } from "@/lib/inngest/functions/customer-recovery-sweep";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
  };
}

beforeEach(() => {
  mocks.runRecoverySweep.mockReset();
});

describe("customerRecoverySweep", () => {
  it("calls runRecoverySweep inside a step and returns the summary", async () => {
    const summary = {
      orgs_scanned: 3,
      rows_enqueued: 2,
      skipped_dup: 0,
      org_errors: 0,
    };
    mocks.runRecoverySweep.mockResolvedValue(summary);
    const step = makeStep();
    const r = await customerRecoverySweep.fn({ step } as never);
    expect(step.run).toHaveBeenCalledTimes(1);
    expect(mocks.runRecoverySweep).toHaveBeenCalledTimes(1);
    expect(r).toEqual(summary);
  });

  it("is registered on the 6h cron, not an event trigger", () => {
    // Inngest internals: the function's options carry the cron trigger.
    const fn = customerRecoverySweep as unknown as {
      opts: { triggers: Array<{ cron?: string; event?: string }> };
    };
    expect(fn.opts.triggers[0].cron).toBe("0 */6 * * *");
    expect(fn.opts.triggers[0].event).toBeUndefined();
  });
});
