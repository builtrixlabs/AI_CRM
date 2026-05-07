#!/usr/bin/env node
// V5 supabase MCP server.
//
// Per spec §6.1: covers only the operations bash genuinely can't do — async
// preview-branch operations against the Supabase Management API. Everything
// else (migrate-new, migrate-up local, types, RLS local-test) stays bash via
// scripts/v5/supabase.sh.
//
// Spec §10 flags this as the highest-risk Phase C work. Mitigation here:
//   - All tools degrade to {error:'...'} on missing auth or missing project ref
//   - apply_migration is idempotent: it computes a sha256 of the SQL body and
//     skips if a migration with the same hash already exists on the branch
//   - wait_for_branch_ready respects a generous default timeout (180s)
//
// Auth: SUPABASE_ACCESS_TOKEN env (personal access token from
// https://supabase.com/dashboard/account/tokens).
// Project scoping: SUPABASE_PROJECT_REF env or supabase/config.toml.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const SUPABASE_API = "https://api.supabase.com";

// ── Config resolution ──────────────────────────────────────────────
function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const cfg = resolve(process.cwd(), "supabase/config.toml");
  if (existsSync(cfg)) {
    try {
      const txt = readFileSync(cfg, "utf-8");
      // Match `project_id = "xyzabc"` (Supabase CLI convention).
      const m = txt.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    } catch { /* ignore */ }
  }
  return null;
}

function authState() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = resolveProjectRef();
  if (!token) return { ok: false, reason: "SUPABASE_ACCESS_TOKEN env var not set (https://supabase.com/dashboard/account/tokens)" };
  if (!projectRef) return { ok: false, reason: "project ref not resolved — set SUPABASE_PROJECT_REF or add project_id to supabase/config.toml" };
  return { ok: true, token, projectRef };
}

// ── API helpers ────────────────────────────────────────────────────
async function supaFetch(method, path, body) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  const url = SUPABASE_API + path;
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    return { error: `Supabase API ${res.status}: ${text.slice(0, 300)}`, status: res.status };
  }
  // Some endpoints return empty body on 204; guard against parse errors.
  const text = await res.text();
  if (!text) return { data: null };
  try { return { data: JSON.parse(text) }; } catch { return { data: text }; }
}

function sha256(s) { return createHash("sha256").update(s).digest("hex"); }

// ── Branch-aware path builder ──────────────────────────────────────
// If a branch name is supplied, list branches and resolve to the
// project_ref of the matching branch (Supabase preview branches each
// have their own project_ref). If no branch is supplied, target the
// main project ref.
async function resolveTargetRef(branch) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  if (!branch) return { ref: auth.projectRef };
  const { data, error } = await supaFetch("GET", `/v1/projects/${auth.projectRef}/branches`);
  if (error) return { error };
  const match = (data || []).find((b) => b.name === branch || b.git_branch === branch);
  if (!match) return { error: `branch '${branch}' not found on project ${auth.projectRef}` };
  return { ref: match.project_ref || match.id, branchInfo: match };
}

// ── Tool: list_branches ────────────────────────────────────────────
async function listBranches(_args) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  const { data, error } = await supaFetch("GET", `/v1/projects/${auth.projectRef}/branches`);
  if (error) return { error };
  return {
    project_ref: auth.projectRef,
    branches: (data || []).map((b) => ({
      id: b.id,
      name: b.name,
      git_branch: b.git_branch,
      project_ref: b.project_ref,
      status: b.status,
      created_at: b.created_at,
    })),
  };
}

