#!/usr/bin/env node
/**
 * Secret Scanner — Pre-Commit Hook Script
 *
 * Scans git-staged files for hardcoded secrets and credentials.
 * Exit code 0 = clean, 1 = secrets found (commit blocked).
 *
 * Policy: POLICY 013 — Pre-Commit Secret Detection
 * Baseline: BASELINE 009 — Pre-Commit Contract
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────

interface SecretFinding {
  file: string;
  line: number;
  column: number;
  pattern: string;
  matched_text: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  suggestion: string;
}

// ── Detection Patterns ─────────────────────────────────────────

interface Pattern {
  name: string;
  regex: RegExp;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  suggestion: string;
}

const PATTERNS: Pattern[] = [
  // Provider-specific
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g, severity: "CRITICAL", suggestion: "Move to .env.local: AWS_ACCESS_KEY_ID=..." },
  { name: "Stripe Live Secret", regex: /sk_live_[0-9a-zA-Z]{24,}/g, severity: "CRITICAL", suggestion: "Move to .env.local: STRIPE_SECRET_KEY=..." },
  { name: "Stripe Live Pub", regex: /pk_live_[0-9a-zA-Z]{24,}/g, severity: "HIGH", suggestion: "Move to .env.local: NEXT_PUBLIC_STRIPE_KEY=..." },
  { name: "OpenAI Key", regex: /sk-[a-zA-Z0-9]{20,}/g, severity: "CRITICAL", suggestion: "Move to .env.local: OPENAI_API_KEY=..." },
  { name: "GitHub PAT", regex: /ghp_[a-zA-Z0-9]{36}/g, severity: "CRITICAL", suggestion: "Move to .env.local: GITHUB_TOKEN=..." },
  { name: "GitHub OAuth", regex: /gho_[a-zA-Z0-9]{36}/g, severity: "CRITICAL", suggestion: "Move to .env.local: GITHUB_OAUTH_TOKEN=..." },
  { name: "Google API Key", regex: /AIza[0-9A-Za-z_-]{35}/g, severity: "HIGH", suggestion: "Move to .env.local: GOOGLE_API_KEY=..." },
  // Generic
  { name: "Private Key", regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g, severity: "CRITICAL", suggestion: "Remove private key from source code. Use secure vault." },
  { name: "Connection String", regex: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g, severity: "CRITICAL", suggestion: "Move to .env.local: DATABASE_URL=..." },
  { name: "Password Assignment", regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/gi, severity: "HIGH", suggestion: "Move to .env.local and use process.env" },
  { name: "API Key Assignment", regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"][^'"]+['"]/gi, severity: "HIGH", suggestion: "Move to .env.local and use process.env" },
];

// ── Exclusions ─────────────────────────────────────────────────

const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map"];
const EXCLUDED_FILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", ".env.example"];
const FALSE_POSITIVE_WORDS = ["example", "placeholder", "dummy", "sample", "test", "mock", "fake", "todo", "fixme", "changeme", "replace_me"];

function shouldScan(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  if (EXCLUDED_EXTENSIONS.includes(ext)) return false;
  if (EXCLUDED_FILES.includes(basename)) return false;
  if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx") || filePath.endsWith(".e2e.ts")) return false;
  if (filePath.endsWith(".md")) return false;
  if (filePath.includes("node_modules")) return false;
  return true;
}

function isFalsePositive(line: string): boolean {
  const lower = line.toLowerCase();
  return FALSE_POSITIVE_WORDS.some(w => lower.includes(w));
}

// ── Scanner ────────────────────────────────────────────────────

function scanFile(filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");

  for (const pattern of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(new RegExp(pattern.regex.source, pattern.regex.flags));

      for (const match of matches) {
        if (isFalsePositive(line)) continue;

        const matchedText = match[0];
        const masked = matchedText.substring(0, 8) + "...";

        findings.push({
          file: filePath,
          line: i + 1,
          column: (match.index || 0) + 1,
          pattern: pattern.name,
          matched_text: masked,
          severity: pattern.severity,
          suggestion: pattern.suggestion,
        });
      }
    }
  }

  return findings;
}

// ── Main ───────────────────────────────────────────────────────

function main(): void {
  // Get staged files
  let stagedFiles: string[];
  try {
    const output = execSync("git diff --cached --name-only", { encoding: "utf-8" });
    stagedFiles = output.trim().split("\n").filter(Boolean);
  } catch {
    console.log("No git staging area found. Skipping scan.");
    process.exit(0);
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  // Scan each file
  const allFindings: SecretFinding[] = [];

  for (const file of stagedFiles) {
    if (!shouldScan(file)) continue;
    if (!fs.existsSync(file)) continue;
    allFindings.push(...scanFile(file));
  }

  // Report
  if (allFindings.length === 0) {
    console.log("Secret scan: CLEAN — no secrets detected in staged files.");
    process.exit(0);
  }

  const critical = allFindings.filter(f => f.severity === "CRITICAL");
  const high = allFindings.filter(f => f.severity === "HIGH");

  console.error("\n========================================");
  console.error("  SECRET DETECTION — COMMIT BLOCKED");
  console.error("========================================\n");

  for (const finding of allFindings) {
    console.error(`  [${finding.severity}] ${finding.file}:${finding.line}`);
    console.error(`    Pattern: ${finding.pattern}`);
    console.error(`    Matched: ${finding.matched_text}`);
    console.error(`    Fix: ${finding.suggestion}`);
    console.error("");
  }

  console.error(`  Summary: ${critical.length} CRITICAL, ${high.length} HIGH`);
  console.error("\n  Commit blocked. Fix the above issues and try again.");
  console.error("  Use .env.local for secrets (never committed).\n");
  console.error("========================================\n");

  process.exit(1);
}

main();
