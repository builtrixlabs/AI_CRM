#!/usr/bin/env node
/**
 * scripts/vercel-env-sync.mjs
 *
 * Push the project's runtime env vars to a Vercel Preview scope (per-branch).
 * Solves the "preview deploy 500s because env vars aren't set for this branch"
 * problem. The operator owns this as part of the V4 discipline (CLAUDE.md
 * §STOPPING CRITERIA — gate 6 prerequisite); the agent runs this before each
 * new feature branch's preview is expected to render.
 *
 * Behaviour:
 *   - Reads var values from <repo>/.env (then .env.local as fallback).
 *   - For each var in RUNTIME_VARS, calls `vercel env add NAME preview <branch>`
 *     via stdin-piped value. Idempotent: if the var already exists for that
 *     branch, this script first removes it (vercel env rm) then re-adds.
 *   - On success, prints a one-line summary per var.
 *
 * Usage:
 *   node scripts/vercel-env-sync.mjs <git-branch>
 *
 * Examples:
 *   node scripts/vercel-env-sync.mjs v4
 *   node scripts/vercel-env-sync.mjs feature/417-universal-webform
 *
 * If <git-branch> is omitted, the current `git rev-parse --abbrev-ref HEAD` is used.
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
  // `vercel env rm NAME preview <branch> -y` (the -y avoids the confirmation prompt).
  const r = spawnSync(
    "vercel",
    ["env", "rm", name, "preview", branch, "-y"],
    { cwd: vercelCwd, encoding: "utf8", shell: true },
  );
  if (r.status !== 0 && !/does not exist/i.test(r.stderr)) {
    process.stderr.write(`[vercel-env-sync] rm ${name} failed: ${r.stderr}\n`);
  }
}

function addEnv(name, value, branch) {
  // Pipe value via stdin to bypass interactive prompt.
  const r = spawnSync(
    "vercel",
    ["env", "add", name, "preview", branch],
    {
      cwd: vercelCwd,
      input: value + "\n",
      encoding: "utf8",
      shell: true,
    },
  );
  if (r.status !== 0) {
    process.stderr.write(
      `[vercel-env-sync] add ${name} -> preview(${branch}) failed: ${r.stderr}\n`,
    );
    return false;
  }
  return true;
}

function main() {
  const branch = process.argv[2] || currentBranch();
  if (!branch) {
    console.error("usage: node scripts/vercel-env-sync.mjs <git-branch>");
    process.exit(1);
  }
  const env = loadEnv();
  const have = listVercelEnv();

  console.log(`Target: preview(${branch})`);
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
    const haveKey = `${name}|Preview (${branch})`;
    if (have.has(haveKey)) {
      // rm-then-add to make values match local
      rmEnv(name, branch);
    }
    const ok = addEnv(name, v, branch);
    if (ok) {
      console.log(`PUSH   ${name} → preview(${branch})`);
      pushed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${pushed} pushed, ${skipped} skipped, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
