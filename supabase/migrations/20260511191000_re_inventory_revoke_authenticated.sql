-- D-420 follow-up — explicitly revoke EXECUTE on expire_inventory_holds
-- from authenticated + anon. The base migration revoked from PUBLIC, but
-- Supabase pre-grants EXECUTE on public-schema functions to authenticated
-- (so PostgREST can route RPC calls). For cron-only functions we must
-- revoke that grant too. service_role keeps EXECUTE.

REVOKE EXECUTE ON FUNCTION public.expire_inventory_holds(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_inventory_holds(integer) FROM anon;

NOTIFY pgrst, 'reload schema';
