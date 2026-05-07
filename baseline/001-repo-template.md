# BASELINE 001 — Project Repository Template

**Status**: Reference Baseline
**Version**: 1.0
**Effective Date**: 2026-01-23
**Authority**: Informational (not prescriptive)

---

## Purpose

This baseline defines the **canonical repository structure** for projects operating under Vibe Coding OS. It serves as a reference template for validation and structural integrity checking.

---

## Scope

This baseline:
- ✅ Defines the required folder structure
- ✅ Specifies file placement conventions
- ✅ Documents structural expectations
- ❌ Does NOT grant execution authority
- ❌ Does NOT override policies
- ❌ Does NOT contain executable logic

**Baseline is informational reference material.**

---

## Canonical Repository Structure

```
project-root/
│
├── baseline/                 # Static reference knowledge
│   ├── README.md            # Folder purpose and rules
│   └── 001-repo-template.md # This file
│
├── directives/              # Human-authored task definitions
│   └── README.md           # Folder purpose and rules
│
├── memory/                  # Persistent state and decisions
│   └── README.md           # Folder purpose and rules
│
├── policy/                  # Immutable governance rules
│   ├── README.md           # Folder purpose and rules
│   ├── 001-structural-integrity.md
│   └── 002-execution-gating.md
│
├── orchestration/           # AI planning and reasoning
│   └── (task-based files created as needed)
│
├── execution/               # Feature implementations
│   └── (feature-name)/     # One folder per feature
│       └── (code files)
│
├── scripts/                 # Analysis and enforcement helpers
│   └── (utility scripts)
│
├── tests/                   # Verification and regression testing
│   └── (feature-name)/     # One folder per feature
│       └── (test files)
│
├── docs/                    # Project documentation
│   └── (documentation files)
│
├── CLAUDE.md               # Vibe Coding OS instructions (LOCKED)
├── README.md               # Project overview and getting started
└── .git/                   # Version control (standard Git)
```

---

## Required Files

### Root Level

**MUST exist:**
- `README.md` — Project overview, architecture, DOE process, baseline protection
- `CLAUDE.md` — Vibe Coding OS instructions (locked per Directive 0001)
- `.git/` — Version control directory

**SHOULD exist:**
- `.gitignore` — Standard Git ignore patterns
- `LICENSE` — Project license (if applicable)

### Folder READMEs

Each MCP folder **MUST** contain a `README.md` that defines:
- Folder purpose
- What belongs in this folder
- What must NOT be in this folder
- Authorship and update authority
- Version 1 constraints

---

## Folder Responsibility Matrix

| Folder | Responsibility | AI Write? | Human Write? | Executable? |
|--------|---------------|-----------|--------------|-------------|
| `/baseline` | Static reference | With auth | Yes | No |
| `/directives` | Task definitions | No | Exclusive | No |
| `/memory` | Persistent state | With auth | Yes | No |
| `/policy` | Governance rules | No | Exclusive | No |
| `/orchestration` | AI planning | Yes | Review | No |
| `/execution` | Implementation | Yes (gated) | Yes | Yes |
| `/scripts` | Helper tools | With auth | Yes | Yes |
| `/tests` | Verification | Yes (gated) | Yes | Yes |
| `/docs` | Documentation | Yes | Yes | No |

---

## File Naming Conventions

### Policy Files
```
/policy/NNN-short-name.md

Examples:
- 001-structural-integrity.md
- 002-execution-gating.md
- 003-security-constraints.md
```

### Baseline Files
```
/baseline/NNN-short-name.md

Examples:
- 001-repo-template.md
- 002-api-schema.md
- 003-data-models.md
```

### Directive Files
```
/directives/NNNN-feature-name.md

Examples:
- 0001-lock-claude-md-v1.md
- 0002-add-user-authentication.md
- 0003-implement-logging.md
```

### Orchestration Files
```
/orchestration/feature-name.md

Examples:
- user-authentication.md
- logging-system.md
- api-endpoints.md
```

