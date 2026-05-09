# Directive 206 — `/platform/tickets` full implementation

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-206
**Builds on:** D-004 (support_tickets table + RLS).

---

## Problem

`/platform/tickets` is a placeholder. Org admins can raise tickets via D-005 onboarding hooks but super-admin has no inbox / reply UI. Closes the support loop end-to-end.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Additive migration: `support_tickets` gets `kind` (text, nullable; for the D-201 "plan upgrade" link) and `replies` (jsonb DEFAULT `[]`). Existing CHECK constraints unchanged (status remains `open / responded / closed`).
- [ ] **AC-2** Update D-225 seeder: replace `status='resolved'` with `status='closed'` so seeded tickets pass the CHECK.
- [ ] **AC-3** New library `src/lib/platform/tickets.ts`: `listTickets({status_filter?})`, `getTicket(id)`, `replyToTicket(ticket_id, body, actor)`, `setTicketStatus(ticket_id, status, actor)`.
- [ ] **AC-4** Page `/platform/tickets/page.tsx`: replaces placeholder. Status filter (open / responded / closed / any), per-row click-through. Open count badge in header.
- [ ] **AC-5** Page `/platform/tickets/[id]/page.tsx`: thread view (subject, kind, original body, replies list) + reply textarea + status select. Super_admin only.
- [ ] **AC-6** `replyToTicket` appends `{body, sent_by, sent_at}` to `replies` JSONB; transitions status `open → responded` if it was open. Audit-logged.
- [ ] **AC-7** `setTicketStatus` audit-logged with `from`/`to`.

## Tests

- [ ] **AC-8** Unit tests for the lib functions (list filter, getTicket cross-tenant safety, replyToTicket appends + transitions, setTicketStatus audit).
- [ ] **AC-9** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Email-out on reply — V3 (UI surfaces a "would email customer" notice for v2).
- Org-admin reply (the customer side) — V3.
- File attachments — V3.

## Stack

shadcn Card / Table / Textarea + Supabase service-role + Constitution III provenance.
