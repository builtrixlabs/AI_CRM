# Install & First Build — Builtrix AI_CRM on Vibe Coding OS V5

**Audience:** Raghava
**Purpose:** Step-by-step from "I have zip + docs" → "Claude Code is building the CRM."
**Working dir (this repo):** `C:\Users\ragha\OneDrive\Desktop\AI_CRM`
**GitHub remote:** [builtrixlabs/AI_CRM](https://github.com/builtrixlabs/AI_CRM)
**Supabase project:** `bwumqahgwobwghlmzcrl` ("AI CRM", ap-south-1 / Mumbai)
**OS:** Windows 11 + PowerShell (Git Bash also available)

> Note: original draft of this plan referenced macOS commands and placeholder
> filenames `01-builtrix-crm-constitution-v2.0.md` / `02-builtrix-crm-consolidated-prd-v2.0.md`.
> Those filenames were a guess by the model that drafted the plan — no such files
> exist on disk yet. Wherever the plan says "constitution" or "PRD", treat the
> filename as TBD and drop in whatever the actual deliverable ends up being.

---

## TL;DR — The 4-step plan

| Step | What you do | Time | Output |
|---|---|---|---|
| **1** | Verify CLIs (`gh`, `jq`, `supabase`, `vercel`, `claude`); unzip V5 source to `C:\Users\ragha\builtrix\vibe-os-v5`; run V5 self-tests | 30 min | V5 source on disk, prereqs verified |
| **2** | Scaffold this repo from V5; drop in constitution + PRD; commit + push | 30 min | V5-shaped repo on GitHub + Vercel + Supabase linked |
| **3** | Open Claude Code in this repo. Give it the **first prompt** (§3.3) | 10 min | Plan Mode opens with directive D-001 |
| **4** | Approve Plan Mode → Claude executes Gates 3-5 → preview URL | 15 min | First green build of CRM scaffold deployed |

**Total:** ~90 minutes from zero to "Claude is shipping features."

---

## Status as of 2026-05-07

### Already done
- [x] Node v24.13.0, Git 2.52, gh 2.85 (authed as `builtrixlabs`), jq 1.8, Supabase CLI 2.98.1, Vercel CLI 53.1.1 (authed as `builtrixlabs`)
- [x] GitHub repo `builtrixlabs/AI_CRM` exists; remote `origin` set; `main` branch exists
- [x] Supabase project `bwumqahgwobwghlmzcrl` exists; `supabase init` and `supabase link` done
- [x] Initial commit pushed (commit `14896a4`): `.gitignore`, `.env.example`, `supabase/`
- [x] `.env` created locally (gitignored) with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
- [x] Constitution v2.0 at `memory/constitution.md` (from `01-builtrix-crm-constitution-v2.0.md`)
- [x] Consolidated PRD v2.0 at `docs/PRD.md` (from `02-builtrix-crm-consolidated-prd-v2.0.md`)
- [x] v1 constitution archived at `docs/archive/builtrix-crm-constitution-v1.md`

### Still to do (blockers in **bold**)
- [ ] `claude` CLI installed in PATH (currently missing — see §1.1)
- [ ] V5 zip extracted to `C:\Users\ragha\builtrix\vibe-os-v5`
- [ ] V5 self-tests pass
- [ ] V5 scaffolder run on this repo (`init.mjs`)
- [ ] `.env` filled in: `SUPABASE_SERVICE_ROLE_KEY` and DB password in `DATABASE_URL`
- [ ] After V5 scaffold: rename / migrate env vars to `NEXT_PUBLIC_*` form in `.env.local` (V5 expects Next.js naming)
- [ ] Empty Vercel project created + `vercel link`
- [ ] `npm install`, `npm run build` succeeds
- [ ] `bash scripts/v5/check-prereqs.sh --strict` exits 0

---

## Step 1 — Install Vibe Coding OS V5

### 1.1 Prerequisites (verify before starting)

| Tool | Min version | Verify (PowerShell) | Status |
|---|---|---|---|
| Node.js | ≥ 18 | `node --version` | ✓ v24.13.0 |
| Git | any recent | `git --version` | ✓ 2.52 |
| GitHub CLI | ≥ 2.40 | `gh auth status` | ✓ authed as `builtrixlabs` |
| `jq` | ≥ 1.6 | `jq --version` | ✓ 1.8.1 |
| Supabase CLI | ≥ 2.74 | `supabase --version` | ✓ 2.98.1 |
| Vercel CLI | ≥ 50.x | `vercel whoami` | ✓ authed as `builtrixlabs` |
| Claude Code CLI | latest | `claude --version` | ✗ not in PATH |

If the `claude` CLI is missing on Windows:

```powershell
npm install -g @anthropic-ai/claude-code
claude --version
```

(Or use the IDE integration / desktop app — but the V5 doc's `cd ... ; claude` step
needs the CLI to launch a session from the repo root.)

### 1.2 Install V5 to a stable location

V5 lives **outside** any product repo so multiple projects can share it.

```powershell
# Choose where V5 lives. NOT inside this repo.
New-Item -ItemType Directory -Force -Path "$HOME\builtrix" | Out-Null
Set-Location "$HOME\builtrix"

# Unzip V5 (zip is at C:\Users\ragha\Downloads\VIBE_CODE_OS-5.zip)
Expand-Archive -LiteralPath "$HOME\Downloads\VIBE_CODE_OS-5.zip" -DestinationPath . -Force
Rename-Item VIBE_CODE_OS-5 vibe-os-v5

# Install V5's own deps (one time)
Set-Location vibe-os-v5
npm install

# Run V5's own self-tests to confirm install is clean
npm run test:hooks      # 17 tests
npm run test:skills     # 7 tests
npm run test:agents     # 9 tests
npm run test:plugin     # 6 tests
# Should see ~39 passes total. If any fail, stop and fix before proceeding.
```

If something fails here, V5 itself is broken on your machine — don't proceed.

### 1.3 Verify the scaffolder

```powershell
node "$HOME\builtrix\vibe-os-v5\plugin\bin\init.mjs" --dry-run "$env:TEMP\throwaway-crm"
# Should print "(dry-run) Would copy: ..." with no errors
```

---

## Step 2 — Scaffold this repo

### 2.1 External resources — current state

| Service | Action | Status |
|---|---|---|
| **GitHub** | Repo `builtrixlabs/AI_CRM` (private) | ✓ exists, `main` branch pushed |
| **Supabase** | Project "AI CRM" in ap-south-1 (Mumbai) | ✓ ref `bwumqahgwobwghlmzcrl` |
| **Vercel** | Empty project for AI CRM | ✗ TODO |

Reference values (from current `.env`):

```
GITHUB_REPO_HTTPS=https://github.com/builtrixlabs/AI_CRM.git
SUPABASE_PROJECT_REF=bwumqahgwobwghlmzcrl
SUPABASE_URL=https://bwumqahgwobwghlmzcrl.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_1BSB1fQwcW5GvStH7fkJUg_UR_NGhfR
SUPABASE_SERVICE_ROLE_KEY=<TODO: from dashboard → Project Settings → API>
SUPABASE_DB_PASSWORD=<TODO: from dashboard → Project Settings → Database>
```

### 2.2 Run the V5 scaffolder

```powershell
Set-Location "C:\Users\ragha\OneDrive\Desktop\AI_CRM"

# init.mjs will write into the current dir. We already have .git, .gitignore,
# .env, .env.example, and supabase/ — V5's init may add or overlay files.
# If init.mjs refuses to run on a non-empty dir, pass --force or move our
# pre-existing files temporarily and merge afterward.

node "$HOME\builtrix\vibe-os-v5\plugin\bin\init.mjs" .
npm install
npm run prepare        # husky pre-commit hook
```

After this you should have V5's structure on top of what we already have:
- `.claude/hooks/`, `.claude/skills/`, `.claude/agents/` — V5 guardrails + skills
- `policy/`, `baseline/` — read-only governance
- `memory/`, `directives/`, `orchestration/`, `execution/` — working folders
- `scripts/v5/` — bash orchestration
- `CLAUDE.md` — runtime constitution for V5
- `package.json` — locked stack (Next.js 16 / React 19 / TS strict / Supabase / Vercel / shadcn / Vitest / Playwright)

### 2.3 Drop in the CRM-specific governance docs — **DONE 2026-05-07**

The two filenames the original draft guessed at do exist as deliverables in
`C:\Users\ragha\Downloads`. They are now in place:

| Source | Destination |
|---|---|
| `Downloads\01-builtrix-crm-constitution-v2.0.md` | `memory\constitution.md` |
| `Downloads\02-builtrix-crm-consolidated-prd-v2.0.md` | `docs\PRD.md` |
| `Downloads\builtrix-crm-constitution.md` (v1, superseded) | `docs\archive\builtrix-crm-constitution-v1.md` |

For reference, the commands that were run:

```powershell
New-Item -ItemType Directory -Force -Path memory, docs\archive | Out-Null
Copy-Item "$HOME\Downloads\01-builtrix-crm-constitution-v2.0.md" "memory\constitution.md"
Copy-Item "$HOME\Downloads\02-builtrix-crm-consolidated-prd-v2.0.md" "docs\PRD.md"
Copy-Item "$HOME\Downloads\builtrix-crm-constitution.md" "docs\archive\builtrix-crm-constitution-v1.md"
```

> Note: the consolidated PRD §14 references two source PRDs
> (`Builtrix-CRM-PRD-v1.md`, `builtrix-ai-native-crm-prd-v1.md`) — neither is
> on disk. The consolidated v2 absorbed them; treat §14 as a historical
> reference, not a missing-file checklist.

### 2.4 Wire env vars

V5 / Next.js convention is `.env.local` with `NEXT_PUBLIC_` prefix on
client-exposed values. Our existing `.env` should be migrated:

```powershell
# Create .env.local (NEVER commit — V5's .gitignore will cover it)
@'
NEXT_PUBLIC_SUPABASE_URL=https://bwumqahgwobwghlmzcrl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_1BSB1fQwcW5GvStH7fkJUg_UR_NGhfR
SUPABASE_SERVICE_ROLE_KEY=<paste-from-dashboard>
SUPABASE_PROJECT_REF=bwumqahgwobwghlmzcrl
DATABASE_URL=postgresql://postgres:<password>@db.bwumqahgwobwghlmzcrl.supabase.co:5432/postgres
ANTHROPIC_API_KEY=<your key>
OPENAI_API_KEY=<your key, fallback>
'@ | Set-Content -Encoding utf8 .env.local

# Verify the secret scanner blocks .env.local commits
git status   # should NOT list .env.local
```

After `.env.local` is in place, the bare `.env` we created earlier can be
deleted (or kept as a server-side-only secret store if a non-Next runtime
ends up needing it).

### 2.5 Link external services + commit

```powershell
# Link Vercel (will prompt to create or pick a project)
vercel link

# Supabase already linked, but verify
supabase projects list   # AI CRM should show ●

# Verify all CLI prereqs via V5's strict check
bash scripts/v5/check-prereqs.sh --strict
# Must exit 0. If not, fix before proceeding.

# Commit the scaffold
git add -A
git status   # confirm .env / .env.local are NOT listed
git commit -m "chore: scaffold AI_CRM from Vibe Coding OS V5"
git push
```

### 2.6 Verify the scaffold builds locally

```powershell
npm run build      # should compile Next.js 16 with no errors
npm run test       # may have 0 tests at this point — that's fine
```

If `npm run build` fails, do not proceed to Step 3. Fix the scaffold first.

---

## Step 3 — The first prompt to Claude Code

Now the V5 magic begins.

### 3.1 Open Claude Code in this repo

```powershell
Set-Location "C:\Users\ragha\OneDrive\Desktop\AI_CRM"
claude
```

Claude Code opens. **Bypass-permissions ON** is required (set in Claude Code
settings). V5's `SessionStart` hook will warn you if it's off.

### 3.2 Verify Claude reads the constitution

First message:

> Confirm you can read the following files and summarize what they say:
> 1. `CLAUDE.md` (V5 runtime constitution)
> 2. `memory/constitution.md` (Builtrix CRM Constitution)
> 3. `docs/PRD.md` (Consolidated PRD)
>
> Do NOT propose any code changes yet. Just summarize and confirm authority order.

Claude should respond with summaries of all three docs and recite the
authority order:

```
hook → constitution → policy → baseline → memory → learned patterns → directive → conversation
```

If Claude doesn't recite that order or doesn't recognize the constitution,
stop. Something's misconfigured.

### 3.3 The actual first build prompt — D-001

This is the **single prompt** that boots the project.

```
Build feature: V0 D-001 — Multi-tenancy foundation.

Per the Consolidated PRD §11 V0 Week 1-2, build the multi-tenancy foundation:

1. Migrations under supabase/migrations/:
   - 001_orgs_and_workspaces.sql:
       organizations, workspaces, teams, profiles
       with full provenance fields per Constitution III
   - 002_users_and_auth.sql:
       link Supabase auth.users to profiles
       base_role enum: 'super_admin' | 'org_owner' | 'org_admin' |
                       'workspace_admin' | 'manager' | 'sales_rep' |
                       'read_only' | 'channel_partner' | 'service_account'
   - 003_user_app_roles_bridge.sql:
       user_app_roles table (user_id, organization_id, workspace_id,
       product_id default 'crm', app_role, granted_by, reason +
       provenance)
   - 004_audit_log.sql:
       append-only audit_log table per Constitution IV schema
       (full schema in §Provenance & Audit Trail Schema)
       RLS: nobody can UPDATE or DELETE; service_role inserts only
   - 005_rls_policies.sql:
       org-isolation + workspace-scope policies on all tables
       (super_admin gets ZERO operational read access — write a
       negative test that proves it)

2. Seeding script scripts/bootstrap-super-admin.sh:
   - Takes one arg: super_admin email
   - Creates row in profiles with base_role='super_admin'
   - Sends Supabase Auth magic link
   - Logs to audit_log: action='bootstrap_super_admin'

3. Server-side auth helpers in src/lib/auth/:
   - getCurrentUser() — returns { user, profile, org_id, workspace_ids[], role, app_roles[] }
   - middleware.ts at src/middleware.ts:
       super_admin → /platform/* only
       org_admin → /admin/*, /settings/*, /dashboard/* (read-only by default)
       operational roles → /dashboard/*
       channel_partner → scoped /dashboard subset
       service accounts → API only, no UI
       Hard redirects on violation.

4. Tests (Vitest unit + Playwright e2e per V5 D-06):
   - Unit: RBAC resolver tests (3-layer effective permissions)
   - Unit: Audit log immutability test (UPDATE/DELETE must throw)
   - E2E @smoke: super_admin redirected from /dashboard → /platform
   - E2E @smoke: org_admin redirected from /platform → /admin
   - E2E @regression: cross-tenant lead read returns 0 rows under RLS
   - E2E @regression: channel_partner cannot see another CP's leads

5. No UI yet beyond redirect targets — those are placeholder pages
   that say "Coming next directive."

Constraints:
- Constitution binding (especially II tenant isolation, III provenance,
  IV audit log, VII stack discipline)
- Coverage targets: ≥80% lines / ≥90% branches per V5 D-06
- All migrations additive — no destructive changes
- Soft-delete only — no DROP/DELETE outside seeding
- All tables include provenance fields
- Every state-changing action writes to audit_log

Do NOT include in this directive: agent runtime, canvas component,
graph data model (those are D-002/D-003/D-007), custom fields,
dashboards, integrations.

Generate Plan Mode artifacts:
- directives/001-multi-tenancy-foundation.md
- orchestration/001-multi-tenancy-foundation/{spec,plan,tasks}.md
```

### 3.4 What happens next

```
You hit enter
   ↓
Gate 1 (auto): directive-from-prompt skill writes directives/001-multi-tenancy-foundation.md
   ↓
Gate 2 (HUMAN — Plan Mode): plan-gen.sh writes orchestration/001-.../{spec,plan,tasks}.md
                            Plan Mode engages in Claude Code
                            ▶ You review. Approve / Edit / Reject.
   ↓
Gate 3 (auto, TDD): for each task: failing test → minimal impl → refactor
                    Migrations applied to Supabase preview branch
                    Coverage check
   ↓
Gate 4 (auto): build + test:coverage + test:playwright + security scan
   ↓
Gate 5 (auto): branch feature/001-multi-tenancy-foundation → push → Vercel preview URL
   ↓
You: click preview URL, smoke-test the redirect behavior, merge to main
   ↓
Gate 6 (auto, post-merge): GitHub Action watchdog armed
```

**Plan Mode is your one human checkpoint.** Read the plan carefully. Reject if
it includes anything outside the directive scope. Approve if it matches.

---

## Step 4 — The V0 build sequence (the next 14 directives)

After D-001 ships, give Claude these prompts in order. **One at a time.**
Wait for each to land green on main before starting the next.

| # | Directive prompt seed | What lands |
|---|---|---|
| **D-002** | `Build feature: V0 D-002 — Graph data model. Per PRD §7, build nodes + edges + node_signals tables with pgvector setup, RLS, embedding queue (Inngest job), Zod schemas in src/lib/nodes/schemas/<type>.ts for all 10 node types. Constitution VI binding (this is a baseline-tier table set). Coverage 80/90. Includes a baseline doc baseline/110-graph-data-model.md.` | Graph foundation |
| **D-003** | `Build feature: V0 D-003 — RBAC engine. Per PRD §9, build src/lib/auth/rbac.ts (~120 perms × 9 roles), role_permission_overrides table, three-layer effective-permissions resolver, server-action helpers. Coverage 80/90. PLATFORM_ONLY_PERMISSIONS list locked. Tests for deny-wins, override allow, base+bridge resolution.` | Permission engine |
| **D-004** | `Build feature: V0 D-004 — Super admin surfaces. Per PRD §4, build /platform/* routes: home, organizations list, organizations/new (provisioning form), organizations/[id], subscriptions, analytics, audit, costs, tickets, settings. Use shadcn/ui. Amber banner on /platform reaffirming zero-operational-data-access. RLS prevents super_admin from reading any org table. Tests verify all redirects.` | super_admin surfaces |
| **D-005** | `Build feature: V0 D-005 — Org admin cockpit + onboarding wizard. Per PRD §5.2 + §5.3, build /admin landing (3 rows of cards), 8-step onboarding wizard with steps 1+3 hard-gated, onboarding_state JSONB on organizations table. Sample-lead demo step uses synthetic data.` | org_admin cockpit |
| **D-006** | `Build feature: V0 D-006 — Intelligent Canvas component (Lead canvas only). Per PRD §6, build Canvas shell (Framer Motion), adaptive field renderer, Activity Stream (Supabase Realtime), Suggested action card placeholder, agent panel placeholder. baseline/112-canvas-contract.md. Coverage 80/90.` | Canvas foundation |
| **D-007** | `Build feature: V0 D-007 — Lead create + edit + stage transitions on Canvas. Per PRD §8, build Lead lifecycle on Canvas: create from /dashboard, all 7 stage transitions, terminal states (Lost/On Hold/Junk). Audit every state change. Provenance on every write.` | Lead lifecycle |
| **D-008** | `Build feature: V0 D-008 — Cmd+K bounded catalog. Per PRD §6.6 V0 scope, build Cmd+K (cmdk library) with 30-query catalog: open lead/deal/contact by name, navigation, "show hot leads", "show today's site visits", etc. p95 < 300ms. No free-form NL yet.` | Cmd+K |
| **D-009** | `Build feature: V0 D-009 — Model Gateway V0 + Lead Enrichment Agent (T1). Per PRD §11 D-010, build src/lib/ai/gateway.ts with Anthropic-default + OpenAI-fallback, per-tenant token budget cap (warn 80%, hard-stop 100%). Build Lead Enrichment Agent as the first T1 service account: reads incoming lead, sets initial intent score, writes to audit_log with agent_tier='T1'. baseline/115-model-gateway-contract.md.` | First agent + LLM gateway |
| **D-010** | `Build feature: V0 D-010 — Activity Stream + WhatsApp inbound webhook. Build /api/webhooks/whatsapp (idempotent by message ID), creates an activity node + edge to relevant lead. Activity Stream component on Canvas subscribes via Supabase Realtime. Mask PII in logs (Constitution VII).` | Touchpoint logging |
| **D-011** | `Build feature: V0 D-011 — DOE Workflow Engine V0 + 15 pre-built directives. Per PRD §5.7 + Constitution V, build directives + directive_invocations tables, runtime that triggers directives on events, executes tier-bounded actions, logs every invocation in audit_log with directive_id. Ship the 15 pre-built directives D-01 through D-15 from PRD §5.7.1.` | DOE engine |
| **D-012** | `Build feature: V0 D-012 — Site Visit node + Google Calendar integration. Build site_visit node type with full canvas, scheduling UX on Canvas (no separate calendar app), Site Visit Reminder Agent (T2) sending 24h + 2h templated WhatsApp reminders. Google Calendar OAuth + slot-block.` | Site visits |
| **D-013** | `Build feature: V0 D-013 — Call Audit event bus integration. Build /api/events/inbox webhook idempotent by event_id, accepts call.audited and call.objection_detected events, creates call node attached to lead/deal, triggers directive D-09 on objection. PRD §6 sister-product integration.` | Call Audit hand-off |
| **D-014** | `Build feature: V0 D-014 — V0 hardening pass. Run full RLS audit suite (positive + negative tests for every table), p95 perf check on Canvas load (<1.5s with 50 activities), security scan with auto-fix for HIGH/MED, pen-test the channel_partner isolation. No new features. Documentation pass on memory/decisions.md and docs/architecture.md.` | V0 ready for pilot |
| **D-015** | `Build feature: V0 D-015 — Pilot onboarding. Provision the first paying pilot org via super_admin flow. Set up integrations. Onboard 1 sales rep. Smoke test the entire flow end-to-end. NOTE: this directive is mostly operational, not code — it's the V0 acceptance gate.` | Pilot live |

---

## Step 5 — Operational discipline (every directive)

For every D-XXX after D-001, follow this loop:

```
1. You: paste the directive prompt into Claude Code
2. Claude (Gate 1): writes directives/<NNN>-<slug>.md
3. Claude (Gate 2): plan-gen.sh writes spec + plan + tasks
   ▶ Plan Mode engages
4. You: review plan; approve / edit / reject
5. Claude (Gates 3-5): TDD execute → verify → push → preview URL
6. You: click preview URL, smoke test
7. You: if good → merge to main; watchdog (Gate 6) arms
8. You: WAIT for watchdog green before next directive
```

**Anti-patterns to avoid:**
- Don't fire 2 directives in parallel in different Claude Code sessions (V5 D-09 — one session = one umbrella build)
- Don't bypass Plan Mode by saying "skip planning, just build" — that's how you ship constitution violations
- Don't manually edit `memory/constitution.md`, `policy/`, or `baseline/` — hooks block this; if a real change is needed, use a constitution-amendment directive
- Don't merge a directive's PR until preview URL works AND watchdog Gate 6 is green
- Don't skip the V0 hardening pass (D-014). It's where RLS bugs and isolation leaks surface.

---

## Step 6 — When things go wrong

| Symptom | Runbook |
|---|---|
| Plan Mode rejected 3× on same prompt | `runbooks/plan-mode-rejection.md` — refine intent or split directive |
| Gate 3 fails (TDD red after retry) | `runbooks/gate-3-failure.md` — usually means task spec is unclear; re-plan |
| Gate 4 finds CRITICAL security | Auto-fix loop runs 3× max; if still fails → `runbooks/gate-4-failure.md` |
| Gate 6 watchdog auto-reverts | `runbooks/gate-6-watchdog-failure.md` — feature branch recreated; check the issue Watchdog opened |
| Hook blocks a legitimate write | `runbooks/hook-false-positive.md` — file an exception, never bypass |
| Constitution violation flagged in Plan Mode | Re-read the violated principle; reshape the directive scope |

---

## Quick reference — file map after V0

```
C:\Users\ragha\
├── builtrix\vibe-os-v5\              Vibe Coding OS V5 source (don't edit; reinstall to update)
└── OneDrive\Desktop\AI_CRM\          The CRM repo (this folder)
    ├── CLAUDE.md                     V5 runtime constitution (don't edit)
    ├── memory\
    │   ├── constitution.md           Builtrix CRM Constitution (edit via amendment directive only)
    │   ├── decisions.md              Decision log (append after each directive)
    │   ├── learned\crm\              Pattern library (auto-extracted by V5)
    │   └── logs\                     Execution + gate + security + regression logs
    ├── docs\
    │   ├── install-plan.md           This document
    │   ├── PRD.md                    Consolidated PRD
    │   └── archive\                  Source PRDs (read-only reference)
    ├── policy\                       V5 governance (don't edit)
    ├── baseline\                     V5 + CRM-specific baselines
    ├── directives\                   Append-only feature directives (D-001 → D-015 by V0)
    ├── orchestration\                Per-directive spec/plan/tasks
    ├── execution\                    Implementation artifacts per directive
    ├── scripts\v5\                   V5 bash orchestration (don't edit)
    ├── scripts\                      CRM-specific scripts (bootstrap-super-admin.sh, etc.)
    ├── supabase\migrations\          All migrations (additive only)
    ├── src\                          Application code
    │   ├── app\                      Next.js 16 App Router
    │   │   ├── (platform)\platform\  super_admin surfaces
    │   │   ├── (admin)\admin\        org_admin surfaces
    │   │   ├── (settings)\settings\  org_admin sub-surfaces
    │   │   └── (dashboard)\dashboard\ operational surfaces (Canvas)
    │   ├── lib\
    │   │   ├── auth\                 RBAC + middleware
    │   │   ├── ai\                   Model Gateway
    │   │   ├── agents\               Agent runtime + tier enforcement
    │   │   ├── nodes\                Graph schemas
    │   │   └── doe\                  Directive engine
    │   └── components\               UI (Canvas, shadcn, Cmd+K)
    └── tests\                        Vitest + Playwright
```

> **Note on OneDrive:** this repo lives under `C:\Users\ragha\OneDrive\Desktop\AI_CRM`.
> OneDrive sync occasionally races with `.git/index.lock` and `.git/packed-refs`
> on Windows. If you start seeing intermittent git lock errors, exclude this
> folder from OneDrive sync (right-click → "Free up space" or "Always keep on
> this device" + selective sync).

---

## Final sanity check before D-001

- [ ] V5 source on disk at `C:\Users\ragha\builtrix\vibe-os-v5`, self-tests pass
- [ ] `claude` CLI installed and on PATH
- [x] All other CLI prereqs installed and authed (gh, jq, supabase, vercel)
- [x] GitHub repo `builtrixlabs/AI_CRM` created
- [x] Supabase project `bwumqahgwobwghlmzcrl` created in ap-south-1
- [ ] Vercel project for AI CRM created
- [ ] Repo scaffolded via `init.mjs`
- [x] Constitution at `memory/constitution.md`
- [x] Consolidated PRD at `docs/PRD.md`
- [ ] `.env.local` written with full key set, NOT committed
- [x] First commit pushed to GitHub main
- [ ] `npm run build` succeeds locally
- [ ] `bash scripts/v5/check-prereqs.sh --strict` exits 0
- [ ] `vercel link` done
- [x] `supabase link` done
- [ ] Claude Code opens in this repo with bypass-permissions ON

When all 14 unticked boxes are ticked → paste the D-001 prompt from §3.3 and watch V5 do its thing.

---

**Document status:** v1.1 — adapted to actual repo layout (Windows + OneDrive Desktop, builtrixlabs/AI_CRM, Mumbai Supabase) on 2026-05-07. Original v1.0 was generated for a hypothetical macOS layout with placeholder doc filenames.