### Execution Folders
```
/execution/feature-name/

Examples:
- /execution/user-authentication/
- /execution/logging-system/
- /execution/api-endpoints/
```

### Test Folders
```
/tests/feature-name/

Examples:
- /tests/user-authentication/
- /tests/logging-system/
- /tests/api-endpoints/
```

---

## README.md Required Content

The root `README.md` **MUST** include:

### 1. Problem Statement
- What does this project do?
- Why does it exist?
- What problem does it solve?

### 2. Architecture Overview
- MCP folder structure
- Responsibility model
- Technology stack (if applicable)

### 3. DOE Framework Explanation
- Four-gate process
- Directive → Orchestration → Execution → Verification
- Gate requirements

### 4. Feature Addition Process
- How to write a directive
- How orchestration works
- Where code goes
- Testing requirements

### 5. Baseline Protection Rules
- Baseline immutability
- Migration requirements
- Impact assessment process

### 6. Authority Order
- `policy > memory > directive > conversation`
- Conflict resolution

### 7. Non-Negotiable Rules
- Seven core rules from CLAUDE.md
- When to stop and ask

### 8. Version Control Practices
- Git usage
- Commit guidelines
- Branch strategy (if applicable)

### 9. Current Capabilities
- What's enabled in Version 1
- What's NOT enabled yet
- Future evolution path

---

## CLAUDE.md Immutability

**CLAUDE.md is LOCKED per Directive 0001.**

This file:
- Defines Vibe Coding OS operational rules
- Is immutable without explicit versioning
- Cannot be edited by AI
- Cannot be overridden by conversation
- Requires directive for any changes

**Validation check:**
- File exists at root: `CLAUDE.md`
- Contains Version 1 (Foundation) designation
- Locked by Directive 0001

---

## Baseline Validation Criteria

A repository is **baseline-compliant** if:

### Structure Validation
✅ All required folders exist
✅ No unauthorized top-level folders
✅ Each folder contains `README.md`
✅ Folder responsibilities are clear

### File Validation
✅ Root `README.md` exists and is complete
✅ `CLAUDE.md` exists and is locked
✅ Policy files exist (001, 002 minimum)
✅ Baseline files exist (001 minimum)

### Content Validation
✅ README includes all required sections
✅ Policy files are complete and enforceable
✅ Baseline files provide reference value
✅ No code in non-execution folders

### Authority Validation
✅ Policy files are human-authored
✅ Directive files are human-authored
✅ Orchestration follows directives
✅ Execution follows orchestration

---

## Baseline Immutability Rules

### What "Immutable" Means

Baseline files are **reference templates** that should not change frequently.

**Immutable does NOT mean:**
- Can never be updated
- Frozen permanently
- No evolution allowed

**Immutable DOES mean:**
- Changes require deliberate process
- No casual edits
- Migration planning required
- Impact assessment mandatory

### When Baseline May Change

Baseline **MAY** be updated when:
1. A directive explicitly authorizes the change
2. A migration document is created
3. Impact on existing features is assessed
4. The change is documented in `/memory`
5. Tests confirm no regression

### Baseline Change Process

1. **Create directive** — `/directives/NNNN-update-baseline.md`
2. **Document rationale** — Why is this change necessary?
3. **Assess impact** — What features might break?
4. **Create migration** — How to transition?
5. **Update baseline** — Make the actual changes
6. **Test features** — Verify nothing broke
7. **Document in memory** — Record the change and rationale

---

## Baseline vs. Execution

### Baseline Contains
- Templates for features
- Reference schemas
- Standard patterns
- Foundational knowledge
- Initial structure definitions

### Execution Contains
- Actual feature implementations
- Working code
- Feature-specific logic
- Live integrations
- Production artifacts

**Rule**: Never put feature code in `/baseline`.

**Pattern**: Copy template from `/baseline` → Implement in `/execution`.

---

## Structural Drift Prevention

**Drift** = Unauthorized structural changes that violate MCP model

### Common Drift Patterns

