# Tasks — mvp-sprint-01: Vault Layer

> **Status:** Not started
> **Sprint:** mvp-sprint-01
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/mvp-sprint-01/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-01-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

Tasks are ordered by dependency. The fixture vault update (002) must come
before the template-parser tests (005), since the tests read `npc.md` from
disk. VaultReader (003–004) and TemplateParser (005–006) are otherwise
independent and could be worked in parallel sessions.

TDD discipline: test tasks (003, 005) are written before their paired
implementation tasks (004, 006). Tests are expected to fail (red) after
the test task and pass (green) after the implementation task.

### Setup

- [ ] 001 — Verify CI is green on the current scaffold
  - Run `pnpm typecheck && pnpm test` and confirm both pass before touching
    any vault code. This is the baseline.
  (`src/__tests__/setup.test.ts`)

### Fixture vault

- [ ] 002 — Update `npc.md` template to use the `== INPUTS ==` syntax defined
  in the design. Replace the existing free-form "Required inputs" list with
  the annotated-list format:
  ```
  == INPUTS ==
  - name (required): The NPC's full name
  - faction (optional): Wikilink to the faction this NPC belongs to
  - location (optional): Wikilink to the NPC's base location
  - role (required): Brief description of their function in the campaign
  ```
  (`src/__tests__/fixtures/test-vault/_templates/npc.md`)

### VaultReader — test first

- [ ] 003 — [test] Write `vault-reader.test.ts`. Tests must be complete and
  failing (red) at the end of this task — do not write any implementation.
  Cover all scenarios from the design test strategy:
  - `listNotes()`: returns exactly the 4 `.md` files in the fixture vault
  - `findNote()`: exact name match, case-insensitive match, null for missing
  - `readNote()`: full content read; section subtree extraction (`## Goals`
    from `Thieves Guild.md`); throws when section not found; throws on bad path
  - `parseWikilink()`: plain `[[Note]]`, `[[Note#Section]]`, `[[Note|Alt]]`,
    `[[Note#Section|Alt]]`, input without brackets
  - `resolveWikilink()`: resolves to correct path, case-insensitive,
    null for nonexistent note
  (`src/vault/vault-reader.test.ts`)

- [ ] 004 — Implement `VaultReader` in `vault-reader.ts`. All tests from 003
  must pass (green). Export `VaultReader` class and `WikilinkParts` type as
  defined in the design interfaces.
  (`src/vault/vault-reader.ts`)

### TemplateParser — test first

- [ ] 005 — [test] Write `template-parser.test.ts`. Tests must be complete and
  failing (red) at the end of this task — do not write any implementation.
  Cover all scenarios from the design test strategy:
  - Extracts `agentPrompt` prose (without `== INPUTS ==` block) from `npc.md`
  - Extracts `inputs` array with correct `name`, `required`, and `description`
    for each declared input in `npc.md`
  - `bodyMarkdown` retains structural Markdown; AGENT PROMPT block is absent;
    other `%% ... %%` comments are preserved
  - Template with no AGENT PROMPT block: empty `agentPrompt`, empty `inputs`,
    full content as `bodyMarkdown`
  - AGENT PROMPT block with no `== INPUTS ==` section: prose `agentPrompt`,
    empty `inputs`
  - Malformed (unclosed) AGENT PROMPT block: partial parse, does not throw
  (`src/vault/template-parser.test.ts`)

- [ ] 006 — Implement `TemplateParser` in `template-parser.ts`. All tests from
  005 must pass (green). Export `TemplateParser` class, `ParsedTemplate` type,
  and `TemplateInput` type as defined in the design interfaces.
  (`src/vault/template-parser.ts`)

### Documentation and wrap-up

- [ ] 007 — Remove `.gitkeep` from `src/vault/` now that the directory has
  real files. (`src/vault/.gitkeep`)

- [ ] 008 — Update `docs/sprints/overview.md` to mark sprint complete.
  (`docs/sprints/overview.md`)

---

## Blocked tasks

| Task | Blocked by | Since |
|---|---|---|
| | | |

---

## Discovered during sprint

<!-- Bugs found, scope changes, or new tasks that emerged during
coding that were not in the original plan. Log them here rather
than adding ad-hoc checkboxes above, so the original plan stays
readable.

- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
