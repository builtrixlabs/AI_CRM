# Vibe Coding OS V5 — Specification

**Status:** Draft v0.1 — pending operator approval
**Codename:** V5 — *Native + Minimal*
**For:** Builtrix Labs internal product line (CRM, Telecalling Auditor, Marketing Aggregator, Legal Auditor, Finance OS, +)
**Anchors:** V4.0-rc.1 audit findings + operator interview (May 2026)

---

## 0. Decisions of Record

These eleven decisions anchor every spec choice below. Any deviation traces back here.

| # | Decision | Rationale |
|---|---|---|
| **D-01** | V5 is a generic, internal-only OS for Builtrix's full product line. Not for sale, not external. | Eliminates abstraction debt of "what if a third party uses this." |
| **D-02** | Single interaction model: prose prompt → Plan Mode review → auto-execute → push. **No CLI commands, no slash commands** in operator workflow. | Operator never used V4's CLI/skills/hooks-as-feature; ~70% of V4's surface is dead weight. |
| **D-03** | Orchestration via **bash + Claude Code primitives** wherever possible. MCPs only when bash can't (auth, async, regex-heavy). | Lower token cost, bypass-permissions-friendly, faster cold start. |
| **D-04** | Directives auto-generated, auto-proceeded. Human review **only at Gate 2 via Claude Code's native Plan Mode** (Shift+Tab). | Ship fast, fix later. One checkpoint, not five. |
| **D-05** | Stack: Next.js 16 + TypeScript + Supabase + Vercel + Vitest + Playwright + shadcn. **No exceptions.** | Avoids stack fragmentation; matches all four planned products. |
| **D-06** | Quality floor: **80% lines / 90% branches coverage; 100% pass rate on acceptance-tier tests; `@stretch`-tagged tests don't block.** | Ship discipline without burying broken behavior. |
| **D-07** | Security: **CRITICAL findings hard-block** Gate 5 with auto-fix loop until clean. HIGH/MEDIUM/LOW: highlight + auto-fix in parallel + ship. | CRITICAL kills startups; the rest is patchable. |
| **D-08** | Branch + preview hygiene: **keep all locally, no auto-cleanup.** | Operator preference; storage is cheap, regret is expensive. |
| **D-09** | **One Claude Code session = one umbrella build = one branch = one preview = one PR.** Operator runs separate concerns in separate chats. | Clean isolation per concern, simple mental model. |
| **D-10** | Post-merge regression detection triggers **auto-revert** of the merge commit, recreates the feature branch, logs, alerts. | Solo dev safety net. No team to catch it manually. |
| **D-11** | Validation product: **AI-native CRM scaffolded into a separate repo.** CRM is not in V5. | V5 is the OS, not the products. |

---

## 1. Purpose

V5 is a Claude-native development OS that lets a solo founder ship production-grade SaaS by typing natural-language intent into Claude Code. No CLI to memorize, no slash commands, no per-feature ceremony. The OS handles directive generation, planning (with one human checkpoint), test-driven execution, security scanning, deployment, and post-merge regression recovery.

**Success criterion (one line):** A new Builtrix product can be scaffolded from V5 and ship its first feature to a working Vercel preview URL with **one prose prompt + one Plan Mode approval**. Zero CLI invocations, zero slash commands, after the initial scaffold.

**Out of scope:**
- Multi-tenant orchestration (one session = one build)
- Non-Supabase data stores
- Non-Vercel deployment targets
- Team review workflows (assumes solo dev)
- External distribution / licensing

---

## 2. The Single Interaction Model

