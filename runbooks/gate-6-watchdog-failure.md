# Runbook — Gate 6 watchdog failure

**Scope:** What to do when the post-merge watchdog itself misbehaves — wrong revert, missed regression, or its own job crashes — rather than when a feature regression triggers a correct revert.

---

## Decision tree

```
Is main currently red?
├── Yes
│   ├── Did the watchdog auto-revert? → "Auto-revert ran" branch
│   └── Did the watchdog NOT revert?  → "Missed regression" branch
└── No
    └── Was a revert performed?       → "False-positive revert" branch
```

---

## "Auto-revert ran" — main is now green again, work to retry

The watchdog reverted the merge commit, recreated the feature branch, opened a GitHub issue. Your next moves:

1. Read the issue body — it has the SHA, the recreated branch, and the revert reason.
2. Inspect what broke. Useful sources:
   - Failed CI run logs (linked from the issue or `gh run list --branch main`)
   - `memory/logs/regressions/<date>.jsonl` — structured event entry
   - `git log feature/<slug>` — your work is preserved on the recreated branch
3. Reproduce the failure locally:
   ```bash
   git checkout feature/<slug>
   npm ci
   npm run build && npm run test && npm run test:smoke
   ```
4. Fix in place on the recreated feature branch. Re-run `Fix: <directive-id>` in Claude Code if you want V5 to drive the fix.
5. Push, open PR, merge. Watchdog re-arms automatically on the new merge.
6. Close the auto-revert issue with a comment pointing at the fix PR.

---

## "Missed regression" — main is red but no revert

Possible causes:

- **Single-run cooldown is engaged.** Spec §10 mandates 2 consecutive reds before reverting (flake mitigation). Wait for the next push or trigger one with an empty merge.
- **Watchdog workflow failed to start.** Check `gh run list --workflow post-merge-watchdog.yml --limit 3`. If the most recent run is missing, GitHub Actions may be down or the workflow file has a YAML error.
- **`gh run list` query in the watchdog logic returned wrong data.** The `Determine consecutive-failure count` step parses previous push runs; a workflow rename or branch rename can break it. Read the step's logs — `prev_conclusion` should be `success` or `failure`.
- **Vercel state never reached `failure`.** If the Vercel integration is offline, the `Check Vercel main deployment status` step returns `unknown` and won't trigger a revert.

If none of the above explains it, manually trigger the revert:

```bash
gh workflow run post-merge-watchdog.yml \
  -f force_revert_sha=<merge-sha>
```

(or run `bash scripts/v5/auto-revert.sh <merge-sha> "manual revert: <reason>"` locally if you have push access to main.)

---

## "False-positive revert" — watchdog reverted a healthy merge

This happens when CI is genuinely flaky — green on third run, but already reverted after the first two. Recovery:

1. Inspect why CI flaked. Look at the original failed runs: was it a network timeout, a race in tests, a stale dep cache?
2. If the underlying code was fine, restore by re-merging:
   ```bash
   # The recreated feature branch should still contain the original work
   git checkout feature/<slug>
   git rebase main             # bring in the revert + any other changes
   gh pr create -t "Restore: <slug> after watchdog false-positive"
   ```
3. After merge, close the auto-revert issue with comment "false-positive — see PR #N for restore". The label `auto-revert` lets you find these later.
4. If false positives recur on the same area, fix the flake before continuing — that's a runbook event of its own (write a `flaky-test-<slug>.md` follow-up).

---

## Disabling the watchdog (emergency only)

If the watchdog is itself broken and blocking work:

```bash
gh workflow disable post-merge-watchdog.yml
```

Re-enable with `gh workflow enable post-merge-watchdog.yml`. **Solo dev safety net is now off** — be deliberate about when to flip it back on.

---

## Logs to consult

| Source | What it tells you |
|---|---|
| `gh run list --workflow post-merge-watchdog.yml` | Which watchdog runs fired, their conclusions |
| `gh run view <run-id> --log` | Full step-by-step logs of a single run |
| `memory/logs/regressions/<date>.jsonl` | Local audit of every auto-revert action |
| `gh api repos/{owner}/{repo}/deployments` | Vercel deployment history (what state main is in) |
| `gh issue list --label auto-revert` | All auto-revert events the watchdog has opened |
