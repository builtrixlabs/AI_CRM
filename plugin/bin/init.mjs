#!/usr/bin/env node
// Vibe OS V4 — `init` command (FR-5.3).
// Scaffolds a consumer repo with hooks, skills, agents, policies, baselines, runbooks.

import { resolve } from "node:path";
import { copyAll, listConflicts, readManifest, OS_ROOT } from "../lib/copy.mjs";

const args = process.argv.slice(2);
const flags = {
  force: args.includes("--force"),
  reuseExisting: args.includes("--reuse-existing"),
  verbose: args.includes("--verbose") || args.includes("-v"),
  dryRun: args.includes("--dry-run"),
};
const positional = args.filter((a) => !a.startsWith("-"));
const target = positional[0];

if (!target) {
  process.stderr.write(
    `Usage: vibe-os init <target_dir> [--force | --reuse-existing] [--dry-run] [--verbose]\n`
  );
  process.exit(2);
}

const absTarget = resolve(target);

if (absTarget === OS_ROOT) {
  process.stderr.write(`Refusing to init the OS source repo onto itself: ${absTarget}\n`);
  process.exit(2);
}

const manifest = readManifest();

const log = flags.verbose ? (m) => process.stdout.write(`  ${m}\n`) : () => {};

process.stdout.write(`vibe-os ${manifest.version} — init → ${absTarget}\n`);

if (flags.dryRun) {
  process.stdout.write(`(dry-run) Would copy:\n`);
  for (const [src] of Object.entries((await import("../lib/copy.mjs")).SOURCE_PATHS)) {
    process.stdout.write(`  ${src}\n`);
  }
  const conflicts = listConflicts(absTarget);
  if (conflicts.length) {
    process.stdout.write(`(dry-run) Conflicts (would need --force or --reuse-existing):\n`);
    for (const c of conflicts) process.stdout.write(`  ${c}\n`);
  }
  process.exit(0);
}

try {
  copyAll(absTarget, { force: flags.force, reuseExisting: flags.reuseExisting, log });
  process.stdout.write(`✓ init complete\n`);
  process.stdout.write(`Next: cd ${absTarget} && npm install && npm run prepare\n`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`✗ init failed: ${err.message}\n`);
  process.exit(1);
}