```
You (in any V5-scaffolded repo, in Claude Code)

  ──→ "Build feature: lead-capture form with email validation"
       (or "Fix: broker permissions bug", or "Audit codebase for vulnerabilities")

       Plan Mode auto-engages. V5 surfaces:
         · Generated directive
         · Spec → plan → tasks
         · Files to be created/modified
         · Tests to be written
         · DB migrations needed
         · Coverage targets

  ──→ You approve / edit / reject in Plan Mode

       Plan Mode exits. Bypass-permissions takes over.

       V5 executes silently:
         · TDD: failing test → impl → refactor (per task)
         · Migrations + RLS
         · Coverage check (80%/90%); auto-generate tests if short
         · Security scan (CRITICAL blocks, others highlighted + parallel-fixed)
         · Push to feature/<slug>
         · Vercel preview built + URL captured
         · Post-merge watchdog armed

  ──→ V5 reports: preview URL + summary

       (You merge when satisfied. Auto-revert engages if main regresses.)
```

**That is the entire operator surface area.** Everything below this line is plumbing the operator should never see in normal use.

---

## 3. Architecture (seven layers)

| Layer | Technology | Responsibility |
|---|---|---|
| **L0 — Operator surface** | Claude Code chat | Natural-language prose. Plan Mode at Gate 2. Nothing else. |
| **L1 — Constitution** | `CLAUDE.md` (≤200 lines) | Defines operating model. Loaded by Claude Code on session start. |
| **L2 — Determinist guardrails** | Claude Code hooks | Block writes to immutable paths, block force-push outside `feature/*`, block secret patterns in bash, append all tool calls to `memory/logs/`. |
| **L3 — Directives + plans** | Filesystem (`directives/`, `specs/`, `orchestration/`) | Append-only artifacts. Generated by V5, reviewed in Plan Mode, persisted for traceability. |
| **L4 — Execution glue** | Bash scripts in `scripts/v5/` | Replaces ~70% of V4's MCP servers. Faster, lower-token, bypass-permissions-friendly. |
| **L5 — Integration adapters** | 3 thin MCP servers: `supabase`, `vercel`, `secret-scanner` | Only kept where bash can't do the job (auth flows, async deploy detection, regex-heavy scanning). |
| **L6 — Watchdog** | GitHub Action + post-merge listener | Detects CI red / preview broken, triggers auto-revert. |

**Killed from V4** (see §8): plugin CLI surface (still callable but invisible), 9 of 12 MCP servers, 4 of 7 subagents, the entire `.specify/` directory, the legal-auditor constitution, all dead stubs.

**Kept from V4**: hooks (validated, 17 tests pass), secret scanner, the `policy/`/`baseline/` governance docs (slimmed by ~60%), the directive→plan→tasks artifact model.

---

## 4. The 5+1 Gate Pipeline

V5 keeps V4's 5-gate model and adds **Gate 6: post-merge watchdog**. Gates 1, 3, 4, 5, 6 are fully automated. Gate 2 is the only human touch.

### Gate 1 — Directive (auto)

Triggered by: `Build feature: <X>` | `Fix: <Y>` | `Audit: <Z>` | `Enhance: <W>`

V5:
1. Reads `memory/learned/patterns.md`, `policy/`, `baseline/` for context
2. Generates directive: problem, success criteria, constraints, scope, out-of-scope
3. Writes to `directives/<NNN>-<slug>.md` (atomic numbering: ISO timestamp + slug)
4. Logs to `memory/logs/gates.jsonl`
5. Hands to Gate 2

**Auto-proceeds. No human input.**

### Gate 2 — Plan (Claude Code Plan Mode review)

V5:
1. Generates spec (acceptance criteria, data model, API contracts)
2. Generates plan (file changes, migrations, components, tests)
3. Generates ordered task list
4. Engages Plan Mode in Claude Code
5. Surfaces to operator: directive + spec + plan + tasks + estimated coverage targets

**Operator decision in Plan Mode:**
- **Approve** → exit Plan Mode → Gate 3
- **Edit** → V5 regenerates plan with edits → re-presents in Plan Mode
- **Reject** → V5 logs reason, exits build, **branch never created**

### Gate 3 — Execution (auto, TDD-disciplined)

For each task in the approved plan:

