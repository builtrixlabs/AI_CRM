# CLAUDE.md — Vibe Coding OS V5 (Native + Minimal)

You operate inside **Vibe Coding OS V5**, a Claude-native OS for solo founders shipping production SaaS. Governance is **deterministic** (Claude Code hooks block forbidden writes); orchestration is **bash-first** (`scripts/v5/*.sh`); review is **one human checkpoint** (Plan Mode at Gate 2); ship is **single-prompt** (prose → preview URL). See `VIBE_OS_V5_SPEC.md` for canonical decisions D-01 through D-11.

Your role: **Receive prose intent → Plan Mode review → bypass-permissions execute → preview URL → arm watchdog. Auto-progress on success, halt on second failure, report.**

---

## FIRST-RUN DETECTION

If `memory/project-init.md` does NOT exist → fresh scaffold. Ask in order:
1. Project name (e.g. `ai-crm`)
2. Two-sentence purpose
3. GitHub SSH URL (or guide to create empty repo)
4. Supabase project ref + URL + anon key (or `https://supabase.com/dashboard`)
5. Confirm Vercel linked (`npx vercel link`)

Then: scaffold via `plugin/bin/init.mjs`, write `.env.local` (NEVER commit), write `directives/000-project-scaffold.md` and `memory/project-init.md`, run `npm install`, initial commit + push.

Also verify CLI prereqs (`gh`, `jq`, `supabase`, `vercel`) per `scripts/v5/PREREQS.md`. If any missing, surface a one-line install hint and halt before Gate 1.

---

## THE SINGLE INTERACTION MODEL (D-02)

```
You ─→ "Build feature: <X>"  |  "Fix: <Y>"  |  "Audit: <Z>"  |  "Enhance: <W>"
        feature-builder agent runs scripts/v5/build.sh:
          Gate 1 → directive (auto)
          Gate 2 → Plan Mode engages; you approve / edit / reject
          Gate 3 → TDD execution (auto, bypass-permissions)
          Gate 4 → verify + security scan (auto)
          Gate 5 → branch + push + preview URL (auto)
          Gate 6 → post-merge watchdog armed (auto, after merge)
   ←─ preview URL + summary
```

**No CLI invocations, no slash commands** in operator workflow after the initial scaffold. Plan Mode is the only human touch.

---

## AUTHORITY ORDER

```
hook → policy → baseline → memory → learned patterns → directive → conversation
```

Hooks execute before any prompt-following: enforcement, not guidance.

---

## HOOKS BLOCK (deterministic, exit 2)

- Writes to `policy/**`, `baseline/**`, `.git/**`, `.env*` (except `.env.example`)
- `rm -rf` against repo root, `.git`, or `node_modules`
- `git push --force` outside `feature/*`
- Bash containing secret patterns (AWS, Stripe, OpenAI, GitHub, Google, private keys, DB URLs)

If a hook blocks legitimate work → it is a runbook event (`runbooks/hook-false-positive.md`). Never bypass.

---

## NO PERMISSION NEEDED FOR

Writing to `src/`, `tests/`, `execution/`, `orchestration/`, `directives/`, `memory/` (append-only on `memory/logs/`); installing shadcn; writing Supabase migrations; running tests; pushing to feature branches; deploying preview.

---

## THE 5+1 GATE PIPELINE

| Gate | Mode | What |
|---|---|---|
| 1 — Directive | auto | `directive-from-prompt` skill writes `directives/<NNN>-<slug>.md` (atomic: ISO-timestamp + slug). Reads `memory/learned/<product>/patterns.md`. |
| 2 — Plan | **human, in Plan Mode** | `scripts/v5/plan-gen.sh` generates spec + plan + tasks + coverage targets. Plan Mode surfaces. Approve / Edit / Reject. |
| 3 — Execution | auto, TDD | For each task: RED (failing test) → GREEN (minimal impl) → REFACTOR. Side: shadcn install, Supabase migrations, type regen. All tool calls logged. |
| 4 — Verification | auto | `build` → `test` → `test:coverage` (≥80% lines / ≥90% branches; auto-gen tests once if short) → `test:playwright` → security scan. CRITICAL halts (auto-fix loop, max 3) → others highlighted + parallel-fixed. Acceptance tests **100%**; `@stretch` non-blocking. |
| 5 — Deployment | auto | Pre-commit secret scan → branch `feature/<slug>` → commit → push → poll Vercel preview URL (60s, then `vercel ls --json`) → arm Gate 6 → report. |
| 6 — Watchdog | auto, post-merge | GitHub Action runs CI on `main`. **2 consecutive reds** OR Vercel `main` fail → auto-revert merge → recreate feature branch → log → open issue. |

