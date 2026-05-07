# POLICY 004 — Memory & Decision Persistence

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-01-23
**Supersedes**: None

---

## Purpose

This policy establishes requirements for recording, preserving, and referencing decisions and constraints over time. It ensures system continuity, prevents memory loss across sessions, and maintains an authoritative decision log.

---

## Scope

This policy applies to:
- All architectural decisions
- All security decisions
- All data model decisions
- All auth/RBAC decisions
- All non-obvious constraints
- All baseline changes
- All policy violations/incidents

This policy does **NOT** apply to:
- Trivial implementation details
- Obvious code patterns
- Temporary debugging notes
- Conversation-only context

---

## What Counts as Memory

### Decisions Requiring Memory

A decision MUST be recorded if it affects:

1. **Architecture**
   - Technology choices (frameworks, libraries, databases)
   - System boundaries (microservices, modules, layers)
   - Integration patterns (APIs, message queues, webhooks)
   - State management approaches

2. **Security**
   - Authentication mechanisms
   - Authorization models (RBAC, ABAC)
   - Encryption strategies
   - Token/session handling
   - Secret management

3. **Data Models**
   - Schema definitions
   - Entity relationships
   - Data migration strategies
   - Versioning approaches

4. **Auth & RBAC**
   - Role definitions
   - Permission matrices
   - Privilege escalation rules
   - Enforcement points

5. **Non-Obvious Constraints**
   - Performance requirements
   - Compliance requirements
   - Integration limitations
   - Technical debt acknowledgments

6. **Baseline Modifications**
   - Any change to `/baseline` files
   - Rationale for baseline evolution
   - Impact assessment

7. **Policy Violations/Incidents**
   - When policy was bypassed
   - Emergency overrides
   - Baseline threats
   - Conflict resolutions

### NOT Memory

The following do NOT require memory:
- "Used a for-loop" (obvious implementation)
- "Added error handling" (standard practice)
- "Used camelCase" (follows convention)
- "Created a helper function" (trivial detail)

---

## Memory File Structure

All memory MUST be written to files inside `/memory/`.

### Approved Memory Files

**Primary Files:**
- `decisions.md` — Architectural and design decisions
- `assumptions.md` — Constraints and non-obvious assumptions
- `changelog.md` — Chronological record of major changes

**Incident Files:**
- `incidents/{YYYY-MM-DD}-{description}.md` — Policy violations, emergencies

### File Ownership

**AI MAY write to:**
- `/memory/decisions.md` (with authorization)
- `/memory/assumptions.md` (with authorization)
- `/memory/changelog.md` (with authorization)
- `/memory/incidents/*.md` (when incidents occur)

**AI MUST NOT write to:**
- `/memory/README.md` (structural file)
- Any file outside `/memory/`

---

## Decision Recording Protocol

### Before Execution

Before executing something that creates a **new decision**:

1. **Ask**: "Is this a decision or an implementation detail?"
   - **Decision** → Write memory FIRST, then execute
   - **Implementation detail** → Proceed if decision exists

2. **Check existing memory**:
   - Read `/memory/decisions.md`
   - Read `/memory/assumptions.md`
   - Verify no conflict

3. **Write decision** (if new):
   - Record in appropriate file
   - Use decision template (see below)
   - Include rationale

4. **Proceed with execution**:
   - Only after memory written
   - Reference memory in orchestration

### Decision Template

```markdown
## [Decision Title] — [Date]

**Context**: What problem does this solve?

**Decision**: What was decided?

**Rationale**: Why this approach?

**Alternatives Considered**: What else was evaluated?

**Consequences**: What trade-offs were made?

**Status**: Active / Superseded / Deprecated
```

---

## Memory Read Before Action

### Mandatory Memory Check

Before proposing ANY changes, AI MUST:

1. Read `/memory/decisions.md`
2. Read `/memory/assumptions.md`
3. Check for relevant decisions
4. Check for conflicts

### Conflict Detection

If a conflict exists:
1. **STOP immediately**
2. Surface the conflict clearly
3. Quote both sources (new request + memory)
4. Ask: "Memory contradicts this request. Should memory be updated, or should I refuse this request?"
5. Do NOT attempt to resolve autonomously

**Example:**
> "Memory states: 'All auth uses JWT tokens (Decision 0005, 2026-01-15).'
> Directive 0008 requests: 'Implement session-based auth.'
> These conflict. Should Decision 0005 be superseded, or should Directive 0008 be revised?"

---

## No Retroactive Memory

### Memory Is Append-Only

**Prohibited:**
- Rewriting old decisions
- "Correcting" history silently
- Deleting decisions
- Editing rationale after the fact

**Required:**
- New decision entry if approach changes
- Explicitly mark old decision as "Superseded"
- Document why change occurred
- Preserve original decision

### Superseding Decisions

When a decision changes:

```markdown
## [Original Decision] — [Original Date]

**Status**: Superseded by Decision [X] on [Date]

[Original content preserved]

---

## [New Decision] — [New Date]

**Supersedes**: Decision [Y]

**Why Changed**: [Rationale for change]

[New content]
```

