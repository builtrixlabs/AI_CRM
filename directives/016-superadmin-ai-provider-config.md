# Directive 016 — Super-admin AI provider configuration UI

**Kind:** feature
**Status:** PARKED — DO NOT START until V0 (D-001..D-015) is fully shipped + the V0 pilot (D-015) is live.
**Created:** 2026-05-08
**Source:** Operator request (post-D-009 merge to v1)
**Authority:** memory/constitution.md (Principles I, II, IV, VII)

---

## Problem

D-009 ships the Model Gateway (`src/lib/ai/gateway.ts`) which reads
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from **process.env** (set in
the Vercel deployment). This works for V0 but has three operational
gaps once we're past pilot:

1. **No in-app key rotation.** Rotating keys today means editing
   Vercel env vars + redeploying. Founders / operators want a UI.
2. **No per-org override.** The cap and provider routing are global.
   Plan-tier defaults (D-014 hardening) will need per-org configurable
   knobs that are NOT just env vars.
3. **No audit trail of who changed what.** Vercel's env-var dashboard
   is outside our `audit_log`.

D-016 ships the **super-admin AI provider configuration surface**:

- A `/platform/ai-config` page (super_admin only — Constitution II
  isolation: zero operational data exposed).
- Set/rotate provider API keys (Anthropic, OpenAI, future: Deepgram
  for STT, more LLM providers as they're locked).
- Set per-plan or per-org token cap defaults.
- View redacted current values (`sk-ant-***-last4`) — never the full
  key in the DOM.
- Every set/rotate action writes one `audit_log` row with
  `actor_type='user', actor_role='super_admin', action='ai_config_set'`.
- Keys stored encrypted at rest (Supabase Vault — already used for
  other secrets per Constitution VII).

Server-side resolution order (priority high → low):
1. Per-org override (when D-014 hardens plan-tier caps → per-org caps).
2. Platform-tier value (set via D-016 UI).
3. `process.env` fallback (V0 path; lets the system boot before
   D-016 is run).

---

## Why this is parked, not built now

- D-009 ships a working gateway that reads from `process.env`.
  This is sufficient for V0 + the D-015 pilot.
- Building D-016 now would force a key-storage migration BEFORE the
  Vault-based pattern is needed, AND would force `super_admin` UI
  changes before D-014 hardens the platform analytics surface.
- Operator preference (recorded 2026-05-08): "we will set anthropic
  api key or any api key for ai processing in the backend of vercel
  for now."

**Trigger to start D-016:**

- D-001 through D-015 all merged to `main` (V0 GA).
- The D-015 pilot org has been live for ≥ 30 days without operational
  blockers tied to env-var-only key management.
- A second org needs onboarding (validates the per-org override
  requirement).

---

## Success criteria (drafted; refined at D-016 Plan Mode)

- [ ] `/platform/ai-config` accessible only to `super_admin` (existing
      middleware D-001 enforces).
- [ ] Form fields: Anthropic API key, OpenAI API key, default
      monthly token cap, soft-warn ratio.
- [ ] Submit writes encrypted values to Supabase Vault; the form
      shows the redacted last-4 of the saved key on next render.
- [ ] Gateway reads via a typed `getProviderConfig()` helper that
      checks per-org → platform → env in order.
- [ ] Every config change writes one `audit_log` row.
- [ ] Existing `process.env`-based path keeps working when no
      Vault values are set (zero-risk rollout).

---

## Constraints

- **Constitution VII (PII / secrets).** Keys MUST be stored encrypted
  at rest (Supabase Vault). Never round-tripped to the client in the
  clear. Form submits must POST over HTTPS only (already enforced).
- **Constitution II.** Super_admin only — operational tier cannot
  see or change provider config.
- **Constitution IV (audit).** Every change writes an audit row.
  Old key value is NOT recorded in the diff (only "rotated at <ts>").
- **Backwards-compatible rollout.** D-016 must NOT break the existing
  `process.env` path. The new resolution order falls back to env if
  Vault values are absent.
- **No prompt management UI in D-016.** Prompts stay file-based
  (Constitution VIII). Prompt management UI is a separate future
  directive (D-017+).

---

## Out of scope

- Prompt management / versioning UI (file-based per Constitution VIII).
- Per-prompt-version A/B routing — V1+.
- Cost dashboards (those land in D-014; D-016 is config-only).
- Multi-region key routing.
- Customer-supplied (BYO) keys — V2+; raises billing + isolation
  questions.
- Rate-limit override UI — V2+.

---

## Implementation outline (NOT a plan — just notes for future Plan Mode)

- New table: `platform_ai_config` (one row, super_admin-only RLS) OR
  Supabase Vault entries with stable names (`ANTHROPIC_API_KEY_ACTIVE`,
  etc.). Vault is preferable for at-rest encryption.
- New server-only helper: `src/lib/ai/config.ts` — `getProviderConfig({
  organization_id? })` returning the resolved values.
- Gateway refactor: read keys via `getProviderConfig()` instead of
  `process.env` directly. Keep the env fallback in `getProviderConfig`
  itself so D-016 ships with zero touch on `gateway.ts` callers.
- `/platform/ai-config` page (Server Component) + server action for
  the set/rotate write.
- Migration adds the Vault entries (or a `platform_ai_config` table
  if Vault isn't an option).
- Tests: server action permission gate (super_admin only), config
  resolver order (per-org → platform → env), redaction in the
  rendered form.

---

## References

- Baseline 115 — Model Gateway contract (locks the gateway entry
  points; D-016 changes only the *source* of the keys, not the
  gateway's external API).
- D-009 — Model Gateway V0 (env-var-based key reading).
- D-014 — V0 hardening (plan-tier-driven cap defaults; pre-req for
  D-016's per-org overrides).

---

**This directive is PARKED.** Do NOT scaffold orchestration files,
do NOT start Group A. Re-activate only when the trigger conditions
above are met.