**Auto-retry once per gate step. Second failure → halt + report.**

---

## QUALITY NUMBERS OF RECORD (D-06 / D-07)

- Coverage lines ≥ 80% · branches ≥ 90%; auto-gen-and-retry once.
- Acceptance test pass rate **100%**; `@stretch`-tagged tests don't block.
- Playwright `@smoke` and `@regression` 100%.
- Security: **CRITICAL = 0** (after auto-fix loop, max 3 attempts). HIGH/MED/LOW logged + parallel-fixed.
- Coverage exclusion: `// v5:coverage-ignore <reason>` capped at 5% lines/file.

---

## SKILLS (auto-invoked by description match)

| Skill | When |
|---|---|
| `directive-from-prompt` | Convert prose intent into a directive (Gate 1) |
| `supabase-rls-policy` | Author or review RLS policy |
| `migration-supabase-safe` | Author additive Supabase migration |
| `shadcn-component-install` | Add a shadcn component |
| `vitest-from-spec` | Write a Vitest unit test from a spec (handles `@stretch`) |
| `secret-fix-and-relocate` | Move hardcoded secret to `.env.local` |

Skills are self-contained. Never load each other.

---

## AGENTS

| Agent | Purpose |
|---|---|
| `feature-builder` | Dispatches `scripts/v5/build.sh`. Orchestrates Gates 1–5; arms 6. |
| `security-scanner` | Gate 4 scan; CRITICAL auto-fix loop, others logged + parallel-fixed. |
| `pattern-extractor` | Post-Gate 5: extract patterns to `memory/learned/<product-slug>/`. |

Agents do not invoke other agents. Tools allowlist excludes `Task`.

---

## SAFETY CONTROLS

**Auto-retry once:** test, build, security scan. Second failure → halt + report.

**Never:**
- Modify `policy/` or `baseline/` (hook-blocked)
- Delete `.git`, repo root (hook-blocked)
- Force-push outside `feature/*` (hook-blocked)
- Commit secrets (pre-commit + PreToolUse double-defense)
- Ignore CRITICAL findings after auto-fix loop
- Ignore acceptance-tier test failures

**Unrecoverable errors:** halt; log gate + operation + error + attempts; await operator input.

---

## LOGGING

`memory/logs/execution/<date>.jsonl`:
```json
{"ts":"<ISO>","hook":"PostToolUse","tool":"Bash","tool_input":"...","session_id":"...","cwd":"..."}
```

`memory/logs/gates.jsonl`:
```json
{"ts":"<ISO>","gate":3,"directive":"021-leads-list","outcome":"pass","duration_ms":4321}
```

`memory/logs/security/<date>.jsonl`, `memory/logs/regressions/<date>.jsonl`: same shape, gate-specific.

---

## BEHAVIOR

- Execute immediately within hook-enforced rails — bypass-permissions on.
- Build end-to-end: prose → preview URL.
- TDD every task — RED → GREEN → REFACTOR.
- Scan before deploy.
- Log everything (PostToolUse hook).
- Fix errors autonomously — retry once, then report.
- Use skills + bash, not parallel infrastructure (D-03).
- Deploy to feature branches only.
- Learn after Gate 5 — `pattern-extractor` runs.
- Be context-efficient (D-04) — skills carry patterns, you carry decisions.

---

## STOPPING CRITERIA — V4 horizon (operator-set 2026-05-11)

**This section supersedes "auto-retry once, then halt + report" for V4 work. Re-read on every V4 directive build.**

A V4 directive is **NOT complete** — and you **do not stop** — until **every** line below is green. If a line is red, fix it and retry (up to 3 attempts per failure). After 3 attempts on the same gate, halt with a specific status report and the failing gate name.

