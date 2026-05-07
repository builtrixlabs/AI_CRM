#!/usr/bin/env node
// Vibe OS V4 — SessionStart hook.
// FR-3.4 / NFR-P2: emit a ≤500-token summary of learned patterns + open directives.
// stdout becomes additionalContext injected into the session.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  readStdinJson,
  appendRuntimeLog,
  REPO_ROOT,
} from "./lib/util.mjs";

const HOOK = "SessionStart";

// Approx tokens ≈ chars/4. Keep total stdout under ~2000 chars to stay <500 tokens.
const MAX_CHARS = 1800;

function readSafe(p, max = 600) {
  try {
    const s = readFileSync(p, "utf8");
    return s.length > max ? s.slice(0, max) + "\n…(truncated)" : s;
  } catch {
    return null;
  }
}

function listDirectives() {
  const dir = join(REPO_ROOT, "directives");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3)
      .map((e) => e.name);
  } catch {
    return [];
  }
}

try {
  await readStdinJson(); // drain stdin even if unused
  const parts = [];

  parts.push("# Vibe OS V4 — Session Context");
  parts.push("");

  const patterns = readSafe(join(REPO_ROOT, "memory", "learned", "patterns.md"), 800);
  if (patterns && patterns.trim()) {
    parts.push("## Learned Patterns (top of file)");
    parts.push(patterns.trim());
    parts.push("");
  }

  const dirs = listDirectives();
  if (dirs.length) {
    parts.push("## Recent Directives");
    for (const d of dirs) parts.push(`- ${d}`);
    parts.push("");
  }

  parts.push("## V4 Hooks Active");
  parts.push("Writes to policy/, baseline/, .git/, .env* are hook-blocked. Audit log: memory/logs/execution/<today>.jsonl");

  let out = parts.join("\n");
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + "\n…(truncated by SessionStart hook)";

  process.stdout.write(out + "\n");
  appendRuntimeLog(HOOK, `INJECTED chars=${out.length} directives=${dirs.length}`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`[Vibe OS V4 SessionStart] internal error: ${err.message}\n`);
  process.exit(0);
}