1. **RED** — write failing test (Vitest unit or Playwright e2e per task tier). Run. Confirm fails for the right reason.
2. **GREEN** — write minimal implementation. Run. Confirm pass.
3. **REFACTOR** — clean while keeping green.

Side activities:
- shadcn components installed via `bash scripts/v5/install-shadcn.sh <comp>`
- Supabase migrations written to `supabase/migrations/`, applied locally via `supabase db reset && supabase db push`, types regenerated
- All tool calls logged to `memory/logs/execution/<date>.jsonl` via PostToolUse hook

**Auto-proceeds. Bypass-permissions on.**

### Gate 4 — Verification (auto, threshold-enforced)

V5 runs in sequence:
1. `npm run build` (TypeScript)
2. `npm run test` (Vitest)
3. `npm run test:coverage` — must hit ≥80% lines, ≥90% branches; if short, V5 generates tests for uncovered paths and re-runs **once**
4. `npm run test:playwright` against local preview
5. **Acceptance-tier tests must hit 100% pass.** `@stretch`-tagged tests can fail without blocking.
6. Security scan (see §5):
   - **CRITICAL** → halt + auto-fix loop (max 3 attempts) → re-scan. After 3 fails, halt and report.
   - **HIGH/MEDIUM/LOW** → highlight + attempt parallel auto-fix + log to `memory/logs/security/<date>.jsonl` + proceed.

**Auto-retries each step once on failure. Second failure → halt + report.**

### Gate 5 — Deployment (auto)

1. Pre-commit secret scan (defensive double-check; husky + V5 own scan)
2. `git checkout -b feature/<slug>`
3. `git add . && git commit -m "feat(<scope>): <description>"`
4. `git push origin feature/<slug>`
5. Poll Vercel API for preview URL (max 60s, then `vercel ls --json` fallback)
6. Append `gates.jsonl` entry
7. Arm Gate 6 watchdog
8. Report preview URL + summary to operator

### Gate 6 — Post-merge watchdog (NEW in V5, auto)

Runs as a GitHub Action triggered by merge to `main`:
1. CI runs full test suite + Playwright against newly-deployed `main`
2. If green → log success, dismiss watchdog
3. If red **on 2 consecutive runs** (cooldown to filter flakiness) **OR** Vercel `main` deploy fails:
   - Auto-revert merge commit: `git revert -m 1 <sha> && git push origin main`
   - Recreate the feature branch from the reverted state
   - Log to `memory/logs/regressions/<date>.jsonl`
   - Alert operator (GitHub issue auto-created with full context)
   - Operator can re-run `Fix: <directive-id>` to retry

---

## 5. Quality Gates — Numbers of Record

| Metric | Threshold | Action on fail |
|---|---|---|
| Coverage — lines | ≥ 80% | V5 auto-generates tests for uncovered lines, retries once. Second fail → halt. |
| Coverage — branches | ≥ 90% | Same as lines. |
| Acceptance test pass rate | **100%** (untagged tests) | Halt + report failing tests. |
| `@stretch` test pass rate | Any | Logged, never blocks. |
| Playwright `@smoke` | 100% | Halt + report. |
| Playwright `@regression` | 100% | Halt + report. |
| `npm run build` | exit 0 | Auto-retry once. Second fail → halt. |
| **CRITICAL** security findings | **0** (after auto-fix) | Auto-fix loop, max 3 attempts. Then halt. |
| HIGH/MEDIUM/LOW security | logged, parallel-fixed | Never blocks ship. |

**Coverage exclusions:** annotated `// v5:coverage-ignore <reason>` allowed for justified cases (error-path branches, etc.), capped at 5% of total lines per file.

---

## 6. The Integration Wedge — Vercel / Supabase / Claude Code

This is V5's actual engineering investment. V4 had stubs here (empty `vercel/server.ts`, empty `playwright/server.ts`). V5 ships these for real.

### 6.1 Supabase integration

