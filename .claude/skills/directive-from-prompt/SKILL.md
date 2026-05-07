---
name: directive-from-prompt
description: Use this skill when converting a natural-language feature request ("build feature X", "fix Y", "enhance Z") into a structured directive markdown file under /directives.
---

# Directive From Prompt

When invoked, generate a directive at `/directives/<NNN>-<slug>.md` from `templates/directive.md`.

## Numbering rule

- List existing `/directives/`, find max NNN, increment by 1. Use `001` if empty.
- 3-digit zero-padded.

## Slug rule

- Kebab-case, ≤40 chars, derived from feature name.
- Strip stop words (the, a, of, for) for brevity.

## Sections to fill

- **Problem Statement** — 2-4 sentences, paraphrase the user's prompt.
- **Success Criteria** — 3-5 measurable outcomes.
- **Constraints** — stack defaults (Next.js, shadcn, Supabase, Vercel) + TDD.
- **Out of Scope** — explicit non-goals; pull from prompt if user said "don't ..."
- **Learned Patterns Applied** — read `/memory/learned/patterns.md`, include patterns with confidence ≥3.

## Authority

- POLICY 003 (Prompt Discipline)
- POLICY 010 (Continuous Learning)
