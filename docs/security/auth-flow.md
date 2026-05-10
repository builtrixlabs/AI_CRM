# Auth flow diagrams — Builtrix CRM v3.0

ASCII for portability — readable in any browser, any pen-test report.

---

## 1. Sign-in (password)

```
[Browser]                  [/api/auth/rate-check]      [Supabase Auth]   [middleware]    [/admin/...]
   |                              |                          |                |              |
   |  POST {email, password}      |                          |                |              |
   |---rate-check (email+IP)----->|                          |                |              |
   |  200 {allowed:true}          |                          |                |              |
   |<-----------------------------|                          |                |              |
   |                              |                          |                |              |
   |  signInWithPassword({email, password})                  |                |              |
   |--------------------------------------------------------->|                |              |
   |                              |                          |                |              |
   |   set-cookie sb-access + sb-refresh                     |                |              |
   |<---------------------------------------------------------|                |              |
   |                              |                          |                |              |
   |  GET /api/auth/whoami         (D-302 post-auth check)   |                |              |
   |--------------- → if user:null (org suspended) → signOut + show error     |              |
   |  user:{...}                   |                          |                |              |
   |<-----------------------------|                          |                |              |
   |                              |                          |                |              |
   |  GET /  (browser navigates home)                        |                |              |
   |--------------------------------------------------------->|--check route--|              |
   |                              |                          |                |              |
   |                              |                          |    decideRoute(user, "/")    |
   |                              |                          |    -> redirect "/admin"      |
   |                              |                          |                |              |
   |  302 /admin                                              |                |              |
   |<---------------------------------------------------------|<---------------|              |
   |                              |                          |                |              |
   |  GET /admin                                              |   getCurrentUser() → user    |
   |---------------------------------------------------------->|   decideRoute("/admin")    |
   |                              |                          |     -> allow                  |
   |  200 OK (RSC)                                            |                |   render    |
   |<---------------------------------------------------------|----------------|<-------------|
```

`getCurrentUser` lookup chain inside middleware: `auth.getUser()` → `profiles` SELECT → if `organization_id` set, `app_is_org_revoked(org_id)` RPC. Fail-closed: any error → `null` → middleware redirects to `/auth/sign-in`.

---

## 2. MFA enrollment (D-300)

```
[Browser]                          [/auth/mfa/setup]                [profiles row]
   |                                       |                              |
   |  GET (1st time)                       |                              |
   |-------------------------------------->|                              |
   |                                       |  generateSecret() (TOTP)     |
   |                                       |  generateCodes(10)           |
   |                                       |  encryptSecret -> mfa_secret |
   |                                       |  hashCodes -> mfa_recovery_  |
   |                                       |   codes                      |
   |                                       |---------UPSERT-------------->|
   |                                       |                              |
   |  page renders QR + 10 codes (one-time visible)                       |
   |<--------------------------------------|                              |
   |                                       |                              |
   |  POST {code: "123456"}                |                              |
   |-------------------------------------->|                              |
   |                                       |  decryptSecret + verifyCode  |
   |                                       |  ±30s skew window            |
   |                                       |                              |
   |                                       |  on match:                   |
   |                                       |    SET mfa_enrolled_at = now |
   |                                       |    SET mfa_verified_at = now |
   |                                       |    audit_log: "mfa.enrolled" |
   |                                       |---------UPDATE-------------->|
   |                                       |                              |
   |  302 returnTo                         |                              |
   |<--------------------------------------|                              |
```

Recovery codes are downloadable as `.txt` once. Re-render before enroll completes shows the same QR (re-decrypted from pending `mfa_secret`); recovery codes are NOT re-shown (already hashed, plaintext discarded).

---

## 3. MFA verify on sensitive route (D-300 hard redirect)

```
[Browser]              [middleware]                            [/auth/mfa]
   |                          |                                     |
   |  GET /admin/billing      |                                     |
   |------------------------->|                                     |
   |                          |  getCurrentUser → user with         |
   |                          |    mfa_verified_at = 9h ago         |
   |                          |  isMfaFresh()=false                 |
   |                          |  isSensitiveRoute("/admin/billing") |
   |                          |   = true                            |
   |                          |  decideRoute → redirect              |
   |                          |   /auth/mfa?return=/admin/billing    |
   |                          |                                     |
   |  302 /auth/mfa?return=/admin/billing                            |
   |<-------------------------|                                     |
   |                          |                                     |
   |  GET /auth/mfa           |                                     |
   |---------------------------------------------------------------->|
   |                          |                                     |  render verify form
   |  page                    |                                     |
   |<----------------------------------------------------------------|
   |                          |                                     |
   |  POST {code: "654321"}   |                                     |
   |---------------------------------------------------------------->|
   |                          |                                     |  decryptSecret
   |                          |                                     |  verifyCode (±30s)
   |                          |                                     |  bump mfa_verified_at
   |                          |                                     |  audit "mfa.verified"
   |                          |                                     |
   |  302 /admin/billing      |                                     |
   |<----------------------------------------------------------------|
   |                          |                                     |
   |  GET /admin/billing      |                                     |
   |------------------------->|  isMfaFresh()=true → allow → render |
   |  200                     |                                     |
   |<-------------------------|                                     |
```