| Operation | Mechanism | Why this choice |
|---|---|---|
| Generate migration | bash + skill template | Lower token, deterministic |
| Apply migration locally | bash: `supabase db reset && supabase db push` | Standard CLI |
| Generate TS types | bash: `supabase gen types --local` | Standard CLI |
| Author RLS policy | skill template (kept from V4) | Pattern library |
| Deploy migration to preview branch | **MCP** (`scripts/mcp/supabase`) | Async, requires Supabase API auth |
| Validate RLS against preview env | bash + supabase CLI | Bash sufficient |

### 6.2 Vercel integration

| Operation | Mechanism | Why |
|---|---|---|
| Detect preview URL after push | **MCP** (`scripts/mcp/vercel`) | Async polling required |
| Detect deploy success/failure | MCP webhook + polling | Async |
| Run Playwright against preview | bash: `BASE_URL=<preview> playwright test` | Bash sufficient |
| Trigger redeploy after revert | MCP API call | Auth needed |

### 6.3 Claude Code integration

| Operation | Mechanism |
|---|---|
| Plan Mode engagement at Gate 2 | Claude Code native (Shift+Tab); V5 just structures plan content |
| Bypass-permissions execution | Claude Code config; V5 detects state at session start, warns if off |
| Hook firing | Claude Code native; hook scripts live in `.claude/hooks/` |
| Tool call logging | PostToolUse hook → `memory/logs/execution/<date>.jsonl` |

**Architectural principle:** V5 leans on Claude Code's native primitives wherever they exist. The OS adds glue, not parallel infrastructure.

---

## 7. Repository Structure

```
vibe-os-v5/
├── CLAUDE.md                       # ≤200 lines, the constitution
├── .claude/
│   ├── settings.json               # Hook wiring (kept from V4)
│   ├── hooks/                      # 5 hooks (kept, validated)
│   ├── skills/                     # 5 skills (down from 7)
│   └── agents/                     # 2 subagents (down from 7)
├── scripts/v5/                     # NEW: bash-first orchestration
│   ├── build.sh                    # Entry: invoked by feature-builder agent
│   ├── directive-gen.sh            # Gate 1
│   ├── plan-gen.sh                 # Gate 2 plan content generation
│   ├── tdd-task.sh                 # Gate 3 per-task TDD loop
│   ├── verify.sh                   # Gate 4
│   ├── deploy.sh                   # Gate 5
│   ├── supabase.sh                 # Supabase ops
│   ├── vercel.sh                   # Vercel ops
│   ├── auto-revert.sh              # Gate 6 revert mechanism
│   └── PREREQS.md                  # Required CLIs (gh, jq, supabase, vercel)
├── scripts/mcp/                    # 3 MCPs ONLY (down from 12)
│   ├── supabase/                   # Async DB ops via API
│   ├── vercel/                     # Async deploy detection
│   └── secret-scanner/             # Regex-heavy scanning
├── policy/                         # 6 policies (down from 13)
│   ├── 001-structural-integrity.md
│   ├── 002-execution-gating.md
│   ├── 003-memory-persistence.md
│   ├── 004-tdd-enforcement.md
│   ├── 005-security-scanning.md
│   └── 006-post-merge-recovery.md
├── baseline/                       # 5 baselines (down from 11)
│   ├── 001-repo-template.md
│   ├── 002-stack-contract.md
│   ├── 003-tdd-contract.md
│   ├── 004-security-contract.md
│   └── 005-watchdog-contract.md
├── runbooks/                       # 4 recovery procedures
│   ├── gate-3-failure.md
│   ├── gate-4-failure.md
│   ├── gate-6-watchdog-failure.md
│   └── plan-mode-rejection.md
├── memory/
│   ├── learned/patterns.md         # Per-product namespaced
│   └── logs/                       # gates, execution, security, regressions
├── plugin/
│   └── bin/init.mjs                # Single-entry scaffolder, no flags
├── .github/workflows/
│   └── post-merge-watchdog.yml     # Gate 6
└── tests/                          # Framework self-tests (kept)
```

