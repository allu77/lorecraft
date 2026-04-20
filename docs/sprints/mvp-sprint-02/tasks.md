# Tasks — mvp-sprint-02: Context Assembly

> **Status:** Complete
> **Sprint:** mvp-sprint-02
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/mvp-sprint-02/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-02-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [x] 001 — Verify CI is green before starting (`pnpm typecheck && pnpm test`)

### Core implementation

- [x] 002 — Implement `ContextBudget` class: token tracking, ceiling enforcement, env var default
  (`src/agent/context-budget.ts`)
- [x] 003 — [test] Unit tests for `ContextBudget`
  (`src/agent/context-budget.test.ts`)
  - `remaining` initialises correctly; `fits()` is non-mutating; `add()` reduces remaining; `add()` throws on overflow; env var default; throws when no ceiling available

- [x] 004 — Implement `buildPrompt`: system prompt constant, section assembly, optional section omission
  (`src/agent/prompt-builder.ts`)
  - Exports `ContextNote`, `BuildPromptArgs`, `BuiltPrompt` types and `buildPrompt` function
  - Sections: base prose → Campaign Style → Your Task (omit if empty) → Output Template → Relevant Notes (omit if empty)

- [x] 005 — [test] Unit tests for `buildPrompt`
  (`src/agent/prompt-builder.test.ts`)
  - Full args produce correct section order; empty `templateInstructions` omits "Your Task"; empty `contextNotes` omits "Relevant Notes"; `templateBody` always present; multiple notes each get `###` header; `userInputs` appear in `prompt`

### Integration

- [x] 006 — Integration test: assemble prompt from real fixture vault and snapshot
  (`src/__tests__/agent-vault.integration.test.ts`)
  - Use `VaultReader` + `TemplateParser` against `src/__tests__/fixtures/test-vault/`
  - Inputs: `Campaign Style.md`, `_templates/npc.md`, `Thieves Guild.md`, `Mira Shadowcloak.md`
  - `ContextBudget` with fixed 8 000-token ceiling
  - Assert `buildPrompt(...)` result with `toMatchSnapshot()`
  - Commit the generated `.snap` file alongside the test

### Documentation and wrap-up

- [x] 007 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

<!--
| Task | Blocked by | Since |
|---|---|---|
-->

---

## Discovered during sprint

<!--
- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