Recovery code path is identical except form posts to `verifyRecoveryAction` which calls `markCodeUsed` (single-use enforced).

---

## 4. Suspend → forced sign-out (D-302)

```
[super_admin browser]   [/platform/subscriptions]   [DB]                  [org_admin browser]
       |                           |                  |                          |
       |  click "Suspend"          |                  |                          |
       |-------------------------->|                  |                          |
       |                           |  suspendOrg()    |                          |
       |                           |  --UPDATE subs status='suspended'           |
       |                           |  --INSERT org_session_revocations           |
       |                           |  --audit "subscription_suspended"           |
       |                           |  ----------UPDATE/INSERT-->|                |
       |                           |                  |                          |
       |  redirect                 |                  |                          |
       |<--------------------------|                  |                          |
                                                                                   |
                                                                  [some time later — could be seconds]
                                                                                   |
                                                                                   |  GET /dashboard
                                                                                   |---->[middleware]
                                                                                            |
                                                                                            |  getCurrentUser
                                                                                            |    auth.getUser → ok
                                                                                            |    profiles SELECT → ok
                                                                                            |    rpc("app_is_org_revoked",
                                                                                            |        {org_id})
                                                                                            |    --SELECT-->[DB]
                                                                                            |    ←true
                                                                                            |  return null
                                                                                            |
                                                                                            |  decideRoute(null, "/dashboard")
                                                                                            |    → redirect /auth/sign-in
                                                                                            |
                                                                  302 /auth/sign-in           |
                                                                                   |<--------|
                                                                                   |
                                                                                   |  user tries to sign in
                                                                                   |  signInWithPassword OK
                                                                                   |  GET /api/auth/whoami → user:null
                                                                                   |    (because revocation row exists)
                                                                                   |  signOut + show "Account suspended"
```

Reactivate: super_admin clicks "Reactivate" → `reactivateOrg` deletes the revocation row → next sign-in sticks.

---

## 5. RLS query path (every authenticated SELECT)

```
[server component]  [@supabase/ssr]  [Postgres]
       |                  |              |
       |  user clicks         |              |
       |  /dashboard/leads/X  |              |
       |  → server component  |              |
       |  → supabase.from("nodes").select("...")              |
       |    .eq("id", X)                                      |
       |    .eq("node_type", "lead")                          |
       |    .is("deleted_at", null)                           |
       |    .maybeSingle()                                    |
       |---------------------->|              |
       |                  |  HTTP+JWT in     |
       |                  |  authorization   |
       |                  |  header          |
       |                  |--------------->  |
       |                  |              |  | extract org_id from JWT claim
       |                  |              |  | apply RLS USING:
       |                  |              |  |   organization_id = auth.org_id()
       |                  |              |  | run SELECT
       |                  |              |  | return matching rows (0 or 1)
       |                  |<---------------|
       |  data            |              |
       |<-----------------|              |
```

Cross-tenant: if the URL contained an X belonging to org B but the user is org A, the RLS predicate filters it out → `.maybeSingle()` returns `data: null` → page renders 404. No 403 leak — both "doesn't exist" and "exists but cross-tenant" produce the same shape.

---

## 6. Stripe webhook (D-310 idempotency)

```
[Stripe edge]            [/api/stripe/webhook]                 [stripe_event_log]   [subscriptions]
     |                            |                                  |                      |
     |  POST signed event         |                                  |                      |
     |--------------------------->|                                  |                      |
     |                            |  read raw body (text)            |                      |
     |                            |  verifyWebhookSignature(...)     |                      |
     |                            |  → throws on tamper → 400        |                      |
     |                            |                                  |                      |
     |                            |  SELECT FROM stripe_event_log    |                      |
     |                            |    WHERE event_id = ?            |                      |
     |                            |---------SELECT------------------>|                      |
     |                            |  ←found → 200 replay (no-op)     |                      |
     |                            |  ←not-found → continue           |                      |
     |                            |                                  |                      |
     |                            |  switch event.type               |                      |
     |                            |   handleSubscriptionCreated      |                      |
     |                            |    UPDATE subscriptions SET      |                      |
     |                            |     status='active',             |                      |
     |                            |     stripe_subscription_id=...   |                      |
     |                            |   WHERE org_id = metadata.org_id |                      |
     |                            |--------------UPDATE------------------------------------>|
     |                            |                                  |                      |
     |                            |   audit_log row                  |                      |
     |                            |                                  |                      |
     |                            |  INSERT stripe_event_log         |                      |
     |                            |    (event_id, event_type,        |                      |
     |                            |     payload)                     |                      |
     |                            |---------INSERT------------------>|                      |
     |                            |  ←ok or 23505 (benign — race)   |                      |
     |                            |                                  |                      |
     |  200 OK                    |                                  |                      |
     |<---------------------------|                                  |                      |
```

