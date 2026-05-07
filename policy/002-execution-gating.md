# POLICY 002 — Execution Gating (V2.1: Five-Gate Autonomous)

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-03-05
**Supersedes**: Policy 002 V1 (Four-Gate Manual)

---

## Purpose

This policy defines the mandatory five-gate pipeline that controls feature development from intent to deployment. All gates auto-proceed on success. No human approval required.

---

## The Five Gates

```
GATE 1: Directive → GATE 2: Orchestration → GATE 3: Execution → GATE 4: Verification → GATE 5: Deployment
```

**No gate may be skipped.**
**All gates auto-proceed on success.**
**Gates are sequential — no parallel gate execution.**

---

## GATE 1 — Directive

### Requirement
A directive file MUST exist at `/directives/[feature-name].md`

### In V2.1: AI Auto-Generates Directives
When user provides natural language feature request, AI generates the directive with:

1. **Problem Statement** — What needs to be built and why
2. **Success Criteria** — Measurable outcomes
3. **Constraints** — Tech stack, patterns, limitations
4. **Out of Scope** — What's NOT included

### Auto-Proceed Condition
Directive file exists with all required sections → **AUTO-PROCEED**

### On Failure
Directive incomplete → AI completes it and retries. No human needed.

---

## GATE 2 — Orchestration

### Requirement
Plan artifacts MUST exist in `/orchestration/[feature-name]/` and `/specs/[feature-name]/`

### Actions
1. Run speckit.specify → specification
2. Run speckit.plan → implementation plan with data model
3. Run speckit.tasks → ordered task list
4. Send Message Bus notifications to relevant MCPs

### Required Plan Content
- Task breakdown (ordered, atomic steps)
- MCP responsibility mapping
- Dependency analysis
- File creation/modification list
- Test plan

### Auto-Proceed Condition
Plan complete with all sections → **AUTO-PROCEED**

### On Failure
Plan incomplete → AI completes it. No human needed.

---

## GATE 3 — Execution

### Requirement
Feature code written to `/src` and/or `/execution/[feature-name]/`

### Actions
1. Install shadcn components (via Message Bus handoff from speckit)
2. Create Supabase migrations (via Message Bus handoff from speckit)
3. Write application code following the plan
4. Write test files
5. Log all file operations

### Execution Boundaries

**AI MAY write to:**
- `/src/**` — Application source code
- `/execution/[feature-name]/**` — Feature-specific implementation
- `/tests/[feature-name]/**` — Feature tests
- `/memory/**` — Action logs
- `/orchestration/**` — Plan updates

**AI MAY NOT write to:**
- `/policy/**` — NEVER
- `/baseline/**` — NEVER (without migration)

### Auto-Proceed Condition
All planned tasks complete → **AUTO-PROCEED**

---

## GATE 4 — Verification

### Requirement
Build passes. Tests pass.

### Actions
1. `npm run build` — TypeScript type-check + build
2. `npm run test` — Vitest unit tests
3. `npm run test:playwright` — E2E tests (if configured)

### Auto-Retry Protocol
- On failure: AI analyzes error, fixes code, retries ONCE
- On second failure: STOP and report

### Auto-Proceed Condition
All checks pass → **AUTO-PROCEED**

---

## GATE 5 — Deployment

### Requirement
Gate 4 passed. Feature branch created and pushed.

### Actions
1. `git checkout -b feature/[name]`
2. `git add .`
3. `git commit -m "feat([scope]): [description]"`
4. `git push origin feature/[name]`
5. Vercel auto-builds preview deployment
6. Log completion to `/memory/logs/execution/`
7. Report preview URL

### Auto-Proceed Condition
Push succeeds + Vercel builds → **COMPLETE**

### Deployment Rules
- Feature branches ONLY (never direct to main)
- Human reviews preview and merges to main
- Preview URL reported for testing

---

## Gate Bypass — PROHIBITED

No gates may be bypassed. Even "small changes" go through all 5 gates.

The pipeline may be shortened:
- `"no deploy"` → Stops after Gate 4 (skips Gate 5)
- But Gates 1-4 are ALWAYS required for any code change

---

## Conflict Resolution

If gates conflict:
1. Apply authority hierarchy: `policy > baseline > memory > directive > conversation`
2. Log the conflict
3. Higher authority wins
4. Continue execution

---

## Enforcement

This policy is enforced by:
- Execution Gate MCP (auto-validates gate conditions)
- Structure Guardian MCP (validates folder boundaries)
- Intent Logger MCP (logs all gate transitions)

Non-compliance → halt specific action, auto-fix if possible, escalate only if unrecoverable.

---

**END OF POLICY 002 V2.1**
