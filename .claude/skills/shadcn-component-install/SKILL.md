---
name: shadcn-component-install
description: Use this skill when adding a shadcn/ui component to the codebase. Searches the registry, installs via npx shadcn add, and prefers composition over forking.
---

# shadcn Component Install

When invoked, follow these steps:

1. Confirm the component is in the official shadcn registry (use the shadcn MCP if available; else `npx shadcn@latest view <name>`).
2. Install with: `npx shadcn@latest add <component>` — this writes to `src/components/ui/`.
3. Re-read the file after install. Adjust imports if the project uses a non-default path alias.
4. If the design needs a variant, **compose** (wrap and forward props) rather than forking the primitive. Forks become stale.
5. Add an import to the consumer file. Run `npm run build` to confirm types.

## Anti-patterns

- Copy-pasting component source instead of using the CLI (drifts from updates)
- Modifying files in `src/components/ui/` directly without a directive (treat as vendored)
- Installing a component that already exists in the project — check first
- Adding a component "just in case" without a consuming feature

## Authority

- BASELINE 001 (Repo Template) — UI conventions
- POLICY 011 (Token Optimization) — composition reduces re-explanation cost
