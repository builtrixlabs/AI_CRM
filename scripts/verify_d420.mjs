/* eslint-disable no-console */
/**
 * D-420 — verify the RE Inventory migration landed cleanly on the live DB.
 *
 * Mirrors scripts/verify_d413.mjs and scripts/verify_d417.mjs in shape:
 * a flat list of independent boolean checks, each returning `ok` true/false.
 */
import { Client } from "pg";

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  {
    name: "nodes.node_type CHECK includes 'project'",
    sql: `
      SELECT pg_get_constraintdef(c.oid) ~ '''project''' AS ok
      FROM pg_constraint c
      WHERE c.conrelid = 'public.nodes'::regclass
        AND c.conname = 'nodes_node_type_check'
    `,
  },
  {
    name: "nodes.node_type CHECK includes 'tower'",
    sql: `
      SELECT pg_get_constraintdef(c.oid) ~ '''tower''' AS ok
      FROM pg_constraint c
      WHERE c.conrelid = 'public.nodes'::regclass
        AND c.conname = 'nodes_node_type_check'
    `,
  },
  {
    name: "custom_views.entity_type CHECK includes 'project'",
    sql: `
      SELECT pg_get_constraintdef(c.oid) ~ '''project''' AS ok
      FROM pg_constraint c
      WHERE c.conrelid = 'public.custom_views'::regclass
        AND c.conname = 'custom_views_entity_type_check'
    `,
  },
  {
    name: "custom_views.entity_type CHECK includes 'tower'",
    sql: `
      SELECT pg_get_constraintdef(c.oid) ~ '''tower''' AS ok
      FROM pg_constraint c
      WHERE c.conrelid = 'public.custom_views'::regclass
        AND c.conname = 'custom_views_entity_type_check'
    `,
  },
  {
    name: "nodes.state_expires_at column exists (timestamptz)",
    sql: `
      SELECT (data_type = 'timestamp with time zone') AS ok
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nodes'
        AND column_name = 'state_expires_at'
    `,
  },
  {
    name: "nodes_state_expires_at_idx partial index exists",
    sql: `
      SELECT EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'nodes'
          AND indexname = 'nodes_state_expires_at_idx'
      ) AS ok
    `,
  },
  {
    name: "transition_unit_state RPC exists",
    sql: `
      SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'transition_unit_state'
      ) AS ok
    `,
  },
  {
    name: "expire_inventory_holds RPC exists",
    sql: `
      SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'expire_inventory_holds'
      ) AS ok
    `,
  },
  {
    name: "transition_unit_state runs as SECURITY DEFINER",
    sql: `
      SELECT prosecdef AS ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'transition_unit_state'
      LIMIT 1
    `,
  },
  {
    name: "expire_inventory_holds runs as SECURITY DEFINER",
    sql: `
      SELECT prosecdef AS ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'expire_inventory_holds'
      LIMIT 1
    `,
  },
  {
    name: "transition_unit_state EXECUTE granted to authenticated",
    sql: `
      SELECT has_function_privilege(
        'authenticated',
        'public.transition_unit_state(uuid, text, uuid, text, text, boolean, integer, integer)',
        'EXECUTE'
      ) AS ok
    `,
  },
  {
    name: "expire_inventory_holds NOT granted to authenticated",
    sql: `
      SELECT NOT has_function_privilege(
        'authenticated',
        'public.expire_inventory_holds(integer)',
        'EXECUTE'
      ) AS ok
    `,
  },
];

let pass = 0;
let fail = 0;
for (const k of checks) {
  try {
    const r = await c.query(k.sql);
    const ok = r.rows[0]?.ok === true;
    console.log(`${ok ? "PASS" : "FAIL"}  ${k.name}`);
    if (ok) pass++;
    else fail++;
  } catch (err) {
    console.log(`ERR   ${k.name} — ${err.message}`);
    fail++;
  }
}
console.log(`\n${pass}/${pass + fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
