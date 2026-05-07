#!/usr/bin/env node
// V5 secret-scanner MCP server.
//
// Why an MCP (vs the existing scripts/secret-scanner.ts CLI):
//   The CLI scans git-staged files only — that's pre-commit territory. The MCP
//   exposes the same pattern matchers for arbitrary paths or in-memory content
//   so Gate 4 can scan freshly-written code BEFORE staging, and the
//   feature-builder agent can re-scan after auto-fix without spawning a
//   subprocess per call.
//
// Patterns are duplicated here (vs imported from secret-scanner.ts) for two
// reasons: (1) the CLI and MCP have different runtime contracts (CLI exits
// with status, MCP returns structured findings); (2) duplicating a static
// list is cheaper than introducing a TS↔MJS shared module.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { extname, basename, join } from "node:path";

// ── Patterns (mirror of scripts/secret-scanner.ts) ─────────────────
const PATTERNS = [
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g, severity: "CRITICAL", suggestion: "Move to .env.local: AWS_ACCESS_KEY_ID=..." },
  { name: "Stripe Live Secret", regex: /sk_live_[0-9a-zA-Z]{24,}/g, severity: "CRITICAL", suggestion: "Move to .env.local: STRIPE_SECRET_KEY=..." },
  { name: "Stripe Live Pub", regex: /pk_live_[0-9a-zA-Z]{24,}/g, severity: "HIGH", suggestion: "Move to .env.local: NEXT_PUBLIC_STRIPE_KEY=..." },
  { name: "OpenAI Key", regex: /sk-[a-zA-Z0-9]{20,}/g, severity: "CRITICAL", suggestion: "Move to .env.local: OPENAI_API_KEY=..." },
  { name: "GitHub PAT", regex: /ghp_[a-zA-Z0-9]{36}/g, severity: "CRITICAL", suggestion: "Move to .env.local: GITHUB_TOKEN=..." },
  { name: "GitHub OAuth", regex: /gho_[a-zA-Z0-9]{36}/g, severity: "CRITICAL", suggestion: "Move to .env.local: GITHUB_OAUTH_TOKEN=..." },
  { name: "Google API Key", regex: /AIza[0-9A-Za-z_-]{35}/g, severity: "HIGH", suggestion: "Move to .env.local: GOOGLE_API_KEY=..." },
  { name: "Private Key", regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g, severity: "CRITICAL", suggestion: "Remove private key from source code. Use secure vault." },
  { name: "Connection String", regex: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g, severity: "CRITICAL", suggestion: "Move to .env.local: DATABASE_URL=..." },
  { name: "Password Assignment", regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/gi, severity: "HIGH", suggestion: "Move to .env.local and use process.env" },
  { name: "API Key Assignment", regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"][^'"]+['"]/gi, severity: "HIGH", suggestion: "Move to .env.local and use process.env" },
];

const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map"];
const EXCLUDED_FILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", ".env.example"];
const EXCLUDED_DIRS = ["node_modules", ".git", ".next", "dist", "build", "coverage", "memory/logs"];
const FALSE_POSITIVE_WORDS = ["example", "placeholder", "dummy", "sample", "test", "mock", "fake", "todo", "fixme", "changeme", "replace_me"];

const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

// ── Scanning core ──────────────────────────────────────────────────
function shouldScanPath(p) {
  const ext = extname(p).toLowerCase();
  const base = basename(p);
  if (EXCLUDED_EXTENSIONS.includes(ext)) return false;
  if (EXCLUDED_FILES.includes(base)) return false;
  if (p.endsWith(".test.ts") || p.endsWith(".test.tsx") || p.endsWith(".e2e.ts")) return false;
  if (p.endsWith(".md")) return false;
  for (const d of EXCLUDED_DIRS) {
    if (p.includes(`/${d}/`) || p.includes(`\\${d}\\`)) return false;
  }
  return true;
}

function isFalsePositive(line) {
  const lower = line.toLowerCase();
  return FALSE_POSITIVE_WORDS.some((w) => lower.includes(w));
}

function scanContent(content, filePath = "<inline>") {
  const findings = [];
  const lines = content.split("\n");
  for (const pattern of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(new RegExp(pattern.regex.source, pattern.regex.flags));
      for (const match of matches) {
        if (isFalsePositive(line)) continue;
        const matched = match[0];
        findings.push({
          file: filePath,
          line: i + 1,
          column: (match.index ?? 0) + 1,
          pattern: pattern.name,
          matched_text: matched.substring(0, 8) + "...",
          severity: pattern.severity,
          suggestion: pattern.suggestion,
        });
      }
    }
  }
  return findings;
}

function scanFile(filePath) {
  if (!shouldScanPath(filePath)) return [];
  let content;
  try { content = readFileSync(filePath, "utf-8"); } catch { return []; }
  return scanContent(content, filePath);
}

function walkDir(root, out = []) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const full = join(root, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDED_DIRS.includes(ent.name)) continue;
      walkDir(full, out);
    } else if (ent.isFile() && shouldScanPath(full)) {
      out.push(full);
    }
  }
  return out;
}

function filterBySeverity(findings, minSeverity) {
  const min = SEVERITY_RANK[minSeverity?.toUpperCase()] ?? 1;
  return findings.filter((f) => SEVERITY_RANK[f.severity] >= min);
}

// ── MCP server ─────────────────────────────────────────────────────
const server = new Server(
  { name: "vibe-secret-scanner", version: "5.0.0-alpha.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_paths",
      description: "Scan one or more file or directory paths for hardcoded secrets. Returns findings ranked by severity (CRITICAL > HIGH > MEDIUM > LOW). Pass a directory to walk recursively (skips node_modules, .git, dist, build, coverage, memory/logs).",
      inputSchema: {
        type: "object",
        properties: {
          paths: { type: "array", items: { type: "string" }, description: "File or directory paths to scan." },
          severity_min: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"], description: "Filter results to this severity or higher. Default: LOW.", default: "LOW" },
        },
        required: ["paths"],
      },
    },
    {
      name: "scan_text",
      description: "Scan in-memory content for hardcoded secrets without touching disk. Useful for checking a Claude-generated diff before writing it.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The text to scan." },
          file_hint: { type: "string", description: "Logical filename for the finding (no I/O performed). Default: <inline>." },
          severity_min: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"], default: "LOW" },
        },
        required: ["content"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (name === "scan_paths") {
    const paths = Array.isArray(args.paths) ? args.paths : [];
    const minSev = args.severity_min || "LOW";
    let findings = [];
    for (const p of paths) {
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        for (const f of walkDir(p)) findings.push(...scanFile(f));
      } else if (st.isFile()) {
        findings.push(...scanFile(p));
      }
    }
    findings = filterBySeverity(findings, minSev);
    findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) summary[f.severity.toLowerCase()]++;
    return {
      content: [{ type: "text", text: JSON.stringify({ findings, summary }, null, 2) }],
    };
  }

  if (name === "scan_text") {
    const content = String(args.content ?? "");
    const fileHint = args.file_hint || "<inline>";
    const minSev = args.severity_min || "LOW";
    let findings = filterBySeverity(scanContent(content, fileHint), minSev);
    findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) summary[f.severity.toLowerCase()]++;
    return {
      content: [{ type: "text", text: JSON.stringify({ findings, summary }, null, 2) }],
    };
  }

  return {
    content: [{ type: "text", text: `unknown tool: ${name}` }],
    isError: true,
  };
});

// ── Boot ───────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
