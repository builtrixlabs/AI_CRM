import { createHash } from "node:crypto";

/**
 * Derive a stable v4-shaped UUID from a string seed. Same seed → same UUID
 * across runs, so the seeder can upsert idempotently without storing IDs.
 *
 * NOT cryptographic — this is for test-data idempotency, not security.
 */
export function stableUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  // Format as 8-4-4-4-12, set version (4) and variant (8/9/a/b) bits.
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = "4" + hash.slice(13, 16); // version 4
  const part4 = (
    (parseInt(hash.slice(16, 17), 16) & 0x3) |
    0x8
  ).toString(16) + hash.slice(17, 20);
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
