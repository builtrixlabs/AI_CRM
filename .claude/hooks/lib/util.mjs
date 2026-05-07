// Vibe OS V4 — shared hook utilities.
// Node-based instead of bash+jq for cross-platform portability (no jq dep).

import { readFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

// Project anchor = current working directory (Claude Code sets this to the project root).
// Hooks must operate on the project they're invoked from, not the directory the script
// happens to live in (the plugin install path can be anywhere).
export const REPO_ROOT = process.cwd();
export const LOG_DIR = join(REPO_ROOT, "memory", "logs");
export const EXEC_LOG_DIR = join(LOG_DIR, "execution");
export const SUBAGENT_LOG_DIR = join(LOG_DIR, "subagents");
export const GATE_LOG = join(LOG_DIR, "gates.jsonl");
export const HOOK_RUNTIME_LOG = join(REPO_ROOT, ".claude", "hooks", "log");

// Script-relative anchor for the hook's bundled config (locked-paths.json, secret-patterns.txt).
// These ship with the hook script regardless of which project invokes it.
export const HOOK_LIB_DIR = dirname(fileURLToPath(import.meta.url));

export function nowIso() {
  return new Date().toISOString();
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw, _parse_error: true };
  }
}

export function appendJsonl(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(obj) + "\n", "utf8");
}

export function appendRuntimeLog(hookName, line) {
  mkdirSync(HOOK_RUNTIME_LOG, { recursive: true });
  const file = join(HOOK_RUNTIME_LOG, `${hookName}.log`);
  appendFileSync(file, `[${nowIso()}] ${line}\n`, "utf8");
}

// Normalize a path argument to a repo-relative POSIX path, lower-case drive.
// Returns null if path is outside the repo.
export function repoRelative(p) {
  if (!p) return null;
  const absRepo = resolve(REPO_ROOT).toLowerCase();
  const abs = resolve(p);
  const absLower = abs.toLowerCase();
  if (!absLower.startsWith(absRepo)) {
    // Treat absolute paths outside repo as raw — caller decides.
    return abs.split(sep).join(posix.sep);
  }
  let rel = abs.slice(absRepo.length);
  if (rel.startsWith(sep)) rel = rel.slice(1);
  return rel.split(sep).join(posix.sep);
}

// Glob-ish path matching using simple prefix/suffix rules.
// Pattern syntax: "policy/**", "baseline/**", ".env", ".env.*", ".git/**".
export function pathMatchesAny(rel, patterns) {
  if (!rel) return null;
  for (const pat of patterns) {
    if (pat.endsWith("/**")) {
      const prefix = pat.slice(0, -3);
      if (rel === prefix || rel.startsWith(prefix + "/")) return pat;
    } else if (pat.endsWith(".*")) {
      const prefix = pat.slice(0, -2);
      if (rel === prefix || rel.startsWith(prefix + ".")) return pat;
    } else if (pat === rel) {
      return pat;
    }
  }
  return null;
}

export function loadJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function loadLines(file) {
  try {
    return readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export function safeFileExists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

// Block helper: log + write reason to stderr + exit 2.
// Per Claude Code hook contract: exit 2 = block + show stderr to Claude.
export function block(hookName, reason, ctx = {}) {
  appendRuntimeLog(hookName, `BLOCKED reason="${reason}" ctx=${JSON.stringify(ctx)}`);
  appendJsonl(join(EXEC_LOG_DIR, `${todayDate()}.jsonl`), {
    ts: nowIso(),
    hook: hookName,
    decision: "block",
    reason,
    ...ctx,
  });
  process.stderr.write(`[Vibe OS V4 hook] BLOCKED: ${reason}\n`);
  process.exit(2);
}

export function allow(hookName, ctx = {}) {
  appendRuntimeLog(hookName, `ALLOWED ${JSON.stringify(ctx)}`);
  process.exit(0);
}
