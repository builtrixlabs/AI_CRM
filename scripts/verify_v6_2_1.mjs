#!/usr/bin/env node
/**
 * verify_v6_2_1.mjs — Verify v6.2.1 migrations landed.
 *
 * Asserts:
 *   1. agent_approval_queue is in the supabase_realtime publication
 *      (20260515130000_agent_queue_realtime_publication.sql)
 *   2. organizations.feature_flags column exists with jsonb type +
 *      DEFAULT '{}'::jsonb + NOT NULL
 *      (20260515130500_organizations_feature_flags.sql)
 *
 * Exits 0 on all-green, 1 on any failure.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv(resolve(process.cwd(), ".env.local"));
loadDotenv(resolve(process.cwd(), ".env"));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "[ ok ]" : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
}

(async () => {
  await client.connect();

  // ── Check 1: agent_approval_queue in supabase_realtime publication ─────
  {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'agent_approval_queue'`,
    );
    check(
      "agent_approval_queue is in supabase_realtime publication",
      rows.length === 1,
      rows.length === 1 ? "" : "missing",
    );
  }

  // ── Check 2: organizations.feature_flags column ────────────────────────
  {
    const { rows } = await client.query(
      `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'organizations'
           AND column_name = 'feature_flags'`,
    );
    if (rows.length === 0) {
      check("organizations.feature_flags column exists", false, "missing");
    } else {
      const r = rows[0];
      const typeOk = r.data_type === "jsonb";
      const notNullOk = r.is_nullable === "NO";
      const defaultOk = /^'\{\}'::jsonb$/i.test(r.column_default ?? "");
      check(
        "organizations.feature_flags type=jsonb",
        typeOk,
        typeOk ? "" : `got ${r.data_type}`,
      );
      check(
        "organizations.feature_flags NOT NULL",
        notNullOk,
        notNullOk ? "" : "nullable",
      );
      check(
        "organizations.feature_flags DEFAULT '{}'::jsonb",
        defaultOk,
        defaultOk ? "" : `got ${r.column_default}`,
      );
    }
  }

  // ── Check 3: applied_migrations ledger has both rows ───────────────────
  {
    const { rows } = await client.query(
      `SELECT name FROM public.applied_migrations
         WHERE name IN (
           '20260515130000_agent_queue_realtime_publication.sql',
           '20260515130500_organizations_feature_flags.sql'
         ) ORDER BY name`,
    );
    check(
      "applied_migrations ledger contains both v6.2.1 entries",
      rows.length === 2,
      `found ${rows.length} of 2 (${rows.map((r) => r.name).join(", ")})`,
    );
  }

  // ── Check 4: a sample organization row picks up the default ────────────
  {
    const { rows } = await client.query(
      `SELECT id, feature_flags FROM public.organizations LIMIT 1`,
    );
    if (rows.length === 0) {
      check(
        "sample org has feature_flags",
        true,
        "no orgs exist (skip)",
      );
    } else {
      const r = rows[0];
      const looksLikeObject =
        r.feature_flags !== null && typeof r.feature_flags === "object";
      check(
        "sample org has feature_flags populated (object)",
        looksLikeObject,
        looksLikeObject ? `id=${r.id}` : `got ${JSON.stringify(r.feature_flags)}`,
      );
    }
  }

  await client.end();

  const failed = checks.filter((c) => !c.ok).length;
  console.log("");
  console.log(`${checks.length - failed} / ${checks.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error(err instanceof Error ? err.stack : err);
  await client.end().catch(() => undefined);
  process.exit(1);
});
