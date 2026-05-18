# Directive 500 — Builtrix Design System + dark Command Center shell

**Status:** Authored
**Date:** 2026-05-12
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/500-builtrix-design-system-shell` → PR target `v5`
**Pre-flight for:** Phase 1 of [AI_CRM-4 order of implementation v2](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)
**Memory:** [v5_branching](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/v5_branching.md), [per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md), [pscrm_admin_full_port](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/pscrm_admin_full_port.md)

## 1. Problem
AI_CRM ships a generic grayscale shadcn theme — fine as default, wrong as the operator's daily Command Center. Operator supplied three screenshots of a dark cyber Command Center experience that every downstream feature must inherit. Building the per-org integration directives (D-433 Exotel, D-434 Resend, D-435 MSG91, D-432 WhatsApp, D-439 integrations index) on top of the current light theme means re-skin rework later. Lock the design system + shell first; everything else renders inside it.

## 2. Goal
1. Adopt PSCRM's Builtrix design tokens (Foundation indigo · Transition amethyst · Aspiration copper) as the **light theme** baseline.
2. Author a new **dark Command Center theme** (teal · violet · mint · amber on near-black canvas) for operational surfaces matching the supplied screenshots.
3. Replace `/dashboard` (the operator's daily home) with a Command Center page: status topbar, dark sidebar with brand sigil, four-up KPI tiles, three-column live grid (Pulse feed · Lead Heatmap · Agentic State), 5-node state-machine canvas, Hot Leads strip, sticky bottom Command Builtrix Cmd+K bar.
4. Keep every existing page rendering — pages we haven't touched yet inherit the new tokens via shadcn semantic CSS variables (the upgrade is non-breaking).

## 3. Scope (in)
- `src/app/globals.css` — full rewrite with Builtrix light + dark Command Center tokens, gradients, glow shadows, and utility classes (`.eyebrow`, `.pill-*`, `.cc-eyebrow`, `.cc-card`, `.cc-pill-*`, `.cc-sigil-*`, `.cc-bar-*`, `.cc-blob-*`, `.cc-bg-canvas`, `.cc-bg-grid`, `.cc-live-dot`).
- `src/app/layout.tsx` — add `Geist_Mono` font variable (`--font-mono`) for monospace eyebrow / pill usage.
- `src/app/(dashboard)/layout.tsx` — new dark Command Center shell wrapping the existing `NewLeadDialogProvider` + `CommandPalette` (D-008): scoped `.dark` div, `cc-bg-canvas`, sidebar + topbar + sticky bottom bar.
- `src/components/shell/command-center-sidebar.tsx` — icon-only left rail.
- `src/components/shell/command-center-topbar.tsx` — status eyebrow + workspace switcher + bell + avatar.
- `src/components/shell/command-builtrix-bar.tsx` — sticky bottom Cmd+K trigger surface; dispatches synthetic ⌘K keydown to open the existing `CommandPalette`.
- `src/components/command-center/kpi-tiles.tsx` — four-up KPI row.
- `src/components/command-center/pulse-feed.tsx` — listener feed with channel sigils + mock entries.
- `src/components/command-center/lead-heatmap.tsx` — semantic cluster viz with gradient blobs over a faint grid.
- `src/components/command-center/agentic-state.tsx` — running orchestrations with progress bars.
- `src/components/command-center/hot-leads.tsx` — Hot Leads bottom strip.
- `src/components/command-center/state-machine-canvas.tsx` — 5-node lead workflow visualizer (image 2).
- `src/app/(dashboard)/dashboard/page.tsx` — new Command Center home composed from the above.

## 4. Out of scope
- Real-time pulse data pipe (Inngest subscription) → follow-up D-50x.
- Real Lead Heatmap clustering algorithm → follow-up D-50x.
- Cmd+K functional extensions beyond existing D-008 bounded catalog.
- Re-skinning every existing admin / platform / settings page. They inherit the token swap via shadcn semantic vars; explicit polish is D-501 (PSCRM admin port).
- Any D-433+ adapter or per-org provider work.

## 5. Per-org integration model — non-negotiable
Locked in [memory/per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md). Every downstream provider directive (D-433/4/5/2 onwards) configures credentials **per organization**, by the org_admin, inside the application. The operator is never the source of provider creds. D-500 only lays the visual surface; this rule binds the directives that plug into it.

## 6. Acceptance (10-gate STOPPING CRITERIA per CLAUDE.md V4 horizon)
1. **Built:** every component listed in §3 exists.
2. **Tested:** RTL unit tests pass for new components; `npx vitest run tests/components/command-center tests/components/shell` green.
3. **Typechecked:** `npx tsc --noEmit` clean for changed files.
4. **Migrations:** N/A — no schema changes.
5. **Pushed:** `feature/500-builtrix-design-system-shell` pushed to origin; PR opened against `v5`.
6. **Vercel preview green:** `mcp__vibe-vercel__wait_for_preview` → READY.
7. **UI verified on live preview:** screenshot `/dashboard` (Command Center home), sidebar, topbar, Hot Leads strip; visual fidelity ≥ 90% vs operator screenshots 1 + 3; state-machine canvas (screenshot 2) renders on the same page.
8. **PR merged to v5** (`gh pr merge --squash --delete-branch`).
9. **Post-merge v5 build green** (`wait_for_preview --branch v5` → READY).
10. **Status logged:** `docs/V5_STATUS.md` row D-500 goes `planned → shipped` with PR # + Vercel preview URL.

## 7. Reference inputs
- Operator screenshots 1, 2, 3 (2026-05-12).
- [AI_CRM-4 order of implementation v2](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md) — Phase 0 pre-flight that this directive serves.
- PSCRM `globals.css` at `C:\Users\ragha\Downloads\PSCRM_Claude-7.0.4\src\app\globals.css` — light-theme Builtrix tokens ported verbatim.
- `C:\Users\ragha\OneDrive\Desktop\MouseWithoutBorders\2.pdf` — supplementary mood board (text layer unrecoverable; treat as inspiration).
