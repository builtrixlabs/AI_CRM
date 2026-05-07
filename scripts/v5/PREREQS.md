# scripts/v5 — CLI prerequisites

The bash orchestration scripts under `scripts/v5/` shell out to standard CLIs. Install these before running V5 against a real project.

## Required

| CLI | Min version | Purpose | Install |
|---|---|---|---|
| `bash` | 4.0+ | All scripts | macOS/Linux: built-in. Windows: Git Bash or WSL2. |
| `git` | 2.30+ | Branching, commits, push, revert | https://git-scm.com/ |
| `node` | 18+ | Plugin scripts, Vitest, Playwright runners | https://nodejs.org/ |
| `npm` | 9+ | Package install + scripts | bundled with node |
| `jq` | 1.6+ | JSON parsing in bash | macOS: `brew install jq` · Linux: `apt-get install jq` · Windows: `choco install jq` |
| `gh` | 2.40+ | GitHub issue creation, PR ops, watchdog hooks | https://cli.github.com/ — then `gh auth login` |
| `supabase` | 1.150+ | Migrations, RLS testing, local DB reset, type gen | macOS/Linux: `brew install supabase/tap/supabase` · Windows: `scoop install supabase` |
| `vercel` | 32+ | Deploy detection, preview URL polling | `npm i -g vercel` — then `vercel login` |

## Optional

| CLI | Purpose |
|---|---|
| `gitleaks` | Secondary secret scan in pre-commit (V5 ships its own scanner; gitleaks adds a second opinion) |

## Self-check

Run `bash scripts/v5/check-prereqs.sh` (called at first-run). Returns exit 0 if all required CLIs are installed at minimum versions, else exit 2 with a per-CLI status line.

## Auth state

Beyond installation, V5 expects:
- `gh auth status` returns logged in
- `vercel whoami` returns a username
- `supabase projects list` returns at least the linked project (after `supabase link --project-ref <ref>`)

If any auth check fails at first-run, V5 surfaces the missing step and halts before Gate 1.

## Why bash + CLIs (not MCPs)

Per D-03: bash is lower-token, bypass-permissions-friendly, and faster cold-start than spawning MCP servers. MCPs are reserved for cases where bash genuinely can't (auth flows, async polling, regex-heavy work) — see `scripts/mcp/`.