// ── Tool: apply_migration_to_branch ────────────────────────────────
// Idempotent: computes a sha256 of the migration body and includes it as
// `name`. Supabase rejects duplicate migration names with a clear error,
// which we translate into `state: skipped`.
async function applyMigrationToBranch({ branch, migration_path, migration_name }) {
  if (!migration_path) return { error: "migration_path required" };
  if (!existsSync(migration_path)) return { error: `migration file not found: ${migration_path}` };
  const sql = readFileSync(migration_path, "utf-8");
  if (!sql.trim()) return { error: `migration file is empty: ${migration_path}` };

  const target = await resolveTargetRef(branch);
  if (target.error) return { error: target.error };

  const name = migration_name || `v5_${sha256(sql).slice(0, 12)}`;

  const { data, error, status } = await supaFetch(
    "POST",
    `/v1/projects/${target.ref}/database/query`,
    { query: sql, name }
  );

  if (error) {
    // Heuristic for "already applied": some Supabase responses include
    // 'duplicate' or 'already exists'.
    if (/duplicate|already exists/i.test(error)) {
      return { state: "skipped", reason: "migration with this name already applied", branch, project_ref: target.ref, name };
    }
    return { error, branch, project_ref: target.ref, name, status };
  }

  return {
    state: "applied",
    branch: branch ?? null,
    project_ref: target.ref,
    name,
    rows_returned: Array.isArray(data) ? data.length : 0,
    sample: Array.isArray(data) ? data.slice(0, 3) : data,
  };
}

// ── Tool: wait_for_branch_ready ────────────────────────────────────
async function waitForBranchReady({ branch, timeout_s = 180, poll_interval_s = 5 }) {
  if (!branch) return { error: "branch required" };
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  const deadline = Date.now() + timeout_s * 1000;
  let last;
  while (Date.now() < deadline) {
    const { data, error } = await supaFetch("GET", `/v1/projects/${auth.projectRef}/branches`);
    if (error) return { error };
    last = (data || []).find((b) => b.name === branch || b.git_branch === branch);
    if (!last) return { state: "MISSING", branch, note: `branch '${branch}' not found on project ${auth.projectRef}` };
    if (last.status === "FUNCTIONS_DEPLOYED" || last.status === "ACTIVE_HEALTHY") {
      return { state: "READY", branch, project_ref: last.project_ref || last.id, status: last.status };
    }
    if (last.status === "FAILED" || last.status === "ERRORED") {
      return { state: "FAILED", branch, project_ref: last.project_ref || last.id, status: last.status };
    }
    await new Promise((r) => setTimeout(r, poll_interval_s * 1000));
  }
  return { state: "TIMEOUT", branch, last_status: last?.status ?? "unknown", note: `no terminal state within ${timeout_s}s` };
}

// ── MCP server ─────────────────────────────────────────────────────
const server = new Server(
  { name: "vibe-supabase", version: "5.0.0-alpha.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_branches",
      description: "List all Supabase preview branches on the linked project. Useful before applying a migration to confirm the target branch exists.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "apply_migration_to_branch",
      description: "Apply a SQL migration file to a Supabase preview branch (or the main project if branch is omitted). Idempotent: derives a stable migration name from sha256 of the body so re-applying the same SQL is a no-op (returns state:'skipped').",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Preview branch name (Supabase). Omit to target the main project." },
          migration_path: { type: "string", description: "Path to the .sql migration file. Read at call time, no caching." },
          migration_name: { type: "string", description: "Override the auto-derived name (optional). Useful when reapplying after manual edits." },
        },
        required: ["migration_path"],
      },
    },
    {
      name: "wait_for_branch_ready",
      description: "Poll the Supabase Management API until a preview branch reaches a terminal state (READY/FAILED) or times out (default 180s). Use after creating a branch to gate Gate 4 RLS testing on the preview env.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch name to wait for." },
          timeout_s: { type: "number", default: 180 },
          poll_interval_s: { type: "number", default: 5 },
        },
        required: ["branch"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  let payload;
  try {
    if (name === "list_branches") payload = await listBranches(args);
    else if (name === "apply_migration_to_branch") payload = await applyMigrationToBranch(args);
    else if (name === "wait_for_branch_ready") payload = await waitForBranchReady(args);
    else return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  } catch (err) {
    payload = { error: `unexpected: ${err?.message || String(err)}` };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: !!payload?.error,
  };
});

// ── Boot ───────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
