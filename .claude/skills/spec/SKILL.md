---
name: spec
description: >
  Spec-driven development workflow for Lorecraft. Runs the full
  Requirements → Design → Tasks pipeline for a sprint. Use when starting
  a new sprint or feature. Invoke with /spec <sprint-id> <title>.
  Example: /spec sprint-01 "CLI foundation and vault reader"
argument-hint: <sprint-id> <title>
disable-model-invocation: true
allowed-tools: Read, Write, Bash(mkdir *), Bash(ls *), Bash(cat *)
effort: high
---

# Lorecraft Spec Workflow

You are running the spec workflow for sprint **$ARGUMENTS**.

This workflow produces three documents for the sprint, one phase at a
time. You must complete each phase and get explicit approval before
moving to the next. Never generate all three documents in one go.

Read the project context before starting:
- Architecture decisions: docs/architecture/decisions.md
- Product detail requirement (read only if sprint scope is unclear): docs/vision/lorecraft-prfaq.md
- CLAUDE.md (already loaded)

Read the three output templates now so you know what you are producing:
- Requirements template: .claude/skills/spec/requirements.md
- Design template:       .claude/skills/spec/design.md
- Tasks template:        .claude/skills/spec/tasks.md

---

## Setup

Parse $ARGUMENTS:
- First token = sprint ID (e.g. `sprint-01`)
- Remaining tokens = sprint title (e.g. `CLI foundation and vault reader`)

Create the sprint directory if it does not exist:
```
docs/sprints/<sprint-id>/
```

Check if any of the three output files already exist. If they do,
tell the user which exist and ask whether to overwrite or abort
before proceeding.

---

## Phase 1 — Requirements

**Goal:** Produce `docs/sprints/<sprint-id>/requirements.md`.

First, read any existing sprint overview if present:
`docs/sprints/overview.md`

Then, produce the requirements document using the
template at `.claude/skills/spec/requirements.md`. Express every
in-scope capability as a user story in the **User stories** section.
Fill every section. Do not leave placeholder text.

Do not make asusmptions. If something isn't clear from the sprint
overiew, first check the prfaq document. If still unclear, make a proposal
to the user and get his feedback.

Write the file to `docs/sprints/<sprint-id>/requirements.md`.

Then ask:
> "Requirements written to docs/sprints/<sprint-id>/requirements.md.
> Please review and edit the file directly if needed.
> Type 'approved' to proceed to design, or tell me what to change."

**Wait for explicit approval before proceeding.**

---

## Phase 2 — Design

**Goal:** Produce `docs/sprints/<sprint-id>/design.md`.

Re-read the approved requirements:
`docs/sprints/<sprint-id>/requirements.md`

Then explore the codebase for relevant context:
- What already exists in `src/` that this sprint builds on or touches?
- Which ADRs are directly relevant? (Read them.)
- Are there module boundaries in CLAUDE.md that constrain the design?

Produce the design document using the template at
`.claude/skills/spec/design.md`. Fill every section. For every
significant design decision, state the alternatives considered and why
you chose this one. If a decision rises to ADR level, flag it
explicitly with `> **ADR candidate:**`.

Do not invent interfaces or module names that conflict with the
existing structure in `src/` or with the ADRs.

Write the file to `docs/sprints/<sprint-id>/design.md`.

Then ask:
> "Design written to docs/sprints/<sprint-id>/design.md.
> Please review and edit the file directly if needed.
> Type 'approved' to proceed to tasks, or tell me what to change."

**Wait for explicit approval before proceeding.**

---

## Phase 3 — Tasks

**Goal:** Produce `docs/sprints/<sprint-id>/tasks.md`.

Re-read the approved design:
`docs/sprints/<sprint-id>/design.md`

Decompose the design into a checklist of atomic tasks. Rules:

- Each task must be completable in a single Claude Code session
  (roughly: one logical unit of work, one commit)
- Tasks must be ordered by dependency — you cannot check off a task
  that depends on an unchecked task above it
- Each task must reference the specific file(s) it creates or modifies
- Test tasks are not optional — every implementation task that creates
  logic must have a paired test task immediately after it
- The final task in every sprint is always:
  `[ ] Update docs/sprints/overview.md to mark sprint complete`

Produce the tasks document using the template at
@.claude/skills/spec/tasks.md. Fill every section.

Write the file to `docs/sprints/<sprint-id>/tasks.md`.

Update `docs/sprints/overview.md` (create it if absent) to add this
sprint with status `In Progress`.

Then say:
> "Tasks written to docs/sprints/<sprint-id>/tasks.md.
> Sprint overview updated at docs/sprints/overview.md.
>
> Spec complete. To start coding, open a new session and work through
> tasks.md one checkbox at a time using plan mode.
> Commit after each completed task."
