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

## VERSION

| Version | Date | Changes |
|---|---|---|
| 5.0 | 2026-05-06 | Native + Minimal. Bash-first. Plan Mode at Gate 2. Auto-revert watchdog. ~60% surface cut from V4. |

**Current: 5.0.0-alpha.0**
