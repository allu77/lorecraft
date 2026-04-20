# Tasks — mvp-sprint-04: CLI & Full Integration

> **Status:** Complete
> **Sprint:** mvp-sprint-04
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/mvp-sprint-04/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-04-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [x] 001 — Verify CI passes on the current codebase as the sprint baseline
  (`docs/sprints/mvp-sprint-04/`)
  - Run `pnpm typecheck && pnpm test`; all checks must be green before coding starts

### Core implementation

- [x] 002 — Extend `src/agent/generation-loop.ts` with multi-turn support
  (`src/agent/generation-loop.ts`)
  - Add `ConversationContext` type: `{ system: string; messages: CoreMessage[] }`
  - Add `conversation: ConversationContext` field to `GenerateResult` (additive — no existing callers break)
  - In `generateContent`: after collecting `content`, build the initial `messages` array (`user` prompt + `assistant` content) and include in the returned `GenerateResult`
  - Add `ContinueOptions` type (see design interfaces)
  - Add `continueContent(options: ContinueOptions): Promise<GenerateResult>` — skips vault I/O, calls `streamText({ model, system: conversation.system, messages: [..., userMessage] })`, returns updated conversation

- [x] 003 — [test] Update `generation-loop.integration.test.ts` for the new `conversation` field
  (`src/__tests__/generation-loop.integration.test.ts`)
  - The existing snapshot will be stale — run `pnpm test -u` to regenerate after reviewing the diff
  - Add assertions: happy-path result has `conversation.system` (non-empty string) and `conversation.messages` (2 entries: user + assistant)
  - Add test: `continueContent` with the happy-path result's conversation; assert the returned `conversation.messages` has 4 entries and `content` is the mock response

### Core implementation (continued)

- [x] 004 — Create `src/cli/index.ts` — command parser, `processCommand`, `main`
  (`src/cli/index.ts`)
  - Export `CliDeps` type and `processCommand(line, state, deps?)` function (see design interfaces)
  - Export `main(): Promise<void>` — readline REPL using `node:readline`; reads `VAULT_ROOT` from env
  - Implement `parseGenerateCommand(line: string)` — returns `{ type: string; inputs: Record<string, string> }` from a `/generate` argument string; handles quoted values (`name:"Mira Shadowcloak"`)
  - `processCommand` dispatches:
    - `/generate <type> [key:value…]` → calls `generateContent`, stores returned `conversation` in state
    - free-form (no `/` prefix) with active state → calls `continueContent`, updates state
    - free-form with `null` state → prints hint
    - `/help` → prints command summary
    - `/exit` → prints goodbye (caller is responsible for terminating)
    - unknown `/` command → prints error hint
  - Output formatting: print a fixed delimiter before and after streamed content; print token report after each generation or continuation
  - File must have a `if (process.argv[1] === fileURLToPath(import.meta.url))` guard so `main()` only runs when the file is executed directly (not imported in tests)

### Tests

- [x] 005 — [test] Unit tests for `parseGenerateCommand`
  (`src/cli/index.test.ts`)
  - Simple type + no inputs: `npc` → `{ type: 'npc', inputs: {} }`
  - Type + simple inputs: `npc name:Mira role:Spy` → `{ type: 'npc', inputs: { name: 'Mira', role: 'Spy' } }`
  - Quoted values: `npc name:"Mira Shadowcloak" faction:"Thieves Guild"` → values preserve spaces
  - Mixed quoted/unquoted
  - Extra whitespace is handled gracefully

- [x] 006 — [test] CLI integration tests for `processCommand`
  (`src/__tests__/cli.integration.test.ts`)
  - Inject `MockLanguageModelV3` and fixture vault via `deps`; capture output via a test WriteStream
  - **`/generate` happy path** — returned state is non-null; output contains streamed mock content; output contains `Tokens:` line
  - **Continuation turn** — pass `/generate` result state; send free-form text; returned state has 4 messages; output contains second mock response
  - **`/generate` resets state** — issue a second `/generate`; returned conversation has 2 messages (not 4+)
  - **Free-form with no active conversation** — state stays `null`; output contains hint
  - **Unknown slash command** — state unchanged; output contains error hint
  - **Template not found** — `type` maps to nonexistent template; output contains error; state stays `null`

### Documentation and wrap-up

- [x] 007 — Confirm no fixture vault changes needed; verify tests pass without adding notes
  (`src/__tests__/fixtures/test-vault/`)

- [x] 008 — Update `docs/architecture/decisions.md` — no new ADRs were flagged during design; confirm this after implementation
  (`docs/architecture/decisions.md`)

- [x] 009 — Update `docs/sprints/overview.md` to mark sprint complete
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
- [x] NNN — Description (discovered: YYYY-MM-DD)
-->
