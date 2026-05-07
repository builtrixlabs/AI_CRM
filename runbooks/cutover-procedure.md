# Runbook: V3 → V4 Cutover Procedure

**Audience:** Operator (Raghava). All steps require explicit operator action — Claude does not execute these autonomously.

**Goal:** Promote V4 from `v4` branch to `main` once the framework smoke test (and any operator-driven validation) passes.

**Reframe note:** PRD §8.2 step 5.4 originally called for "two consecutive Finance OS feature builds." VIBE_CODE_OS is now a **generic scaffolding framework** (no specific app). Validation is via:
1. The framework smoke test (`tests/plugin/smoke.test.mjs`) — already automated, runs in CI.
2. (Optional) An operator-driven scaffold-and-build dry-run — see "Optional manual validation" below.

---

## Pre-cutover checklist

- [ ] All 50+ tests passing on `v4` branch: `npm run test:v4`
- [ ] No uncommitted changes on `v4` (other than what you intend to merge)
- [ ] `CLAUDE.md` is the V4 version (≤300 lines, declares V4.0)
- [ ] `package.json` version is `4.0.0-rc.1` (or higher RC) — not yet `4.0.0`
- [ ] `baseline/hashes.json` matches the V4 CLAUDE.md hash
- [ ] No app-specific code in `src/` (smoke test confirms this)

---

## Step 5.1 — Tag V3 final state

V3's most recent commit on `v3` branch is the canonical "V3 final" reference. Tag it so future operators can always recover the V3 codebase exactly.

```bash
git checkout v3
git pull origin v3
git tag -a v3-final -m "Vibe Coding OS V3.0 final state, before V4 cutover"
git push origin v3-final
```

**Rollback:** `git tag -d v3-final && git push origin :refs/tags/v3-final`

---

## Step 5.2 — Commit + push v4 branch (if not already)

If you've been holding off on commits during V4 dev, now's the time. Commit the cumulative V4 work:

```bash
git checkout v4
git add .
git commit -m "feat: Vibe Coding OS V4.0 — Claude-native (hooks + skills + subagents + plugin)"
git push -u origin v4
```

**Rollback:** the work is on `v4` — `git restore` per-file or `git reset` if needed.

---

## Step 5.3 — (Optional) Manual scaffold-and-build validation

Before cutting over to `main`, operator can do an end-to-end smoke:

```bash
# Scaffold a throwaway app
mkdir /tmp/v4-validation && cd /tmp/v4-validation
node /path/to/VIBE_CODE_OS/plugin/bin/cli.mjs init .

# Verify the scaffold passes its own framework tests
npm install
npm run test:hooks
npm run test:skills
npm run test:agents

# Open in Claude Code, run a tiny build
claude
# > Build feature: a hello-world page that says "Vibe OS V4 works"
```

If the pipeline completes Gate 5 with a Vercel preview URL, V4 is operationally validated. Tear down the throwaway:

```bash
cd / && rm -rf /tmp/v4-validation
```

This step is **optional**: the framework smoke test (`tests/plugin/smoke.test.mjs`) already validates scaffolding mechanics. The manual validation only adds end-to-end pipeline confidence.

---

## Step 5.4 — Update top-level README and merge

The README at repo root is already V4-aware (`Vibe Coding OS V4`). Confirm it's current:

```bash
git checkout v4
head -3 README.md   # should say "Vibe Coding OS V4"
```

Merge `v4` → `main` via PR (recommended) or directly:

### Via PR (preferred — adds review surface)

```bash
gh pr create --base main --head v4 \
  --title "feat: Vibe Coding OS V4.0 — Claude-native cutover" \
  --body "Cumulative V4 work: hooks, skills, subagents, plugin, V4 CLAUDE.md, runbooks."

# After review/CI:
gh pr merge --merge   # or --squash, your preference
```

### Direct merge (if no review desired)

```bash
git checkout main
git pull origin main
git merge --no-ff v4 -m "feat: V4.0 cutover"
git push origin main
```

**Rollback:** `git revert -m 1 <merge-sha> && git push origin main`

---

## Step 5.5 — Bump to 4.0.0 (drop -rc)

Once `main` has V4 and you've run at least one real feature build successfully:

1. Edit `package.json`: `"version": "4.0.0"` (drop `-rc.1`)
2. Edit `plugin/plugin.json`: `"version": "4.0.0"` (drop `-rc.1`)
3. Commit and tag:

```bash
git add package.json plugin/plugin.json
git commit -m "chore: bump Vibe OS to 4.0.0"
git tag -a v4.0.0 -m "Vibe Coding OS V4.0.0 — first stable V4 release"
git push origin main v4.0.0
```

**Rollback:** `git tag -d v4.0.0 && git push origin :refs/tags/v4.0.0` and revert the version bump commit.

---

## Step 5.6 — Update changelog

Create `CHANGELOG.md` if not present:

```markdown
# Vibe Coding OS — Changelog

## 4.0.0 — 2026-MM-DD
- Claude-native edition
- Hooks: deterministic governance (replaces AI-promise rules)
- Skills: 7 on-demand knowledge bundles
- Subagents: 7 delegated-context agents (replace agent-shield + learning-engine MCPs)
- Plugin: vibe-os CLI with init/upgrade/health
- New baselines: 010 (plugin contract), 011 (hook contract), 012 (subagent contract)
- New runbooks: gate-3, gate-4, hook-false-positive, phase-3-ab-comparison, cutover-procedure
- CLAUDE.md trimmed: 416 → 248 lines
- Migration: V3→V4 reversible script in plugin/migrations/0001-v3-to-v4.mjs
```

---

## Post-cutover

After cutover, V3 lives on at `tags/v3-final` and the `v3` branch (don't delete the branch — useful as a reference). New work happens on `main` (V4). New apps scaffold from `main` via `vibe-os init`.

Phase 6 (Rollout to other Builtrix products) per the PRD is **operator-driven, app-by-app, on demand**. Each new SaaS product is `npx vibe-os init <new-app>` from any V4-tagged commit.

---

## When NOT to cut over

Hold the cutover if:

- Any V4 test is failing on the `v4` branch
- The framework smoke test (`tests/plugin/smoke.test.mjs`) is failing
- You haven't yet committed/pushed the `v4` branch (operator preference; some prefer to ship V4 work in one go vs. incremental commits)
- The optional manual validation (step 5.3) revealed a regression

Cutover is reversible (revert the merge), but it's much cleaner to delay than to roll back live `main`.