When scaffolded into a new app, all of the above copies in. Plus app-level: `src/`, `tests/`, `supabase/migrations/`, `next.config.ts`, `vercel.json`, `package.json`, `tsconfig.json`.

---

## 8. V4 → V5 Kill List

### Deleted (gone in V5)

| V4 component | Why deleted |
|---|---|
| `scripts/mcp-servers/speckit/` | Stub adapter; orchestration moves to bash + Plan Mode |
| `scripts/mcp-servers/playwright/` | Empty stub; bash sufficient |
| `scripts/mcp-servers/structure-guardian/` | Hooks already enforce structure |
| `scripts/mcp-servers/directive-resolver/` | Bash + filesystem sufficient |
| `scripts/mcp-servers/execution-gate/` | Bash orchestrator + hooks sufficient |
| `scripts/mcp-servers/intent-logger/` | PostToolUse hook does this |
| `scripts/mcp-servers/message-bus/` | Zero real inter-MCP traffic in operator's workflow |
| `scripts/mcp-servers/agent-shield/` | Replaced by bash + secret-scanner |
| `scripts/mcp-servers/learning-engine/` | Pattern extraction is a subagent, not an MCP |
| `scripts/mcp-servers/shadcn/` | shadcn CLI via bash is faster |
| `.specify/` directory | Stale legal constitution; broken PowerShell scripts |
| Plugin CLI commands `upgrade`, `health` | Operator never invokes them |
| `.claude/agents/spec-planner.md` | Speckit is gone |
| `.claude/agents/test-runner.md` | Bash sufficient |
| `.claude/agents/code-reviewer.md` | Solo dev, no team review |
| `.claude/agents/directive-writer.md` | Duplicate of `directive-from-prompt` skill |
| Policies 005, 006, 008, 010, 011 | MCP-coordination policies; no MCPs to coordinate |
| Baselines 005, 006, 007, 010 | Tied to deleted MCPs |
| Slash commands `/learn`, `/tdd`, `/security-scan`, `/token-report`, `/setup`, all `speckit.*` | Operator never uses slash commands |

### Kept (with edits)

| V4 component | Edit |
|---|---|
| `.claude/hooks/*` | Keep as-is — 17/17 tests pass |
| `.claude/skills/directive-from-prompt/` | Atomic numbering fix (timestamp + slug) |
| `.claude/skills/migration-supabase-safe/` | Solid, no edit |
| `.claude/skills/shadcn-component-install/` | Solid, no edit |
| `.claude/skills/supabase-rls-policy/` | Solid, no edit |
| `.claude/skills/vitest-from-spec/` | Add `@stretch` tag handling |
| `.claude/skills/secret-fix-and-relocate/` | Solid, no edit |
| `.claude/agents/feature-builder.md` | Rewrite as bash dispatcher; add Gate 6 |
| `.claude/agents/security-scanner.md` | Solid, no edit |
| `.claude/agents/pattern-extractor.md` | Per-product namespacing |
| `scripts/secret-scanner.ts` | Real, working — keep |
| Policies 001, 002, 003, 004, 009, 012, 013 | Renumber to 001–006 |
| Baselines 001, 008, 009, 011, 012 | Renumber to 001–005 |

### Newly built

| Component | Purpose |
|---|---|
| `scripts/v5/*.sh` (10 scripts) | Bash-first orchestration; replaces 8 deleted MCPs |
| `scripts/mcp/vercel/` (real impl) | Async deploy detection, preview URL capture |
| `scripts/mcp/supabase/` (real impl) | Branch-aware DB ops |
| `.github/workflows/post-merge-watchdog.yml` | Gate 6 trigger |
| `scripts/v5/auto-revert.sh` | Gate 6 revert action |
| `plugin/bin/init.mjs` (V5 minimal version) | Single scaffold entry, no flags, no upgrade, no health |
| `runbooks/gate-6-watchdog-failure.md` | New recovery doc |
| `runbooks/plan-mode-rejection.md` | New recovery doc |

