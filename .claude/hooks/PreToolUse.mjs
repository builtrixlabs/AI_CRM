#!/usr/bin/env node
// Vibe OS V4 — PreToolUse hook.
// Enforces FR-3.1, FR-3.2, NFR-S1, NFR-S6.
// Exit 0 = allow. Exit 2 = block (stderr surfaced to Claude).

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readStdinJson,
  repoRelative,
  pathMatchesAny,
  loadJson,
  loadLines,
  block,
  allow,
} from "./lib/util.mjs";

const HOOK = "PreToolUse";
const HERE = dirname(fileURLToPath(import.meta.url));

try {
  const input = await readStdinJson();
  const tool = input.tool_name || "";
  const ti = input.tool_input || {};

  const cfg = loadJson(join(HERE, "lib", "locked-paths.json"), {
    block_writes: [],
    append_only: [],
    _allowed_env_files: [],
    _dangerous_bash_substrings: [],
  });

  // ── Write/Edit/MultiEdit guards (FR-3.1, NFR-S6) ──
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const candidate = ti.file_path || ti.path || ti.filePath || "";
    const rel = repoRelative(candidate);

    if (rel) {
      // Allow .env.example specifically.
      if (cfg._allowed_env_files?.includes(rel)) {
        // fall through — explicitly allowed
      } else {
        const matched = pathMatchesAny(rel, cfg.block_writes);
        if (matched) {
          block(HOOK, `writes to '${rel}' are immutable (matched pattern: ${matched})`, {
            tool,
            file: rel,
          });
        }
      }

      // Append-only: if existing file under append_only paths, only Edit-as-append is OK.
      // We can't reliably detect "append" from tool input, so we block any Write/Edit on
      // existing files in those paths. New files (e.g., today's jsonl on first write) are allowed.
      const aoMatched = pathMatchesAny(rel, cfg.append_only);
      if (aoMatched && existsSync(join(process.cwd(), rel))) {
        block(HOOK, `'${rel}' is append-only (use a new file or append via tool that supports it)`, {
          tool,
          file: rel,
        });
      }
    }
  }

  // ── Bash guards (FR-3.2, NFR-S2) ──
  if (tool === "Bash") {
    const cmd = ti.command || "";

    for (const danger of cfg._dangerous_bash_substrings || []) {
      if (cmd.includes(danger)) {
        // Force-push allowed only on feature/* branches.
        if (danger.startsWith("git push")) {
          let branch = "";
          try {
            branch = execSync("git rev-parse --abbrev-ref HEAD", {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }).trim();
          } catch {
            branch = "";
          }
          if (branch.startsWith("feature/")) continue;
          block(HOOK, `force-push only allowed on feature/* branches (current: ${branch || "unknown"})`, {
            tool,
            cmd,
          });
        }
        block(HOOK, `dangerous command pattern: '${danger}'`, { tool, cmd });
      }
    }

    // Secret patterns in the bash command itself.
    const patterns = loadLines(join(HERE, "lib", "secret-patterns.txt"));
    for (const p of patterns) {
      let re;
      try {
        re = new RegExp(p);
      } catch {
        continue;
      }
      if (re.test(cmd)) {
        block(HOOK, `bash command contains a secret pattern (${p.slice(0, 32)}…)`, {
          tool,
          cmd_preview: cmd.slice(0, 80),
        });
      }
    }
  }

  allow(HOOK, { tool });
} catch (err) {
  // Fail-open per NFR-R6: don't block legit work due to a buggy hook. Log loudly.
  process.stderr.write(`[Vibe OS V4 PreToolUse] internal error (fail-open): ${err.message}\n`);
  process.exit(0);
}
