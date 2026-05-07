#!/usr/bin/env node
// Vibe OS V4 — PostToolUse hook.
// FR-3.3: append a structured JSONL entry for every tool call.
// Always exits 0 (post-event; not a gate).

import { join } from "node:path";
import {
  readStdinJson,
  appendJsonl,
  appendRuntimeLog,
  todayDate,
  nowIso,
  EXEC_LOG_DIR,
} from "./lib/util.mjs";

const HOOK = "PostToolUse";

try {
  const input = await readStdinJson();
  const tool = input.tool_name || "";
  const ti = input.tool_input || {};
  const tr = input.tool_response || {};

  // Compact the input/response so the audit log doesn't bloat.
  const summarize = (obj, max = 500) => {
    try {
      const s = JSON.stringify(obj);
      if (!s) return "";
      return s.length > max ? s.slice(0, max) + "…" : s;
    } catch {
      return "";
    }
  };

  const entry = {
    ts: nowIso(),
    hook: HOOK,
    tool,
    tool_input: summarize(ti, 800),
    tool_response_summary: summarize(tr, 400),
    session_id: input.session_id || null,
    cwd: input.cwd || null,
  };

  appendJsonl(join(EXEC_LOG_DIR, `${todayDate()}.jsonl`), entry);
  appendRuntimeLog(HOOK, `LOGGED tool=${tool}`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`[Vibe OS V4 PostToolUse] internal error: ${err.message}\n`);
  process.exit(0);
}
