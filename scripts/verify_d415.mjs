import { Client } from "pg";
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const checks = [
  {
    name: "agent_approval_queue.sent_at column",
    sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_approval_queue' AND column_name='sent_at') AS ok`,
  },
  {
    name: "agent_approval_queue.provider column",
    sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_approval_queue' AND column_name='provider') AS ok`,
  },
  {
    name: "agent_approval_queue.provider_message_id column",
    sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_approval_queue' AND column_name='provider_message_id') AS ok`,
  },
  {
    name: "agent_approval_queue.send_error column",
    sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_approval_queue' AND column_name='send_error') AS ok`,
  },
  {
    name: "channel CHECK includes 'sms'",
    sql: `SELECT pg_get_constraintdef(oid) LIKE '%sms%' AS ok FROM pg_constraint WHERE conname='agent_approval_queue_channel_chk'`,
  },
  {
    name: "channel CHECK still includes 'whatsapp' + 'email'",
    sql: `SELECT pg_get_constraintdef(oid) LIKE '%whatsapp%' AND pg_get_constraintdef(oid) LIKE '%email%' AS ok FROM pg_constraint WHERE conname='agent_approval_queue_channel_chk'`,
  },
];
let pass = 0,
  fail = 0;
for (const k of checks) {
  const r = await c.query(k.sql);
  const ok = r.rows[0]?.ok === true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${k.name}`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass}/${pass + fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
