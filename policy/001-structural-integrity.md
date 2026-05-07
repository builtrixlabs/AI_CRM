# POLICY 001 — Structural Integrity

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-01-23
**Supersedes**: None

---

## Purpose

This policy defines the mandatory folder structure, responsibility boundaries, and structural constraints that ensure system integrity and prevent architectural drift.

---

## Scope

This policy applies to:
- All repository modifications
- All AI orchestration activities
- All human contributions
- All automated processes (when enabled in future versions)

---

## Required Folder Structure

The following top-level folders **MUST** exist at all times:

```
/baseline       → Static reference knowledge, templates, schemas
/directives     → Human-authored task definitions and SOPs
/memory         → Persistent state, decisions, learned context
/policy         → Immutable governance rules and constraints
/orchestration  → AI reasoning, planning, task decomposition
/execution      → Feature implementations and code artifacts
/scripts        → Analysis and enforcement helpers
/tests          → Verification and regression testing
/docs           → Project documentation
/planning       → AI-generated specs, PRDs, architecture outlines
/design         → UI/UX structure, component maps, layout specs

```

### Structural Violations

The following are **PROHIBITED**:

❌ Creating new top-level folders without directive authorization
❌ Renaming existing MCP folders
❌ Deleting required folders
❌ Creating ad-hoc temporary folders at root level
❌ Mixing responsibilities across folders

---

## MCP Responsibility Model

Each folder has a **single, exclusive responsibility**:

### `/baseline`
**Responsibility**: Static reference knowledge
**Contains**: Templates, schemas, reference docs, foundational data
**Must NOT contain**: Dynamic state, executable code, policies, directives
**Authority**: Human-writable, AI-readable (write only with explicit authorization)

### `/directives`
**Responsibility**: Human intent and task definitions
**Contains**: Problem statements, success criteria, constraints, SOPs
**Must NOT contain**: AI plans, code, policies, memory
**Authority**: Human-exclusive authorship

### `/memory`
**Responsibility**: Persistent state and decisions
**Contains**: User preferences, conversation history, learned context, decisions
**Must NOT contain**: Policies, directives, code, static reference data
**Authority**: Human-writable, AI-readable (write only with explicit authorization)

### `/policy`
**Responsibility**: Immutable governance rules
**Contains**: Safety boundaries, constraints, compliance rules, authority models
**Must NOT contain**: Task instructions, state, code, reference data
**Authority**: Human-exclusive authorship, AI strictly read-only

### `/orchestration`
**Responsibility**: AI planning and reasoning
**Contains**: Task breakdowns, dependency analysis, risk assessments
**Must NOT contain**: Implementation code, directives, policies
**Authority**: AI-generated (with human oversight)

### `/execution`
**Responsibility**: Feature implementations
**Contains**: Source code, modules, feature artifacts
**Must NOT contain**: Policies, directives, baseline templates
**Authority**: AI-writable under gate control

### `/scripts`
**Responsibility**: Analysis and enforcement helpers
**Contains**: Validation scripts, analysis tools, enforcement helpers
**Must NOT contain**: Business logic, feature code, policies
**Authority**: Human-writable, AI-readable (write only with authorization)

### `/tests`
**Responsibility**: Verification and regression testing
**Contains**: Test cases, fixtures, test runners
**Must NOT contain**: Production code, policies, directives
**Authority**: AI-writable under gate control

### `/docs`
**Responsibility**: Project documentation
**Contains**: Architecture docs, user guides, API references
**Must NOT contain**: Policies (use `/policy`), directives (use `/directives`)
**Authority**: Human and AI (with oversight)

### `/planning`
**Responsibility**: AI-generated planning artifacts
**Contains**: PRDs, feature specs, architecture outlines, task breakdowns
**Must NOT contain**: Production code, policies, directives, dynamic state
**Authority**: AI-writable (via Planning MCP), human-readable

### `/design`
**Responsibility**: UI/UX planning artifacts
**Contains**: UI structure specs, component maps, layout flows, wireframes
**Must NOT contain**: Production code, business logic, backend artifacts
**Authority**: AI-writable (via UX/UI MCP), human-readable

---

## Enforcement Rules

### Rule 1: No Execution Code Outside `/execution`

All feature implementation code **MUST** reside in `/execution/{feature-name}/`

Violations:
- Placing business logic in `/scripts`
- Placing feature code in `/baseline`
- Placing implementation in root directory

### Rule 2: No Modification of `/baseline` Files

Baseline files are **immutable reference material**.

To change baseline:
1. A directive must authorize the change
2. A migration document must be created
3. Impact on existing features must be assessed
4. Change must be documented in `/memory`

### Rule 3: No Duplicate Sources of Truth

Each piece of information has **one authoritative location**.

Violations:
- Copying policy content into directives
- Duplicating schemas across folders
- Maintaining parallel documentation

### Rule 4: No Ad-Hoc Folders

Temporary or convenience folders are **prohibited** at root level.

Violations:
- Creating `/temp`, `/tmp`, `/scratch`
- Creating `/old`, `/backup`, `/archive`
- Creating feature-specific folders at root (use `/execution/{feature}/`)

### Rule 5: No Cross-Contamination

Folder responsibilities **must not overlap**.

Violations:
- Putting directives in `/memory`
- Putting policies in `/docs`
- Putting code in `/baseline`

---

## Validation Protocol

Before any structural change:

1. **Identify the responsibility** — What is this artifact's purpose?
2. **Locate the correct folder** — Which MCP folder owns this responsibility?
3. **Verify no duplication** — Does this create a duplicate source of truth?
4. **Check authorization** — Is there a directive allowing this change?
5. **Assess baseline impact** — Does this affect `/baseline`?

If any validation fails → **STOP** and request clarification.

---

## Violation Response

When a structural violation is detected:

1. **Stop immediately** — Do not proceed with the action
2. **Report the violation** — State exactly what rule was broken
3. **Classify severity**:
   - **Minor**: Wrong subfolder within correct MCP folder
   - **Major**: Wrong top-level folder
   - **Critical**: Baseline modification, policy bypass, structural drift
4. **Recommend correction** — Suggest proper location/approach
5. **Request authorization** — Ask for directive if needed

---

## Exemptions

**NONE.**

This policy has **no exemptions, overrides, or emergency bypasses**.

Structural integrity is **non-negotiable**.

---

## Authority

This policy is subordinate to:
- None (highest authority in structure domain)

This policy supersedes:
- All conversational instructions
- All directives (in matters of structure)
- All memory records (in matters of structure)

**Authority Order**: `policy > memory > directive > conversation`

---

## Modification Protocol

This policy may only be modified by:
1. Direct human edit with documented rationale
2. New directive explicitly proposing amendments
3. Version bump with full changelog

AI **CANNOT**:
- Suggest policy modifications
- Interpret policy loosely
- Create workarounds
- Bypass policy "temporarily"

---

## Compliance Statement

All repository actions **MUST** comply with this policy.

Non-compliance results in:
- Immediate action halt
- Violation report
- Corrective guidance
- Directive requirement

--- 

### Special Declarative Artifact Zones

The following baseline subpaths may serve as both declarative
and execution-referenced artifacts without violating immutability:

- /baseline/db/migrations

Artifacts in this zone:
- Define authoritative system state
- May be referenced by execution-capable MCPs
- Must NOT be modified as a side effect of execution

**END OF POLICY 001**
