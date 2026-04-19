# Tasks — {{sprint-id}}: {{title}}

> **Status:** Not started | In progress | Complete
> **Sprint:** {{sprint-id}}
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/{{sprint-id}}/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "{{sprint-id}}-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

<!-- Tasks are ordered by dependency. Do not reorder without reviewing
dependencies. Paired test tasks immediately follow their implementation
task. Format:

- [ ] NNN — Description (`path/to/file.ts`)
  - Note or sub-step if needed

Implementation tasks are unmarked. Test tasks are marked with [test].
-->

### Setup

- [ ] 001 — Create sprint directory structure and verify CI passes
  (`docs/sprints/{{sprint-id}}/`)

### Core implementation

<!-- Generated from design.md — one task per logical unit of work -->

### Tests

<!-- Test tasks paired to implementation tasks above.
Each [test] task references the implementation task it covers. -->

### Integration

<!-- Tasks that wire modules together or run end-to-end scenarios -->

### Documentation and wrap-up

- [ ] NNN — Update fixture vault if new note types were introduced
  (`src/__tests__/fixtures/test-vault/`)
- [ ] NNN — Update `docs/architecture/decisions.md` with any new ADRs
  flagged during design (`docs/architecture/decisions.md`)
- [ ] NNN — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

<!-- Tasks that cannot proceed due to an unresolved question or
external dependency. Move tasks here if they become blocked during
the sprint.

| Task | Blocked by | Since |
|---|---|---|
| | | |
-->

---

## Discovered during sprint

<!-- Bugs found, scope changes, or new tasks that emerged during
coding that were not in the original plan. Log them here rather
than adding ad-hoc checkboxes above, so the original plan stays
readable.

- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
