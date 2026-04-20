# Tasks — mvp-sprint-03: Generation Loop

> **Status:** Not started
> **Sprint:** mvp-sprint-03
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/mvp-sprint-03/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-03-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [ ] 001 — Verify CI passes on the current codebase as the sprint baseline
  (`docs/sprints/mvp-sprint-03/`)
  - Run `pnpm typecheck && pnpm test`; all checks must be green before coding starts

### Core implementation

- [ ] 002 — Create `src/llm/provider.ts` — `getModel()` wrapping `@ai-sdk/amazon-bedrock`
  (`src/llm/provider.ts`)
  - Read `MODEL_ID` and region from env vars; instantiate the Bedrock model
  - Return a Vercel AI SDK `LanguageModel`; no provider-specific types in the return type
  - Confirm which package exports `MockLanguageModelV1` for use in task 004 (check `ai` or `@ai-sdk/mock`)

- [ ] 003 — Create `src/agent/generation-loop.ts` — exported types and full `generateContent` implementation
  (`src/agent/generation-loop.ts`)
  - Export: `TokenUsage`, `GenerateOptions` (with optional `model` field for test injection), `GenerateResult`
  - Export: `generateContent(options: GenerateOptions): Promise<GenerateResult>`
  - Follow the sequence in `design.md` exactly:
    1. Read and parse template
    2. Validate required inputs — throw with missing names if any absent
    3. Find and read "Campaign Style" note (soft fail if absent)
    4. Init `ContextBudget`; add campaign style tokens
    5. Gather context notes from `[[wikilinks]]` in `bodyMarkdown` + input values as note refs; deduplicate by resolved path; respect budget
    6. Call `buildPrompt`; call `streamText`; forward chunks to `onChunk?`
    7. Return `{ content, usage }`

### Tests

- [ ] 004 — [test] Integration test for `generateContent` against fixture vault
  (`src/__tests__/generation-loop.integration.test.ts`)
  - Mock LLM via `MockLanguageModelV1` injected through `options.model`
  - **Happy path:** provide `name` and `role`; assert `content` is a non-empty string; assert `usage` has numeric `promptTokens`, `completionTokens`, `totalTokens`; assert `onChunk` was called at least once
  - **Context notes gathered:** provide `faction: "Thieves Guild"`; assert the mock model received a system prompt containing "Thieves Guild" note content
  - **Missing required input:** omit `name` (required); assert the function throws with an error message containing "name"
  - **Budget overflow:** pass `ContextBudget`-equivalent limit by constructing a tiny budget via env or by setting a very small token limit; assert the call succeeds (notes skipped, no crash)
  - Run snapshot test on the assembled prompt shape for the happy-path case (`toMatchSnapshot`)

### Documentation and wrap-up

- [ ] 005 — Confirm no fixture vault changes are needed; update `src/__tests__/fixtures/test-vault/` if any new note types were introduced
  (`src/__tests__/fixtures/test-vault/`)
  - Based on design: no new notes required; verify tests pass without changes

- [ ] 006 — Update `docs/architecture/decisions.md` if any ADR candidates were flagged during implementation
  (`docs/architecture/decisions.md`)
  - Design flagged no new ADRs; confirm this holds after implementation

- [ ] 007 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

<!--
| Task | Blocked by | Since |
|---|---|---|
| | | |
-->

---

## Discovered during sprint

<!--
- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
