# PRD Documentation

This directory stores Product Requirements Documents (PRDs) for ReelForge features.

## Purpose

PRDs persist implementation decisions and provide context for:
- Future Claude Code sessions (understand "why we built it this way")
- User reference (refresh memory on goals and acceptance criteria)
- Sub-agent validation (check if implementation matches requirements)

## Naming Convention

`prd-[feature-name].md`

Examples:
- `prd-smart-gen-timestamp-fix.md`
- `prd-multi-track-timeline.md`
- `prd-mobile-touch-editing.md`

## When to Create a PRD

Use the Deep Research Workflow (CLAUDE.md) when:
- Complex problems with unknown root cause
- Multiple solution approaches exist
- Need domain understanding before design
- High stakes architectural decisions

See [CLAUDE.md](../../CLAUDE.md) section "Deep Research Workflow" for the 4-stage process.

## PRD Template

See example in [CLAUDE.md](../../CLAUDE.md) under "Stage 3: PRD Creation"

Key sections:
1. Problem Statement
2. Goals (measurable)
3. Non-Goals (scope control)
4. User Stories
5. Technical Approach
6. Implementation Steps
7. Acceptance Criteria
8. Risks & Mitigations
9. Open Questions

## Versioning

PRDs are versioned with git. Include PRD filename in commit messages:

```bash
# Initial PRD
git add .claude/docs/prd-feature-name.md
git commit -m "Add PRD for [feature description]"

# After implementation
git commit -m "Implement [feature] (per PRD prd-feature-name.md)"

# Scope changes
git commit -m "Update PRD: [what changed and why]"
```
