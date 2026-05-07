// Vibe OS V4 — plugin scaffold helpers.
// Atomic-ish: writes go directly; failures are not rolled back. Caller wraps in try/catch.

import {
  mkdirSync,
  cpSync,
  existsSync,
  statSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OS_ROOT = resolve(PLUGIN_ROOT, "..");

export function nowIso() {
  return new Date().toISOString();
}

// Source paths in the OS repo that are part of the canonical V5 plugin.
// These get copied into the consumer at `init` time.
export const SOURCE_PATHS = {
  "CLAUDE.md": "CLAUDE.md",
  "VIBE_OS_V5_SPEC.md": "VIBE_OS_V5_SPEC.md",
  ".claude/hooks": ".claude/hooks",
  ".claude/skills": ".claude/skills",
  ".claude/agents": ".claude/agents",
  ".claude/settings.json": ".claude/settings.json",
  ".github/workflows/post-merge-watchdog.yml": ".github/workflows/post-merge-watchdog.yml",
  "policy": "policy",
  "baseline": "baseline",
  "runbooks": "runbooks",
  "scripts/v5": "scripts/v5",
  "scripts/mcp": "scripts/mcp",
  "scripts/secret-scanner.ts": "scripts/secret-scanner.ts",
  "plugin": "plugin",
  ".husky/pre-commit": ".husky/pre-commit",
  ".mcp.json": ".mcp.json",
};

// Template files copied only if NOT already present in target.
// These are starter scaffolds — operator is expected to customize per app.
export const TEMPLATE_FILES = {
  "package.json": "package.json",
  "tsconfig.json": "tsconfig.json",
  ".gitignore": ".gitignore",
  "README.md": "README.md",
};

// Empty dirs to create in the consumer (with .gitkeep).
export const EMPTY_DIRS = [
  "directives",
  "memory/logs/execution",
  "memory/logs/subagents",
  "memory/learned",
  "orchestration",
  "specs",
  "execution",
  "src",
  "tests",
];

export function listConflicts(targetDir) {
  const conflicts = [];
  if (!existsSync(targetDir)) return conflicts;
  for (const [, dst] of Object.entries(SOURCE_PATHS)) {
    const dstAbs = join(targetDir, dst);
    if (existsSync(dstAbs)) conflicts.push(dst);
  }
  return conflicts;
}

export function copyAll(targetDir, opts = {}) {
  const { force = false, reuseExisting = false, log = () => {} } = opts;

  const conflicts = listConflicts(targetDir);
  if (conflicts.length && !force && !reuseExisting) {
    throw new Error(
      `Target has ${conflicts.length} conflicting paths:\n  ` +
        conflicts.slice(0, 8).join("\n  ") +
        (conflicts.length > 8 ? `\n  …and ${conflicts.length - 8} more` : "") +
        "\n\nUse --force to overwrite or --reuse-existing to skip these."
    );
  }

  mkdirSync(targetDir, { recursive: true });

  for (const [src, dst] of Object.entries(SOURCE_PATHS)) {
    const srcAbs = join(OS_ROOT, src);
    const dstAbs = join(targetDir, dst);

    if (!existsSync(srcAbs)) {
      log(`SKIP source missing: ${src}`);
      continue;
    }

    if (existsSync(dstAbs)) {
      if (reuseExisting) {
        log(`KEEP existing: ${dst}`);
        continue;
      }
      if (force) {
        rmSync(dstAbs, { recursive: true, force: true });
      }
    }

    mkdirSync(dirname(dstAbs), { recursive: true });

    const srcStat = statSync(srcAbs);
    if (srcStat.isDirectory()) {
      cpSync(srcAbs, dstAbs, {
        recursive: true,
        // Don't carry runtime state (hook logs, generated dirs) into a fresh consumer.
        filter: (s) => {
          const norm = s.replace(/\\/g, "/");
          if (norm.includes("/.claude/hooks/log")) return false;
          if (norm.endsWith("/.gitkeep")) return true;
          return true;
        },
      });
    } else {
      cpSync(srcAbs, dstAbs);
    }
    log(`COPY ${src} → ${dst}`);
  }

  for (const d of EMPTY_DIRS) {
    const abs = join(targetDir, d);
    mkdirSync(abs, { recursive: true });
    const keep = join(abs, ".gitkeep");
    if (!existsSync(keep)) writeFileSync(keep, "", "utf8");
    log(`MKDIR ${d}`);
  }

  // Templates: copy only if target file doesn't exist (never overwrite, even with --force).
  // Templates live in plugin/templates/ and provide starter package.json, tsconfig.json, .gitignore, README.md.
  const templatesDir = join(PLUGIN_ROOT, "templates");
  for (const [src, dst] of Object.entries(TEMPLATE_FILES)) {
    const srcAbs = join(templatesDir, src);
    const dstAbs = join(targetDir, dst);
    if (!existsSync(srcAbs)) {
      log(`SKIP template missing: ${src}`);
      continue;
    }
    if (existsSync(dstAbs)) {
      log(`KEEP existing template target: ${dst}`);
      continue;
    }
    cpSync(srcAbs, dstAbs);
    log(`TEMPLATE ${src} → ${dst}`);
  }

  const manifest = readManifest();
  const marker = join(targetDir, "memory", "project-init.md");
  if (!existsSync(marker)) {
    writeFileSync(
      marker,
      `# Project Init\n\n- Initialized by: vibe-os ${manifest.version}\n- Initialized at: ${nowIso()}\n- Source repo: ${OS_ROOT}\n`,
      "utf8"
    );
    log(`WRITE memory/project-init.md`);
  }
}

export function readManifest() {
  const file = join(PLUGIN_ROOT, "plugin.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listMigrations() {
  const dir = join(PLUGIN_ROOT, "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .sort();
}