❌ Creating `/src` or `/lib` at root (use `/execution`)
❌ Creating `/temp` or `/scratch` (no ad-hoc folders)
❌ Putting code in `/scripts` (use `/execution`)
❌ Duplicating docs in multiple folders
❌ Creating parallel folder hierarchies
❌ Renaming MCP folders

### Drift Detection

Check for:
- Unauthorized top-level folders
- Code outside `/execution` or `/tests`
- Policies outside `/policy`
- Directives outside `/directives`
- Duplicate content across folders

### Drift Correction

1. Identify the drift
2. Classify severity (minor/major/critical)
3. Determine correct location
4. Move/reorganize as needed
5. Document the correction in `/memory`

---

## Validation Scripts (Future)

In future versions, `/scripts` may contain:

- `validate-structure.sh` — Check folder structure
- `validate-baseline.sh` — Verify baseline compliance
- `validate-gates.sh` — Check gate artifacts exist
- `detect-drift.sh` — Identify structural violations

**Version 1**: These scripts do not exist yet.

---

## Version Control Integration

### Git Practices

**All MCP folders are version-controlled:**
- `/baseline` — Tracked, infrequent changes
- `/directives` — Tracked, human commits
- `/memory` — Tracked, human commits (AI-assisted)
- `/policy` — Tracked, human commits only
- `/orchestration` — Tracked, AI commits (human review)
- `/execution` — Tracked, AI commits (under gate control)
- `/scripts` — Tracked, mixed authorship
- `/tests` — Tracked, AI commits (under gate control)
- `/docs` — Tracked, mixed authorship

### Git Ignore Patterns

**SHOULD ignore:**
- Build artifacts
- Dependency folders (`node_modules`, `venv`, etc.)
- IDE settings (`.vscode`, `.idea`)
- OS files (`.DS_Store`, `Thumbs.db`)
- Environment files (`.env`, `.env.local`)

**SHOULD NOT ignore:**
- Any MCP folder
- `CLAUDE.md`
- Policy or directive files
- Baseline or memory files

---

## Compliance Checking

### Manual Validation

A human or AI can validate compliance by checking:

1. **Structure**
   ```bash
   ls -la | grep -E "^d"
   # Should show all required folders
   ```

2. **Required Files**
   ```bash
   test -f README.md && test -f CLAUDE.md && echo "OK"
   ```

3. **Policy Files**
   ```bash
   ls policy/*.md
   # Should include 001, 002 at minimum
   ```

4. **Baseline Files**
   ```bash
   ls baseline/*.md
   # Should include 001 at minimum
   ```

### Automated Validation (Future)

Future validation scripts will:
- Run on commit hooks
- Block non-compliant commits
- Generate compliance reports
- Enforce naming conventions

**Version 1**: Manual validation only.

---

## Authority and Usage

### This Baseline is Reference Material

**This baseline:**
- ✅ Informs structural decisions
- ✅ Provides template patterns
- ✅ Defines validation criteria
- ❌ Does NOT override policy
- ❌ Does NOT grant permissions
- ❌ Does NOT execute anything

### Authority Hierarchy

```
policy > memory > directive > conversation
         ^
         |
      baseline provides context but does not command
```

**Baseline informs but does not prescribe.**

---

## Evolution and Versioning

### This is Version 1.0

As the system evolves, this baseline may be updated to:
- Add new folder requirements
- Refine naming conventions
- Include automation patterns
- Define advanced structures

### Version History

- **v1.0** (2026-01-23) — Initial canonical template

---

## Related Documents

- **POLICY 001** — Structural Integrity (enforcement)
- **POLICY 002** — Execution Gating (process control)
- **CLAUDE.md** — Vibe Coding OS instructions
- **Directive 0001** — Lock CLAUDE.md v1
- **README.md** — Project overview

---

## Compliance Summary

A baseline-compliant repository:
- Has all required folders
- Has complete README and CLAUDE.md
- Has enforceable policies
- Has reference baselines
- Follows MCP responsibility model
- Maintains structural integrity
- Enforces authority hierarchy
- Prevents drift

**This template defines what "correct" looks like.**

**END OF BASELINE 001**
