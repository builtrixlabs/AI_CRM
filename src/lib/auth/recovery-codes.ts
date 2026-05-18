import * as crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RecoveryCodeEntry = {
  hash: string;
  used_at: string | null;
  used_from_ip: string | null;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 2;
const CODE_GROUP_LEN = 4;
const BCRYPT_COST = 10;

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function generateCodes(n: number = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < n) {
    codes.add(generateOne());
  }
  return Array.from(codes);
}

function generateOne(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let s = "";
    for (let i = 0; i < CODE_GROUP_LEN; i++) {
      const idx = crypto.randomInt(0, CODE_ALPHABET.length);
      s += CODE_ALPHABET[idx];
    }
    groups.push(s);
  }
  return groups.join("-");
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code.toUpperCase(), BCRYPT_COST);
}

export async function verifyCodeHash(
  code: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(code.toUpperCase(), hash);
}

export async function hashCodes(codes: string[]): Promise<RecoveryCodeEntry[]> {
  return Promise.all(
    codes.map(async (c) => ({
      hash: await hashCode(c),
      used_at: null,
      used_from_ip: null,
    }))
  );
}

export type MarkCodeUsedResult =
  | { ok: true; index: number }
  | { ok: false; reason: "invalid" | "already_used" };

export async function markCodeUsed(
  user_id: string,
  code: string,
  ip: string | null,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<MarkCodeUsedResult> {
  if (!RECOVERY_CODE_PATTERN.test(code)) {
    return { ok: false, reason: "invalid" };
  }

  const { data, error } = await client
    .from("profiles")
    .select("mfa_recovery_codes")
    .eq("id", user_id)
    .maybeSingle();
  if (error || !data || !Array.isArray(data.mfa_recovery_codes)) {
    return { ok: false, reason: "invalid" };
  }

  const codes = data.mfa_recovery_codes as RecoveryCodeEntry[];
  let matchedIndex = -1;
  let alreadyUsed = false;
  for (let i = 0; i < codes.length; i++) {
    const ok = await verifyCodeHash(code, codes[i].hash);
    if (ok) {
      if (codes[i].used_at) alreadyUsed = true;
      else matchedIndex = i;
      break;
    }
  }
  if (matchedIndex < 0) {
    return { ok: false, reason: alreadyUsed ? "already_used" : "invalid" };
  }

  const next: RecoveryCodeEntry[] = codes.map((c, i) =>
    i === matchedIndex
      ? { ...c, used_at: new Date().toISOString(), used_from_ip: ip }
      : c
  );

  const { error: upErr } = await client
    .from("profiles")
    .update({ mfa_recovery_codes: next })
    .eq("id", user_id);
  if (upErr) return { ok: false, reason: "invalid" };

  return { ok: true, index: matchedIndex };
}