Race: two concurrent identical deliveries can both pass the SELECT check before either INSERT. PK conflict on the second swallowed (`status='clean'` per security scan). Handler UPDATEs are deterministic — re-running yields same final state. Audit_log row may be duplicated (acceptable forensic noise, append-only).

---

## 7. Outbound webhook delivery (D-311)

```
[Inngest cron]    [worker.runWebhookWorker]          [DB]                       [Customer URL]
      |                    |                          |                                |
      |  every 1 min       |                          |                                |
      |  trigger "sweep"   |                          |                                |
      |------------------->|                          |                                |
      |                    |  SELECT pending          |                                |
      |                    |   AND next_retry_at <=now|                                |
      |                    |   LIMIT 50               |                                |
      |                    |------SELECT------------->|                                |
      |                    |  ←50 rows                |                                |
      |                    |                          |                                |
      |                    |  for each row:           |                                |
      |                    |    SELECT endpoint       |                                |
      |                    |    if disabled_at: dead  |                                |
      |                    |    checkUrlSsrf(url)     |                                |
      |                    |     if blocked: dead     |                                |
      |                    |    sign body w/ secret   |                                |
      |                    |    POST w/ 5s timeout    |                                |
      |                    |---------------signed POST------------------------------->|
      |                    |                          |                                |
      |                    |    classify:              |                                |
      |                    |     2xx → delivered       |                                |
      |                    |     4xx → dead (no retry) |                                |
      |                    |     5xx/timeout → retry   |                                |
      |                    |    UPDATE row + endpoint  |                                |
      |                    |     counter               |                                |
      |                    |    if 10 consecutive      |                                |
      |                    |     fails: disable        |                                |
      |                    |     endpoint               |                                |
      |                    |------UPDATE-------------->|                                |
      |                    |                          |                                |
      |                    |    audit_log              |                                |
      |                    |                          |                                |
      |  return summary    |                          |                                |
      |<-------------------|                          |                                |
```

Retry schedule (per `src/lib/webhooks/retry.ts`): 1m, 5m, 30m, 2h, 12h. After attempt 6, status flips to `dead` permanently. Endpoint auto-disabled after 10 consecutive failures (`webhook_endpoints.disabled_at`).

---

## Threat boundary summary

```
              ┌─────────────────────────────────────────┐
              │ Customer / org_admin / sales_rep         │
              └────┬─────────────────┬───────────────────┘
                   │                  │
                   ▼                  ▼
       ┌──────────────────┐  ┌──────────────────┐
       │ /auth/sign-in    │  │ /api/* routes    │
       │ rate-limit       │  │ HMAC/Bearer auth │
       │ KV-backed (D-301)│  │ + idempotency    │
       └────┬─────────────┘  └────┬─────────────┘
            ▼                      ▼
       ┌─────────────────────────────────────┐
       │ Edge middleware (route-policy.ts)    │
       │  decideRoute(user, path, mfa_state)  │
       │  - role-based + MFA gate              │
       │  - /auth/mfa* bypass for unblock     │
       └────┬──────────────────────────────────┘
            ▼
       ┌──────────────────────────────────┐
       │ Server Component / Server Action  │
       │  getCurrentUser():                 │
       │   - profiles SELECT                │
       │   - rpc(app_is_org_revoked)        │
       │   - fail-closed on RPC error       │
       │  Permission gate (resolveForUser)  │
       │  Tenant pre-check (caller_org_id)  │
       └────┬──────────────────────────────────┘
            ▼
       ┌──────────────────────────────────┐
       │ Supabase Postgres (RLS layer)     │
       │  USING (org_id = auth.org_id())    │
       │  + DB triggers for append-only    │
       │  + SECURITY DEFINER guards         │
       └────────────────────────────────────┘
```

Each layer can be probed independently. The test plan in `tests/integration/rls-audit.test.ts` covers the bottom layer programmatically; the pen-test should focus on the upper three.
