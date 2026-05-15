/**
 * D-607 (V6 Phase 2) — ensure the private `brochures` Storage bucket exists.
 *
 * Supabase Storage has never been used in this codebase; D-607 is the first
 * directive to touch it. The bucket is created here (not in the SQL
 * migration) because the service-role key has unconditional Storage-admin
 * rights via the Storage API, whereas whether the DATABASE_URL role may
 * write storage.buckets is project-config-dependent — and a failure inside
 * the migration's BEGIN/COMMIT would roll back the brochures table with it.
 *
 * Idempotent — re-running is a no-op once the bucket exists.
 *
 * Run from the repo root with the project env loaded, e.g.:
 *   node --env-file=.env scripts/ensure_brochures_bucket.mjs
 *
 * Exits 0 on success (created or already-present), 1 on failure.
 */
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceKey) {
  console.error(
    "ensure_brochures_bucket: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required",
  );
  process.exit(1);
}

const BUCKET_ID = "brochures";
const MAX_FILE_BYTES = 26_214_400; // 25 MB — mirrors src/lib/brochures/schemas.ts
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const existing = await supabase.storage.getBucket(BUCKET_ID);
if (existing.data) {
  console.log(`SKIPPED — bucket '${BUCKET_ID}' already exists`);
  process.exit(0);
}

const { error } = await supabase.storage.createBucket(BUCKET_ID, {
  public: false,
  fileSizeLimit: MAX_FILE_BYTES,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
});

if (error) {
  // A racing creator (or a getBucket false-negative) — treat "already
  // exists" as success so the script stays idempotent.
  if (/already exists/i.test(error.message)) {
    console.log(`SKIPPED — bucket '${BUCKET_ID}' already exists`);
    process.exit(0);
  }
  console.error(`FAILED to create bucket '${BUCKET_ID}': ${error.message}`);
  process.exit(1);
}

console.log(
  `CREATED private bucket '${BUCKET_ID}' (cap ${MAX_FILE_BYTES} bytes, ` +
    `mime: ${ALLOWED_MIME_TYPES.join(", ")})`,
);
process.exit(0);
