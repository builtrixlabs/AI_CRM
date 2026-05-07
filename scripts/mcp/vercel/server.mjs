#!/usr/bin/env node
// V5 vercel MCP server.
//
// Per spec §6.2: covers operations bash can't do well (async preview-URL
// detection, deploy status, authed redeploy after revert). The simpler
// preview-URL polling fallback lives in scripts/v5/vercel.sh.
//
// Auth: reads VERCEL_TOKEN env var. Project scoping via VERCEL_PROJECT_ID
// or .vercel/project.json (written by `vercel link`). Without auth, tools
// return a structured error instead of crashing — the operator sees a clear
// "set VERCEL_TOKEN" message.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const VERCEL_API = "https://api.vercel.com";

// ── Config resolution ──────────────────────────────────────────────
function resolveProjectId() {
  if (process.env.VERCEL_PROJECT_ID) return process.env.VERCEL_PROJECT_ID;
  const p = resolve(process.cwd(), ".vercel/project.json");
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, "utf-8")).projectId ?? null; } catch { /* ignore */ }
  }
  return null;
}

function resolveTeamId() {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID;
  const p = resolve(process.cwd(), ".vercel/project.json");
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, "utf-8")).orgId ?? null; } catch { /* ignore */ }
  }
  return null;
}

function authState() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = resolveProjectId();
  if (!token) return { ok: false, reason: "VERCEL_TOKEN env var not set" };
  if (!projectId) return { ok: false, reason: "project not linked — set VERCEL_PROJECT_ID or run `vercel link`" };
  return { ok: true, token, projectId, teamId: resolveTeamId() };
}

// ── Vercel API helpers ─────────────────────────────────────────────
function apiUrl(path, params = {}) {
  const u = new URL(VERCEL_API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function vercelGet(path, params = {}) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  if (auth.teamId) params.teamId = auth.teamId;
  const res = await fetch(apiUrl(path, params), {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `Vercel API ${res.status}: ${body.slice(0, 300)}` };
  }
  return { data: await res.json() };
}

async function vercelPost(path, body, params = {}) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };
  if (auth.teamId) params.teamId = auth.teamId;
  const res = await fetch(apiUrl(path, params), {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `Vercel API ${res.status}: ${text.slice(0, 300)}` };
  }
  return { data: await res.json() };
}

// ── Tool: wait_for_preview ─────────────────────────────────────────
// Polls Vercel for the latest deployment matching a git branch and waits
// until it reaches a terminal state (READY/ERROR/CANCELED) or times out.
async function waitForPreview({ branch, timeout_s = 120, poll_interval_s = 5 }) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };

  const deadline = Date.now() + timeout_s * 1000;
  let lastDeployment = null;

  while (Date.now() < deadline) {
    const { data, error } = await vercelGet("/v6/deployments", {
      projectId: auth.projectId,
      "meta-githubCommitRef": branch,
      limit: 1,
    });
    if (error) return { error };
    const dep = data?.deployments?.[0];
    if (dep) {
      lastDeployment = dep;
      if (dep.state === "READY") {
        return {
          state: "READY",
          url: dep.url ? `https://${dep.url}` : null,
          deployment_id: dep.uid,
          branch,
          inspector_url: dep.inspectorUrl ?? null,
          created_at: dep.created,
        };
      }
      if (dep.state === "ERROR" || dep.state === "CANCELED") {
        return { state: dep.state, deployment_id: dep.uid, branch, url: null, inspector_url: dep.inspectorUrl ?? null };
      }
    }
    await new Promise((r) => setTimeout(r, poll_interval_s * 1000));
  }

  return {
    state: "TIMEOUT",
    branch,
    last_state: lastDeployment?.state ?? "no-deployment-found",
    deployment_id: lastDeployment?.uid ?? null,
    url: null,
    note: `no terminal state within ${timeout_s}s`,
  };
}

// ── Tool: get_deploy_status ────────────────────────────────────────
async function getDeployStatus({ deployment_id }) {
  const { data, error } = await vercelGet(`/v13/deployments/${encodeURIComponent(deployment_id)}`);
  if (error) return { error };
  return {
    deployment_id,
    state: data.readyState ?? data.state,
    url: data.url ? `https://${data.url}` : null,
    target: data.target,
    created_at: data.createdAt,
    ready_at: data.ready,
    aliases: data.alias ?? [],
  };
}

// ── Tool: redeploy ─────────────────────────────────────────────────
// Used by Gate 6 after auto-revert: trigger a fresh deploy at a specific
// SHA so main returns to the last known good state quickly.
async function redeploy({ git_sha, target = "production", name = "vibe-redeploy" }) {
  const auth = authState();
  if (!auth.ok) return { error: auth.reason };

  const { data, error } = await vercelPost("/v13/deployments", {
    name,
    project: auth.projectId,
    target,
    gitSource: {
      type: "github",
      ref: git_sha,
      sha: git_sha,
    },
  });
  if (error) return { error };
  return {
    deployment_id: data.id,
    url: data.url ? `https://${data.url}` : null,
    state: data.readyState ?? data.state,
    target,
    git_sha,
  };
}

// ── MCP server ─────────────────────────────────────────────────────
const server = new Server(
  { name: "vibe-vercel", version: "5.0.0-alpha.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "wait_for_preview",
      description: "Poll Vercel for the latest deployment of a git branch and wait until it reaches a terminal state (READY / ERROR / CANCELED) or times out. Returns the preview URL on READY.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Git branch name (Vercel matches via meta-githubCommitRef)." },
          timeout_s: { type: "number", description: "Max seconds to wait. Default 120.", default: 120 },
          poll_interval_s: { type: "number", description: "Seconds between polls. Default 5.", default: 5 },
        },
        required: ["branch"],
      },
    },
    {
      name: "get_deploy_status",
      description: "Get the current state of a Vercel deployment by ID. Returns state (READY/ERROR/BUILDING/QUEUED/CANCELED/INITIALIZING), URL, aliases, timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          deployment_id: { type: "string", description: "Vercel deployment ID (uid). Get from wait_for_preview or `vercel ls --json`." },
        },
        required: ["deployment_id"],
      },
    },
    {
      name: "redeploy",
      description: "Trigger a fresh Vercel deployment at a specific git SHA. Used by Gate 6 auto-revert flow to redeploy main to a known-good commit. Requires GitHub source linked to the project.",
      inputSchema: {
        type: "object",
        properties: {
          git_sha: { type: "string", description: "Full git SHA to deploy." },
          target: { type: "string", enum: ["production", "preview"], default: "production", description: "Deploy target. Default production." },
          name: { type: "string", description: "Deployment name. Default 'vibe-redeploy'.", default: "vibe-redeploy" },
        },
        required: ["git_sha"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  let payload;
  try {
    if (name === "wait_for_preview") payload = await waitForPreview(args);
    else if (name === "get_deploy_status") payload = await getDeployStatus(args);
    else if (name === "redeploy") payload = await redeploy(args);
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
