-- D-415 — extend agent_approval_queue for auto-dispatch.
--
-- Adds:
--   - channel CHECK now accepts 'sms' (in addition to existing 'whatsapp','email')
--   - sent_at timestamptz — when dispatch succeeded
--   - provider text — adapter provider id used ('mock','postmark','msg91',...)
--   - provider_message_id text — adapter's message id for later lookup
--   - send_error text — last dispatch error (null if never tried or last send succeeded)
--
-- Additive only. Idempotent. Re-applying drops + recreates the CHECK constraint
-- (constraint names are stable) so it picks up the new allowed channel.

ALTER TABLE public.agent_approval_queue
  DROP CONSTRAINT IF EXISTS agent_approval_queue_channel_chk;

ALTER TABLE public.agent_approval_queue
  ADD CONSTRAINT agent_approval_queue_channel_chk
  CHECK (channel IN ('whatsapp', 'email', 'sms'));

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL;

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS provider text NULL;

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS provider_message_id text NULL;

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS send_error text NULL;

NOTIFY pgrst, 'reload schema';
