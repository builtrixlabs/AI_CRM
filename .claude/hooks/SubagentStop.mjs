#!/usr/bin/env node
// Vibe OS V4 — SubagentStop hook.
// FR-3.6: log subagent return payloads for traceability.

import { join } from "node:path";
import {
  readStdinJson,
  appendJsonl,
  appendRuntimeLog,
  todayDate,
  nowIso,
  SUBAGENT_LOG_DIR,
} from "./lib/util.mjs";

const HOOK = "SubagentStop";

try {
  const input = await readStdinJson();
  const file = join(SUBAGENT_LOG_DIR, `${todayDate()}.jsonl`);

  const summarize = (obj, max = 1500) => {
    try {
      const s = JSON.stringify(obj);
      if (!s) return "";
      return s.length > max ? s.slice(0, max) + "…" : s;
    } catch {
      return "";
    }
  };

  appendJsonl(file, {
    ts: nowIso(),
    hook: HOOK,
    session_id: input.session_id || null,
    transcript_path: input.transcript_path || null,
    payload_summary: summarize(input, 1500),
  });
  appendRuntimeLog(HOOK, `LOGGED session=${input.session_id || "n/a"}`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`[Vibe OS V4 SubagentStop] internal error: ${err.message}\n`);
  process.exit(0);
}
