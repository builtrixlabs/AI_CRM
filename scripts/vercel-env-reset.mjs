#!/usr/bin/env node
/**
 * scripts/vercel-env-reset.mjs
 *
 * One-shot cleanup that consolidates the project's runtime env vars on
 * Vercel into TWO entries each — one broad **Production** (for `main`)
 * and one broad **Preview** (applies to every non-main branch). All
 * existing per-branch Preview overrides and duplicates are removed.
 *
 * Why: per-branch overrides only apply to the named branch — a new branch
 * (e.g. v6-phase-3) inherits nothing and the build fails with the
 * "Server is misconfigured. Missing env var(s): NEXT_PUBLIC_SUPABASE_URL..."
 * error. Broad Preview scope fixes that for all current and future
 * preview branches.
 *
 * Reads values from <parent-repo>/.env.local (the same source
 * vercel-env-sync.mjs uses). Run from a worktree with VERCEL_PROJECT_ROOT
 * pointed at the parent (linked) repo:
 *
 *   VERCEL_PROJECT_ROOT="C:/Users/ragha/OneDrive/Desktop/AI_CRM" \
 *     node scripts/vercel-env-reset.mjs
 *
 * Optional flags:
 *   --dry-run                 List what would be removed/added; no writes.
 *   --keep <NAME[,NAME...]>   Also touch additional var names beyond the
 *                             canonical list (rare — most users won't need).
 *
 * Idempotent — re-running produces the same final state.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CANONICAL_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "DATABASE_URL",
];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const vercelCwd = process.env.VERCEL_PROJECT_ROOT || process.cwd();

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
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
  let merged = {};
  for (const d of [vercelCwd, repoRoot]) {
    merged = {
      ...merged,
      ...parseDotEnv(resolve(d, ".env")),
      ...parseDotEnv(resolve(d, ".env.local")),
    };
  }
  return merged;
}

function listEntries() {
  const r = spawnSync("vercel", ["env", "ls", "--format", "json"], {
    cwd: vercelCwd,
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) {
    console.error("vercel env ls --format json failed:", r.stderr);
    process.exit(1);
  }
  // The CLI prints a "Retrieving project…" prelude; the JSON starts at the
  // first `{`. Slice it out before parsing.
  const jsonStart = r.stdout.indexOf("{");
  if (jsonStart < 0) {
    console.error("no JSON in vercel env ls output");
    process.exit(1);
  }
  try {
    return JSON.parse(r.stdout.slice(jsonStart)).envs ?? [];
  } catch (e) {
    console.error("failed to parse vercel env ls json:", e.message);
    process.exit(1);
  }
}

function rmEntry(name, target, gitBranch, dryRun) {
  // Vercel CLI takes git-branch as a POSITIONAL arg after the target,
  // not a --git-branch flag (the flag is rejected with
  // "unknown or unexpected option: --git-branch").
  const args = ["env", "rm", name, target];
  if (gitBranch) args.push(gitBranch);
  args.push("-y");
  const label = `${name} ${target}${gitBranch ? ` ${gitBranch}` : ""}`;
  if (dryRun) {
    console.log(`  [DRY] RM ${label}`);
    return true;
  }
  const r = spawnSync("vercel", args, {
    cwd: vercelCwd,
    encoding: "utf8",
    shell: true,
  });
  if (r.status === 0) {
    console.log(`  RM ${label}`);
    return true;
  }
  if (/does not exist|not found/i.test(r.stderr || "")) return true;
  console.log(`  RM-FAIL ${label}: ${(r.stderr || "").trim()}`);
  return false;
}

// Vercel CLI 53.1.1 has a bug: `vercel env add NAME preview --value V --yes`
// (the CLI's own action_required.next[] suggested form for "all Preview
// branches") returns action_required instead of succeeding. CLI 54.0.0
// silently drops auth on upgrade, so we can't simply upgrade in place.
// Workaround: bypass the CLI for broad-scope adds and call the Vercel REST
// API directly, reading the existing CLI auth token from disk.
function readAuthToken() {
  const candidates = process.platform === "win32"
    ? [resolve(process.env.APPDATA || "", "com.vercel.cli/Data/auth.json")]
    : [
        resolve(process.env.HOME || "", ".local/share/com.vercel.cli/auth.json"),
        resolve(process.env.HOME || "", "Library/Application Support/com.vercel.cli/Data/auth.json"),
      ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const auth = JSON.parse(readFileSync(p, "utf8"));
      if (auth?.token) return auth.token;
    }
  }
  throw new Error(`vercel auth.json not found in: ${candidates.join(", ")}`);
}

function readProjectInfo() {
  const p = resolve(vercelCwd, ".vercel/project.json");
  if (!existsSync(p)) throw new Error(`.vercel/project.json not found at ${p}`);
  const info = JSON.parse(readFileSync(p, "utf8"));
  return { projectId: info.projectId, orgId: info.orgId };
}

let _api = null;
function api() {
  if (!_api) {
    _api = { token: readAuthToken(), ...readProjectInfo() };
  }
  return _api;
}

async function addEntryViaApi(name, value, target) {
  const { token, projectId, orgId } = api();
  const url =
    `https://api.vercel.com/v10/projects/${projectId}/env` +
    (orgId ? `?teamId=${orgId}` : "");
  const body = {
    key: name,
    value,
    type: "encrypted",
    target: [target], // broad scope: no gitBranch
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (r.ok) return { ok: true };
  const err = await r.text();
  return { ok: false, status: r.status, err };
}

async function addEntry(name, value, target, dryRun) {
  if (dryRun) {
    console.log(`  [DRY] ADD ${name} → ${target} (broad, via REST API)`);
    return true;
  }
  const r = await addEntryViaApi(name, value, target);
  if (r.ok) {
    console.log(`  ADD ${name} → ${target} (broad, via REST API)`);
    return true;
  }
  console.log(
    `  ADD-FAIL ${name} ${target}: HTTP ${r.status} ${r.err?.slice(0, 200) || ""}`,
  );
  return false;
}

function parseArgs(argv) {
  let dryRun = false;
  const extra = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--keep") {
      const list = (argv[++i] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      extra.push(...list);
    }
  }
  return { dryRun, extra };
}

async function main() {
  const { dryRun, extra } = parseArgs(process.argv.slice(2));
  const targets = [...new Set([...CANONICAL_VARS, ...extra])];
  const env = loadEnv();
  const entries = listEntries();

  console.log(`vercelCwd: ${vercelCwd}`);
  console.log(`Found ${entries.length} env entries on Vercel.`);
  console.log(`Will reset: ${targets.join(", ")}`);
  console.log(dryRun ? "(dry-run — no writes)\n" : "");

  let removed = 0;
  let added = 0;
  let skipped = 0;

  for (const name of targets) {
    const value = env[name];
    if (!value) {
      console.log(`SKIP ${name} — not in .env / .env.local`);
      skipped++;
      continue;
    }

    console.log(`\n${name}`);
    const existing = entries.filter((e) => e.key === name);
    for (const e of existing) {
      const branch = e.gitBranch || null;
      for (const t of e.target || []) {
        if (rmEntry(name, t, branch, dryRun)) removed++;
      }
    }
    if (await addEntry(name, value, "production", dryRun)) added++;
    if (await addEntry(name, value, "preview", dryRun)) added++;
  }

  console.log(
    `\nDone: ${removed} removed, ${added} added, ${skipped} skipped${
      dryRun ? " (dry-run)" : ""
    }.`,
  );
  console.log(
    "Verify with: vercel env ls --cwd \"" + vercelCwd + "\"",
  );
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