| # | Gate | Pass = |
|---|---|---|
| 1 | **Built** | Every AC in the directive has corresponding code. |
| 2 | **Tested** | Unit + RTL tests written and passing for new code. Targeted suite green via `npx vitest run tests/<paths>`. |
| 3 | **Typechecked** | `npx tsc --noEmit` clean for changed files (pre-existing unrelated errors noted but don't block). |
| 4 | **Migrations applied to Supabase** | Every new `supabase/migrations/*.sql` from this directive applied via `mcp__vibe-supabase__apply_migration_to_branch` and verified (table/RPC exists, RLS enabled). |
| 5 | **Pushed to git** | Feature branch pushed to `origin`; PR opened against `v4`. |
| 6 | **Vercel build green** | Preview deploy reaches `READY` state via `mcp__vibe-vercel__wait_for_preview`. On `ERROR`, read deploy logs, fix the build, redeploy. |
| 7 | **UI/UX verified on the live preview** | Navigate to the preview URL via `mcp__Claude_in_Chrome__*` or `mcp__Claude_Preview__*`; screenshot every new page; confirm rendering + interaction flow. |
| 8 | **PR merged to `v4`** | Only after gates 1–7. Default: `gh pr merge --squash --delete-branch`. |
| 9 | **Post-merge v4 build green** | `mcp__vibe-vercel__wait_for_preview --branch v4` reaches `READY`. |
| 10 | **Status logged** | `docs/V4_STATUS.md` directive table updated from `planned` → `shipped`, with migration list + PR # + Vercel preview URL + `v4.0` test count delta. |

**Rules of motion:**
- **Don't ask the operator for permission mid-directive** unless a gate genuinely requires their action (e.g. an external API key, a hook-blocked baseline write). Pause AT THAT GATE with a precise ask, not preemptively.
- **Don't stop "to confirm"** between gates — sequence them. The operator's "continue" / "go" / "do the next thing" already covers the full 10-gate run.
- **Don't declare success mid-stream.** A PR opened or a passing test suite is progress, not completion. Completion = gate 10 green.
- **Self-pace longer waits.** Vercel + Supabase polls take minutes; use `wait_for_preview` / `wait_for_branch_ready` with their built-in timeouts, not custom sleeps.

**Definition of "halt with status report":** one message listing (a) what shipped, (b) which gate failed and why, (c) the precise unblocker needed from the operator. Then wait for input.

---

## INFRASTRUCTURE THE AGENT OWNS (operator-delegated 2026-05-11)

The operator is **not** the migration runner and **not** the env-var pusher. Those are agent jobs. Two scripts encode this:

### Supabase migrations (gate 4)

For every directive that ships a new `supabase/migrations/*.sql`:

```
cd <repo-root>     # parent project (where .env lives, not the worktree)
node scripts/apply_migration.mjs supabase/migrations/<new-file>.sql
```

The script (a) creates the `applied_migrations` ledger on first run, (b) skips
re-application by name (idempotent), (c) wraps the SQL in BEGIN/COMMIT,
(d) bails with the postgres error message on failure. Reads `DATABASE_URL` from
the project `.env`.

After applying, write a one-off `scripts/verify_<directive>.mjs` checker
(table exists, RPC callable, RLS enabled, indexes present) and run it. Both
files commit alongside the directive.

### Vercel preview env (gate 6 prerequisite)

Vercel scopes env vars **per git branch**. A brand-new branch has no env vars
attached to its Preview deploys — without those, runtime 500s before any
function executes. So:

**Every time the agent cuts a new feature branch that needs preview
verification (gate 6/7), it runs:**

```
cd <repo-root>     # parent project
node scripts/vercel-env-sync.mjs <branch-name>
```

The script pushes `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `MFA_DEMO_MODE` (when set) to
`preview(<branch>)`. Idempotent: existing values are removed and re-added so
the Vercel side always matches the local `.env`.

If a new env var is added to local `.env` (a new feature needs it), append it
to `RUNTIME_VARS` in `scripts/vercel-env-sync.mjs` and re-run for the active
branch. Production env vars are operator-owned — this script only touches
Preview scope.

**Workflow for every directive that adds runtime config:**

1. Update local `.env` / `.env.local` (operator does this once).
2. Append the var name to `RUNTIME_VARS` in `vercel-env-sync.mjs` (agent).
3. `node scripts/vercel-env-sync.mjs <branch>` (agent) — push to Preview.
4. Redeploy or wait for next push to pick up. Vercel runtime env is read at
   deploy time; existing deploys won't pick up new vars without redeploy.

If a Preview deploy 500s and the same code runs fine locally, **the first
thing to check is whether `vercel env ls | grep <branch>` shows the expected
vars.** If not, the script wasn't run for that branch — run it.

---

## VERSION

| Version | Date | Changes |
|---|---|---|
| 5.0 | 2026-05-06 | Native + Minimal. Bash-first. Plan Mode at Gate 2. Auto-revert watchdog. ~60% surface cut from V4. |
| 5.1-v4 | 2026-05-11 | V4 horizon: 10-gate STOPPING CRITERIA replaces "halt on second failure". Don't stop until preview is live, migrated, UI-verified, and merged. Operator-set; non-negotiable for V4 directives. |
| 5.2-v4 | 2026-05-11 | Agent owns infrastructure: `scripts/apply_migration.mjs` (Supabase live, idempotent) + `scripts/vercel-env-sync.mjs` (per-branch Preview env, pushes from local .env). Operator no longer asked to run these. |

**Current: 5.2.0-v4**
