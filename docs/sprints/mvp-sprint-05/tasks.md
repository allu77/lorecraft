# Tasks — mvp-sprint-05: WikiLink Resolution Agentic Tool

> **Status:** In progress
> **Sprint:** mvp-sprint-05
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read docs/sprints/mvp-sprint-05/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-05-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

<!-- Tasks are ordered by dependency. Do not reorder without reviewing
dependencies. Paired test tasks immediately follow their implementation
task. -->

### Setup

- [ ] 001 — Verify clean baseline: `pnpm typecheck && pnpm test` passes on
  `main` with no changes
  (`src/`)

### Core implementation

- [ ] 002 — Create `src/agent/tools.ts`: export `WikilinkToolFound`,
  `WikilinkToolNotFound`, `WikilinkToolResult` types and `createWikilinkTool`
  factory function. Tool resolves wikilinks via `VaultReader`, handles section
  fallback (catch + retry without section), gates content on `ContextBudget`,
  returns structured `WikilinkToolResult`.
  (`src/agent/tools.ts`)

- [ ] 003 [test] — Create `src/agent/tools.test.ts`: unit tests for all five
  `createWikilinkTool` execute paths using mocked `VaultReader` and
  `ContextBudget`: (a) note found, no section; (b) note found, section found;
  (c) note found, section missing → falls back to full note; (d) note not found;
  (e) note found, budget exhausted.
  (`src/agent/tools.test.ts`)

- [ ] 004 — Refactor `src/agent/generation-loop.ts` to export
  `GenerationSession` class with `static async create(options)`, `async
  generate(onChunk?)`, and `async continue(userMessage, onChunk?)`. Wire
  `createWikilinkTool` into the `ToolLoopAgent` in `create()`. Remove
  `generateContent`, `continueContent`, `ConversationContext`, and
  `ContinueOptions`. Update `GenerateResult` to drop the `conversation` field.
  (`src/agent/generation-loop.ts`)
  - `GenerateOptions` is unchanged except `onChunk` moves to `generate()` /
    `continue()` call sites
  - Verify how `ToolLoopAgent.stream()` exposes cumulative token usage and wire
    it up correctly (check `node_modules/ai/dist/index.d.ts` if unsure)

- [ ] 005 [test] — Update `src/__tests__/agent-vault.integration.test.ts`: add
  a test for `GenerationSession` that creates a session against the fixture
  vault, uses a `MockLanguageModelV3` configured to emit one `wikilink_resolve`
  tool call followed by a text response, and asserts that `result.content`
  contains the mocked text and `result.usage.totalTokens > 0`.
  (`src/__tests__/agent-vault.integration.test.ts`)

### Integration

- [ ] 006 — Update `src/cli/index.ts` to use `GenerationSession`: replace
  `ConversationContext | null` state with `GenerationSession | null`; replace
  `generateContent` / `continueContent` calls with `session.generate()` /
  `session.continue()`; remove the `ConversationContext` import.
  (`src/cli/index.ts`)

- [ ] 007 [test] — Update `src/__tests__/cli.integration.test.ts`: remove the
  `ConversationContext` import; update the two assertions that check
  `(state as ConversationContext).messages.length` — replace with observable
  behaviour assertions (content present, session non-null, second `/generate`
  resets the session). Keep all other assertions unchanged.
  (`src/__tests__/cli.integration.test.ts`)

### Documentation and wrap-up

- [ ] 008 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

<!--
| Task | Blocked by | Since |
|---|---|---|
-->

---

## Discovered during sprint

<!-- Bugs found, scope changes, or new tasks that emerged during coding. -->
