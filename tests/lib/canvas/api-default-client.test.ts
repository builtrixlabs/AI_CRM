// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { getLeadCanvas } from "@/lib/canvas/api";

describe("getLeadCanvas — default client fallback", () => {
  it("falls back to createSupabaseServerClient when no client is passed", async () => {
    const fakeClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    mocks.createSupabaseServerClient.mockResolvedValue(fakeClient);
    const result = await getLeadCanvas("11111111-2222-4333-8444-555555555555");
    expect(result).toBeNull();
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledOnce();
  });
});
