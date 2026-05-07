#!/usr/bin/env node
// Vibe OS V4 — Stop hook.
// FR-3.5: trigger pattern extraction if at least one pipeline reached Gate 5.
// V4 Phase 1: stub. The actual pattern-extractor subagent ships in Phase 3.
// For now we just log the decision to a queue file the operator (or future hook chain) can act on.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  readStdinJson,
  appendRuntimeLog,
  REPO_ROOT,
  todayDate,
  nowIso,
} from "./lib/util.mjs";

const HOOK = "Stop";

function reachedGate5Today() {
  const log = join(REPO_ROOT, "memory", "logs", "gates.jsonl");
  if (!existsSync(log)) return false;
  try {
    const raw = readFileSync(log, "utf8");
    const today = todayDate();
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => {
        try {
          const e = JSON.parse(line);
          return e.gate === 5 && e.outcome === "success" && (e.ts || "").startsWith(today);
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

try {
  await readStdinJson();
  const triggered = reachedGate5Today();
  if (triggered) {
    const queue = join(REPO_ROOT, "memory", "logs", "pattern-extraction.queue");
    mkdirSync(dirname(queue), { recursive: true });
    const line = `${nowIso()} pattern-extraction-requested\n`;
    writeFileSync(queue, line, { flag: "a" });
    appendRuntimeLog(HOOK, "QUEUED pattern-extraction");
  } else {
    appendRuntimeLog(HOOK, "NOOP no-gate-5-today");
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`[Vibe OS V4 Stop] internal error: ${err.message}\n`);
  process.exit(0);
}