**Net change:** repo surface area shrinks ~60%. Token-per-feature-build expected to drop ~50%+ on equivalent V4 features (validated in §12).

---

## 9. Validation Plan — AI-native CRM dry run

**Validation product:** AI-native CRM (separate repo, scaffolded fresh from V5, never merged into V5 itself).

| Step | Action | Pass criterion |
|---|---|---|
| **V0** | `npm create vibe-os ai-crm` from operator terminal | Repo scaffolds; framework tests pass; first commit pushed; Vercel project linked; Supabase ref set |
| **V1** | In Claude Code: *"Build feature: lead capture form with email and phone fields, validation, save to Supabase"* | Plan Mode shows directive + spec + plan; operator approves; pipeline runs end-to-end; preview URL works; lead form functional in preview |
| **V2** | *"Build feature: list view of leads with filtering by status"* | Same flow; filters work in preview; coverage hits 80%/90% |
| **V3** | *"Audit codebase for vulnerabilities"* | Security findings surfaced; CRITICAL count = 0; HIGH/MEDIUM auto-fixed in parallel; report generated in `memory/logs/security/` |
| **V4** | Operator merges V1's PR to `main` | Watchdog runs, confirms green, dismisses |
| **V5** | Operator deliberately introduces a regression on `main` (manual revert of a working fix) | Watchdog detects, auto-reverts, logs to `memory/logs/regressions/`, opens GitHub issue with full context |

**V5 ships when V0–V5 all pass on first attempt.** Anything less = V5.0-rc.N.

---