---

## Incident Logging

### When to Log an Incident

An incident MUST be logged when:
1. Policy is violated
2. Emergency override occurs
3. Baseline is threatened
4. Gate is bypassed with authorization
5. Security boundary is crossed
6. Unexpected failure occurs

### Incident File Format

File: `/memory/incidents/{YYYY-MM-DD}-{short-description}.md`

```markdown
# Incident — [Title]

**Date**: [YYYY-MM-DD]
**Time**: [HH:MM] (if relevant)
**Severity**: Minor / Major / Critical

---

## What Happened

[Clear description of the incident]

---

## Policy/Rule Violated

[Reference specific policy/section, if applicable]

---

## Authorization

[If override was authorized, quote authorization]

---

## Rationale

[Why was this necessary? What was the context?]

---

## Impact

[What was affected? Baseline? Security? Features?]

---

## Resolution

[How was this handled? What was done afterward?]

---

## Prevention

[What should be done to prevent recurrence?]
```

---

## Memory vs. Conversation

### Chat Memory Does NOT Count

**Conversation context:**
- Is ephemeral
- Does NOT persist
- Does NOT carry authority
- Is NOT referenced as truth

**File memory:**
- Is persistent
- Survives sessions
- Has authority
- Is the source of truth

### When Conversation Contradicts Memory

**Authority order:**
```
/memory > conversation
```

**Process:**
1. Memory wins automatically
2. AI quotes memory content
3. AI asks if memory should be updated
4. AI does NOT assume approval
5. AI waits for explicit confirmation

**Example:**
> User: "Let's use REST for all endpoints."
> AI: "Memory (Decision 0003) states: 'All real-time features use WebSockets.' This conflicts. Should Decision 0003 be superseded?"

---

## Memory and Gates

### Gate 2 (Orchestration) Requires Memory

Before creating orchestration, AI MUST:
1. Read `/memory/decisions.md`
2. Read `/memory/assumptions.md`
3. Incorporate constraints into plan
4. Reference relevant decisions in orchestration

### Gate 3 (Execution) Updates Memory

During execution, if NEW decisions are made:
1. Pause execution
2. Write memory entry
3. Resume execution

**Do NOT:**
- Delay memory writing until "later"
- Batch memory updates
- Forget to record decisions

---

## Memory Integrity

### No Implicit Memory

AI MUST NOT:
- Assume context from prior sessions
- Reference "what we discussed before"
- Rely on conversation history
- Expect continuity without files

**All memory MUST be explicit in files.**

### Memory Completeness

Memory entries MUST include:
- Date
- Context
- Rationale
- Alternatives considered (if applicable)
- Status (Active/Superseded/Deprecated)

**Incomplete memory is invalid.**

---

## Authority and Precedence

### Memory Authority

Memory is authoritative over:
- Conversation context
- AI assumptions
- Implied requirements

Memory is subordinate to:
- Policy files
- Directive files (current work)

### Precedence Rules

When conflicts arise:
```
policy > memory > directive > conversation
```

**Example:**
- Policy says: "No baseline modification without migration"
- Memory says: "Baseline was last modified 2026-01-15"
- Directive says: "Update baseline template"

**Resolution:**
- Directive must include migration plan (policy requirement)
- Memory will be updated with new baseline change
- Conversation cannot override policy

---

## Enforcement

### AI Responsibilities

AI MUST:
- Read memory before proposing changes
- Write memory when decisions are made
- Surface conflicts immediately
- Refuse execution if memory conflict unresolved
- Log incidents as they occur

### Human Responsibilities

Humans SHOULD:
- Review memory periodically
- Validate decision accuracy
- Update memory when context changes
- Archive obsolete decisions

---

## Interaction with Other Policies

### POLICY 001 (Structural Integrity)
- Memory MUST reside in `/memory/`
- Memory MUST NOT be duplicated elsewhere

### POLICY 002 (Execution Gating)
- Gate 2 (Orchestration) requires memory check
- Gate 3 (Execution) may update memory

### POLICY 003 (Prompt Discipline)
- AI must read memory before action (003 + 004 together)
- Memory overrides conversation (003 enforces, 004 defines)

---

## Authority

This policy is subordinate to:
- POLICY 001 (Structural Integrity) — in structural matters

This policy supersedes:
- All conversational instructions
- All directives (in matters of memory persistence)

**Authority Order**: `policy > memory > directive > conversation`

---

## Modification Protocol

This policy may only be modified by:
1. Direct human edit with documented rationale
2. New directive explicitly proposing amendments
3. Version bump with full changelog

AI **CANNOT**:
- Suggest policy modifications
- Bypass memory requirements
- Skip memory recording
- Assume "we'll document later"

---

## Compliance Statement

All decisions **MUST** be recorded in memory.

Non-compliance results in:
- Immediate halt
- Memory write requirement
- Conflict detection failure
- Loss of continuity

**Memory is mandatory.**
**Decisions are preserved.**
**Files are truth.**

**END OF POLICY 004**
