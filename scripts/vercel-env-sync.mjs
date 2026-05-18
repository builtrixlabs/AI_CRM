#!/usr/bin/env node
/**
 * scripts/vercel-env-sync.mjs
 *
 * Push the project's runtime env vars to Vercel.
 *
 * Default mode: writes to the general "Preview" scope (applies to every
 * preview branch that doesn't have a per-branch override). This avoids the
 * chicken-and-egg where per-branch scope requires the branch to exist on
 * origin first.
 *
 * Per-branch mode: pass a git branch name as arg 1. The branch must already
 * exist on the connected Git repo (push it before running). Per-branch
 * overrides general Preview.
 *
 * Behaviour:
 *   - Reads var values from <repo>/.env (then .env.local).
 *   - For each var in RUNTIME_VARS, removes the existing entry (if any) and
 *     re-adds it. Idempotent — re-running reconciles Vercel to local .env.
 *
 * Usage:
 *   node scripts/vercel-env-sync.mjs              # general Preview scope
 *   node scripts/vercel-env-sync.mjs --branch v4  # per-branch
 *
 * Does NOT push:
 *   - DATABASE_URL — preview env uses the same Supabase project via REST anyway.
 *   - SUPABASE_DB_PASSWORD — local-tooling only (apply_migration.mjs).
 *   - Any secret that isn't in the operator's local .env / .env.local.
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const RUNTIME_VARS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "MFA_DEMO_MODE",
  "INTEGRATION_ENCRYPTION_KEY",
];

const here = dirname(fileURLToPath(import.meta.url));
// `repoRoot` is for finding .env files (which live alongside the script's
// project). `vercelCwd` is where `vercel` is invoked from — must contain
// .vercel/project.json. They diverge when running from a git worktree, so
// allow override via VERCEL_PROJECT_ROOT env.
const repoRoot = resolve(here, "..");
const vercelCwd = process.env.VERCEL_PROJECT_ROOT || process.cwd();

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    // Strip surrounding quotes if any.
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function loadEnv() {
  // .env.local takes precedence over .env (Next.js convention). When run from
  // a git worktree, .env lives at vercelCwd (the parent project), not at the
  // worktree root, so prefer that.
  const dirs = [vercelCwd, repoRoot];
  let merged = {};
  for (const d of dirs) {
    merged = {
      ...merged,
      ...parseDotEnv(resolve(d, ".env")),
      ...parseDotEnv(resolve(d, ".env.local")),
    };
  }
  return merged;
}

function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: vercelCwd,
    encoding: "utf8",
      shell: true,
  }).trim();
}

function listVercelEnv() {
  // `vercel env ls` returns a table; parse loosely to get a Set of "name|branch"
  // already-present markers so we know whether to rm-then-add.
  const r = spawnSync("vercel", ["env", "ls"], {
    cwd: vercelCwd,
    encoding: "utf8",
      shell: true,
  });
  if (r.status !== 0) {
    process.stderr.write(`[vercel-env-sync] vercel env ls failed: ${r.stderr}\n`);
    return new Set();
  }
  const have = new Set();
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s+Encrypted\s+(.+?)\s{2,}/);
    if (m) have.add(`${m[1]}|${m[2].trim()}`);
  }
  return have;
}

function rmEnv(name, branch) {
  const args = ["env", "rm", name, "preview"];
  if (branch) args.push(branch);
  args.push("-y");
  const r = spawnSync("vercel", args, {
    cwd: vercelCwd,
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0 && !/does not exist|not found/i.test(r.stderr || "")) {
    process.stderr.write(`[vercel-env-sync] rm ${name} failed: ${r.stderr}\n`);
  }
}

function addEnv(name, value, branch) {
  const args = ["env", "add", name, "preview"];
  if (branch) args.push(branch);
  const r = spawnSync("vercel", args, {
    cwd: vercelCwd,
    input: value + "\n",
    encoding: "utf8",
    shell: true,
  });
  const scope = branch ? `preview(${branch})` : "preview(all branches)";
  if (r.status !== 0) {
    process.stderr.write(
      `[vercel-env-sync] add ${name} -> ${scope} failed: ${r.stderr}\n`,
    );
    return false;
  }
  // Vercel returns 0 + stdout "Saving" when it actually saved. Some
  // shells return 0 even on the silent stdout-only path. Trust status==0.
  return true;
}

function parseArgs(argv) {
  let branch = null;
  let redeploy = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--branch") {
      branch = argv[++i] || null;
    } else if (a === "--redeploy") {
      redeploy = true;
    } else if (a && !a.startsWith("--") && !branch) {
      // Backwards-compat: positional arg = branch name.
      branch = a;
    }
  }
  return { branch, redeploy };
}

function redeployLatestForBranch(branch) {
  // Find the most recent deployment for the branch via `vercel ls
  // --meta githubCommitRef=<branch>` and call `vercel redeploy <url>`.
  const ls = spawnSync(
    "vercel",
    ["ls", "ai-crm", "--meta", `githubCommitRef=${branch}`],
    { cwd: vercelCwd, encoding: "utf8", shell: true },
  );
  const match = ls.stdout?.match(/https:\/\/ai-[a-z0-9]+-builtrixlabs-projects\.vercel\.app/);
  if (!match) {
    console.log(
      `REDEPLOY skipped — no existing deployment for branch yet (next push will build with env vars).`,
    );
    return;
  }
  const url = match[0];
  const rd = spawnSync("vercel", ["redeploy", url], {
    cwd: vercelCwd,
    encoding: "utf8",
    shell: true,
  });
  if (rd.status !== 0) {
    process.stderr.write(`REDEPLOY failed: ${rd.stderr}\n`);
    return;
  }
  const newUrl = rd.stdout?.match(/Preview: (https:\/\/[^\s]+)/)?.[1];
  console.log(`REDEPLOY triggered: ${newUrl ?? "(see vercel dashboard)"}`);
}

function main() {
  let { branch, redeploy } = parseArgs(process.argv.slice(2));
  // Default to the current git branch when run with no args. This matches the
  // common workflow of "I just pushed this branch, now sync its env vars".
  if (!branch) branch = currentBranch();
  if (!branch) {
    console.error(
      "could not determine branch. Pass --branch <name> or run inside a git repo.",
    );
    process.exit(1);
  }

  const env = loadEnv();
  const have = listVercelEnv();

  const scope = `preview(${branch})`;
  console.log(`Target: ${scope}`);
  console.log(
    `  Note: branch must exist on origin (push the branch first).`,
  );
  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of RUNTIME_VARS) {
    const v = env[name];
    if (v == null || v === "") {
      console.log(`SKIP   ${name} — not present in .env / .env.local`);
      skipped++;
      continue;
    }
    const haveKey = branch
      ? `${name}|Preview (${branch})`
      : `${name}|Preview`;
    if (have.has(haveKey)) {
      rmEnv(name, branch);
    }
    const ok = addEnv(name, v, branch);
    if (ok) {
      console.log(`PUSH   ${name} → ${scope}`);
      pushed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${pushed} pushed, ${skipped} skipped, ${failed} failed`);

  if (redeploy && pushed > 0 && branch) {
    redeployLatestForBranch(branch);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