## 10. Risks & Tradeoffs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bash-first orchestration is harder to debug than MCP-tool-call traces | Medium | Aggressive logging in `memory/logs/execution/`; every bash invocation logged with stdin/stdout/stderr/duration |
| Auto-revert masks flaky CI: real regressions get reverted alongside test flakiness | Medium-High | Watchdog requires CI red on **2 consecutive runs** before reverting (cooldown). Manual override available via `gh issue close <id> --comment "false-positive"`. |
| Plan Mode UX adds friction operator might want to skip on small fixes | Low-Medium | Add operator escape: prefix `Build feature: --no-plan <X>` skips Plan Mode (logs warning, requires confirmation in chat). Use sparingly. |
| 80%/90% coverage threshold blocks shipping when uncovered code is intentional | Medium | `// v5:coverage-ignore <reason>` annotation, capped at 5% of lines per file |
| Supabase branch-deploys + RLS policy testing hard to automate end-to-end | High | Phase C dedicates 2 days to Supabase preview env. If unsolved, fall back to local-only RLS testing + flag in directive |
| Operator forgets to enable bypass-permissions in Claude Code, pipeline halts | Low | First-run check in `CLAUDE.md` SessionStart hook detects state, surfaces warning before Gate 1 |
| Patterns memory leaks legal-domain learnings into CRM build | Low-Medium | Per-product `memory/learned/<product-slug>/` namespacing; cross-product patterns require manual promotion to `memory/learned/_global/` |
| `npx` cold-start fragility (V4's ts-node issue) repeats with bash dependencies | Low | All bash deps (jq, gh, supabase, vercel CLIs) declared in `scripts/v5/PREREQS.md`; `init.mjs` checks at scaffold time and refuses if missing |
| Solo dev means no second pair of eyes on plan rejection rationale | Low | Plan Mode rejections logged with timestamp + reason; reviewable in `memory/logs/gates.jsonl` |

---

## 11. Implementation Phases

| Phase | Days | Output | Definition of done |
|---|---|---|---|
| **A — Cuts** | 1–2 | All deleted V4 components removed; repo surface cut ~60% | `npm run test:v4` passes minus deleted tests; no broken references in remaining files |
| **B — Constitution + bash orchestration** | 3–6 | New `CLAUDE.md` (≤200 lines); `scripts/v5/*.sh` written; feature-builder rewritten as bash dispatcher | `Build feature: hello-world` runs end-to-end on a throwaway scaffold, hits Gate 5 with a working preview URL |
| **C — Integration adapters** | 7–11 | Real Vercel + Supabase MCPs; secret-scanner; Playwright wired | All Gate 4 + Gate 5 operations functional against a real Supabase + Vercel project |
| **D — Watchdog (Gate 6)** | 12–14 | GitHub Action + auto-revert script | Induced regression on `main` triggers revert within 5 min, recreates feature branch, opens issue |
| **E — Validation** | 15–17 | CRM dry run V0–V5 | All five validation steps pass on first attempt |
| **F — Cutover** | 18 | V4 tagged frozen as `v4-final`; V5.0.0 published | `vibe-os-v5` is the new default scaffold; `npm create vibe-os` resolves to V5 |

**Total: ~18 working days for production-ready V5.** No buffer baked in. If any phase slips, the slip propagates; no compression target.

**Critical path:** Phase B (bash orchestration) is the longest and highest-risk. Allocate the operator's sharpest hours here. Phases A and F are mechanical.

---

## 12. Success Criteria — The Bar V5 Must Clear

V5 is **production-ready** when **ALL** of the following are true after the validation phase:

1. **Single-prompt feature ship rate:** One natural-language prompt + one Plan Mode approval ships a working feature to a preview URL **≥9 times out of 10** across 10 trial features in the CRM dry-run.
2. **Coverage discipline:** All 10 trial features hit ≥80% lines / ≥90% branches **without manual test-writing intervention.**
3. **Zero CRITICAL security findings** in any shipped feature across the 10 trials.
4. **Auto-revert proves itself:** At least 2 induced regressions trigger watchdog → revert → re-build → green.
5. **Token economics:** Average tokens per feature ship (across 10 trials) is **<60% of V4's average** for equivalent features. (V4 baseline measured in Phase A before deletion.)
6. **No CLI invocations in operator's workflow during validation phase**, except the initial `npm create vibe-os ai-crm` scaffold.

If any criterion fails → V5 stays at `5.0.0-rc.N` until fixed. **No marketing of "stable" until all six clear.**

---

## 13. Out of Scope (V5.1+ ideas, not now)

- Multi-product domain packs (real-estate pack, legal pack)
- Cross-product pattern promotion UX
- Slack-bot interface to V5 (build features by Slack DM)
- Cost dashboarding (per-feature token + minute spend visualization)
- Team review workflows
- Open-source / external distribution
- Non-Supabase data adapter
- Non-Vercel deploy adapter

These are deliberately deferred. V5 ships **scoped or doesn't ship.**

---

## 14. Open Questions (resolve before Phase B)

| ID | Question | Default if unresolved |
|---|---|---|
| **OQ-1** | What's the failure mode if Plan Mode is rejected three times in a row on the same prompt? | Silent exit after each. After 3rd, V5 prompts operator: "Refine intent or abort?" |
| **OQ-2** | Per-product `memory/learned/` namespacing — what's the slug source? | Repo `name` field in package.json |
| **OQ-3** | Should Gate 6 watchdog cover preview deploys, or only `main`? | `main` only. Previews are throwaway. |
| **OQ-4** | Cleanup policy for `memory/logs/` — operator said "keep all locally," but logs older than 1 year? | Keep indefinitely; revisit at V5.1 |
| **OQ-5** | What happens if Vercel preview URL never arrives within 60s polling window? | Fall back to `vercel ls --json`, then to operator manual report. Log warning, don't halt. |

These are tracked in `directives/000-v5-open-questions.md` for the build phase.

---

## 15. Amendment Process

This spec is the canonical reference for V5 development. Amend via PR to `VIBE_OS_V5_SPEC.md` with:
- Rationale (why the change is needed)
- Impact assessment (which decisions of record are affected)
- Backward-compat note (does it break Phase A–F sequencing)

All implementation decisions trace back to **D-01 through D-11**. New decisions get D-12, D-13, etc., appended to §0.

---

**End of V5.0 specification draft.**
