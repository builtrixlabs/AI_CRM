/**
 * Raw-SQL helper for integration tests. Used to apply DDL fixtures (e.g.
 * cp_submissions) that are TEST-DB-ONLY and don't belong in supabase/migrations.
 */

import { Client } from "pg";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.DATABASE_URL ?? "";

if (!databaseUrl) {
  throw new Error(
    "Integration SQL helpers require DATABASE_URL (used for raw DDL like CP fixture)."
  );
}

export async function execSqlFile(path: string): Promise<void> {
  const sql = await readFile(path, "utf8");
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function execSql(sql: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
