# Design — mvp-sprint-05: WikiLink Resolution Agentic Tool

> **Status:** Draft
> **Sprint:** mvp-sprint-05
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint adds a Vercel AI SDK `tool()` that the LLM can call during
content generation to look up vault notes on demand. The tool wraps the
existing `VaultReader.resolveWikilink()` and `readNote()` methods behind a
typed, budget-gated interface.

`generation-loop.ts` is refactored into a **`GenerationSession` class**. A
`/generate` command creates a new instance — which runs the vault pipeline,
assembles the system prompt, and instantiates a `ToolLoopAgent`. The CLI then
sends the first user message to the session and streams the response.
Subsequent refinement commands are sent to the same session as additional user
messages, and the `ToolLoopAgent` instance is reused across all turns. The
two-function model (`generateContent` / `continueContent`) and the
`ConversationContext` pass-through type are removed entirely.

No new vault-layer code is required — all new logic lives in `src/agent/`.

---

## Module map

```
src/
├── agent/
│   ├── tools.ts                        (new) wikilink_resolve tool factory
│   ├── tools.test.ts                   (new) unit tests for tool factory
│   ├── generation-loop.ts              (refactored) GenerationSession class;
│   │                                   removes generateContent, continueContent,
│   │                                   ConversationContext, ContinueOptions
│   ├── context-budget.ts               (unchanged)
│   └── prompt-builder.ts               (unchanged)
├── vault/
│   └── vault-reader.ts                 (unchanged)
├── cli/
│   └── index.ts                        (modified) use GenerationSession
└── __tests__/
    └── agent-vault.integration.test.ts  (modified) add tool call scenario
```

Fixture vault (`src/__tests__/fixtures/test-vault/`) is unchanged — the
existing `Thieves Guild.md` and `Mira Shadowcloak.md` notes are sufficient
for all new integration scenarios.

---

## Interfaces and data types

```typescript
// src/agent/tools.ts

import { tool } from 'ai';
import type { Tool } from 'ai';
import { z } from 'zod';
import type { VaultReader } from '../vault/vault-reader.js';
import type { ContextBudget } from './context-budget.js';

/** Returned when the wikilink resolves and the note fits in budget. */
export type WikilinkToolFound = {
  found: true;
  noteName: string;
  /** Full note content, or section subtree if [[Note#Section]] syntax was used. */
  content: string;
};

/**
 * Returned when the note cannot be served.
 * `not_found` — no matching file in the vault.
 * `budget_exceeded` — file found but context budget is exhausted.
 */
export type WikilinkToolNotFound = {
  found: false;
  noteName: string;
  reason: 'not_found' | 'budget_exceeded';
};

export type WikilinkToolResult = WikilinkToolFound | WikilinkToolNotFound;

/**
 * Creates the Vercel AI SDK `wikilink_resolve` tool.
 * Closes over `reader` (for vault I/O) and `budget` (for token gating).
 * Inject mocks for both in tests.
 *
 * @param reader - VaultReader scoped to the active vault.
 * @param budget - Shared ContextBudget instance for this generation request.
 * @returns A Vercel AI SDK Tool ready to pass to a ToolLoopAgent.
 */
export function createWikilinkTool(
  reader: VaultReader,
  budget: ContextBudget,
): Tool<{ wikilink: z.ZodString }, WikilinkToolResult>
```

**Removed types** (no longer public):
- `ConversationContext` — state is now held by `GenerationSession`
- `ContinueOptions` — replaced by `GenerationSession.continue()`

**Modified type** — `GenerateResult` drops the `conversation` field:
```typescript
export type GenerateResult = {
  content: string;
  usage: TokenUsage;
  // conversation removed — session holds state now
};
```

**New class** — `GenerationSession`:

```typescript
/**
 * Encapsulates a single GM generation session: vault pipeline, ToolLoopAgent
 * instance, and accumulated message history. One session per /generate command.
 *
 * @example
 *   const session = await GenerationSession.create(options);
 *   const first = await session.generate(onChunk);
 *   const refined = await session.continue('make her more mysterious', onChunk);
 */
export class GenerationSession {
  /**
   * Runs the vault pipeline (template parse, context pre-fetch, prompt assembly)
   * and creates the ToolLoopAgent. Does not call the LLM.
   */
  static async create(options: GenerateOptions): Promise<GenerationSession>

  /**
   * Sends the assembled prompt as the first user message and streams the response.
   * Call once per session after create().
   */
  async generate(onChunk?: (chunk: string) => void): Promise<GenerateResult>

  /**
   * Sends a follow-up user message to the same ToolLoopAgent and streams
   * the response. Accumulates message history across calls.
   */
  async continue(userMessage: string, onChunk?: (chunk: string) => void): Promise<GenerateResult>
}
```

`GenerateOptions` is unchanged. `ToolLoopAgent` manages the step limit
internally (default `stopWhen: isStepCount(20)`).

---

## Sequence / flow

**Session lifecycle:**

```
/generate npc name:"Lyra" faction:"Thieves Guild"

── GenerationSession.create(options) ──────────────────────────────────────
1. Parse template, validate inputs
2. Read Campaign Style note
3. Initialise ContextBudget; pre-fetch template wikilinks → contextNotes
4. buildPrompt() → { system, prompt }
5. createWikilinkTool(reader, budget)
6. new ToolLoopAgent({ model, instructions: system,
     tools: { wikilink_resolve: wikilinkTool } })
   → session ready; no LLM call yet

── session.generate(onChunk) ──────────────────────────────────────────────
7. agent.stream({ prompt })
   ToolLoopAgent drives the loop:

   7a. Model produces tool call:
       wikilink_resolve({ wikilink: "[[Mira Shadowcloak]]" })
   7b. Tool executes:
       - resolveWikilink → absolute path
       - readNote(path, section?) → content (section fallback if needed)
       - budget.fits → budget.add → { found: true, content }
   7c. Model resumes, generates final text

8. textStream yields chunks → onChunk called per chunk
9. Usage collected; messages appended to session history
10. returns GenerateResult { content, usage }

── session.continue("make her more mysterious", onChunk) ──────────────────
11. Append { role: 'user', content: userMessage } to session messages
12. agent.stream({ messages: sessionMessages })
    (same ToolLoopAgent instance, same tools still wired)
13. Same streaming + collection loop
14. returns GenerateResult { content, usage }
```

Section resolution path:

```
4b. wikilink_resolve({ wikilink: "[[Thieves Guild#Goals]]" })
5a. parseWikilink → { noteName: "Thieves Guild", section: "Goals" }
5b. resolveWikilink → "/path/to/Factions/Thieves Guild.md"
5c. readNote(path, "Goals") → section content
    if readNote throws (section not found):
      readNote(path, undefined) → full note as fallback
```

Budget exhausted path:

```
5d. budget.fits(content) → false
5e. return { found: false, noteName: "Thieves Guild", reason: "budget_exceeded" }
    (model receives structured signal; no exception thrown)
```

---

## Design decisions

### Decision: Tool factory function instead of a standalone module-level tool

**Chosen:** `createWikilinkTool(reader, budget)` returns a new `Tool` instance
for each generation request.

**Alternatives considered:**
- Single exported `const wikilinkTool = tool(...)` at module level — requires
  passing reader/budget via a module-level mutable singleton, which breaks
  concurrent calls and is untestable.
- Class with a method — adds boilerplate with no benefit over a factory function.

**Rationale:** Factory function is the simplest closure-based approach that
supports dependency injection (mock reader + mock budget in tests) and
correctly scopes the budget to a single `generateContent` call.

> **ADR candidate:** No.

---

### Decision: Section fallback handled in `tools.ts`, not in `VaultReader`

**Chosen:** `createWikilinkTool` catches the `Error` thrown by `readNote(path,
section)` when the section is not found, then retries with `readNote(path)` to
return the full note.

**Alternatives considered:**
- Add a `fallback?: boolean` parameter to `VaultReader.readNote()` — modifies a
  stable interface for a tool-layer concern.
- Return `null` from `readNote` on missing section — breaks other callers that
  treat a missing section as an error.

**Rationale:** `VaultReader.readNote()` throwing on a missing section is correct
behaviour for direct callers (they know whether to expect a section). The
fallback-to-full-note behaviour is a tool-level UX decision, not a vault
contract. Keeping it in `tools.ts` respects the module boundary.

> **ADR candidate:** No.

---

### Decision: `GenerationSession` class replaces the two-function model

**Chosen:** `GenerationSession` class with `create()` static factory,
`generate()` for the first turn, and `continue()` for refinement. The
`generateContent` and `continueContent` functions, `ConversationContext` type,
and `ContinueOptions` type are removed.

**Alternatives considered:**
- Keep two functions, return `ConversationContext` from `generateContent` and
  pass it to `continueContent` — the existing approach.
- Merge into a single function with an optional `conversation?` argument.

**Rationale:** `ToolLoopAgent` is a stateful object (model config, tools,
message history) that should live for the duration of a session, not be
recreated on every continuation call. The two-function model was a workaround
for having no object to hold that state. A class gives the state a natural
home, removes the `ConversationContext` pass-through, and maps cleanly to the
CLI's `/generate` → refine... lifecycle. `continue()` reuses the same
`ToolLoopAgent` instance and the `wikilink_resolve` tool remains available
in all turns at no additional cost.

> **ADR candidate:** No.

---

### Decision: No pre-fetch deduplication against tool calls

**Chosen:** The `seen` set in `generateContent` is not exposed to the tool.
Pre-fetched notes and tool-fetched notes share the same `ContextBudget`
instance but do not coordinate lookups.

**Consequence:** If the LLM calls `wikilink_resolve` for a note that was
pre-fetched, and budget is tight, it will receive `{ reason: "budget_exceeded" }`.
In practice the model already has the content in context (from pre-fetch), so
it should not call the tool for it. If it does, the misleading signal is
low-severity — the model can still generate using the content already in
context.

**Alternatives considered:**
- Pass a `ReadonlyMap<string, string>` (path → content) of pre-fetched notes
  to the tool factory. Cache hits bypass budget.

**Rationale:** Adds interface complexity for a rare edge case. Defer; revisit
if testing reveals meaningful budget waste or confusing LLM behaviour.

> **ADR candidate:** No.

---

### Decision: `ToolLoopAgent` instead of bare `streamText` + manual loop

**Chosen:** Construct a `ToolLoopAgent` instance in `generateContent` (and
in `continueContent`) and call `agent.stream()` / `agent.generate()`.

**Alternatives considered:**
- Keep `streamText` with `tools` + `stopWhen: isStepCount(N)` — works, but
  requires manually managing the step limit, tracking message history across
  turns, and wiring tool dispatch. `ToolLoopAgent` handles all of this.

**Rationale:** `ToolLoopAgent` is the idiomatic Vercel AI SDK abstraction for
multi-step agentic loops (introduced in AI SDK 6.0, replacing the former
`Experimental_Agent`). It removes boilerplate, aligns with the SDK's intended
usage pattern, and makes `generation-loop.ts` cleaner. The context budget
remains the primary safety limit on vault traversal; `ToolLoopAgent`'s default
`stopWhen: isStepCount(20)` is the secondary backstop.

> **ADR candidate:** No.

---

### Decision: Tool name `wikilink_resolve`

**Chosen:** The tool is registered as `wikilink_resolve` (underscore-separated)
in the `tools` object passed to `streamText`.

**Rationale:** Tool names in the Vercel AI SDK are passed as-is to the LLM as
the function name. Underscore-separated names are idiomatic for LLM tool
schemas and readable in streaming output logs.

> **ADR candidate:** No.

---

## Test strategy

Following ADR-006's three-layer strategy:

**Unit tests — `src/agent/tools.test.ts`** (new)

All paths through `createWikilinkTool.execute`:

| Scenario | Setup | Expected result |
|---|---|---|
| Note found, no section | `reader.resolveWikilink` returns path; `readNote` returns content; budget fits | `{ found: true, noteName, content }` |
| Note found, section found | `readNote(path, section)` returns section content; budget fits | `{ found: true, content: sectionContent }` |
| Note found, section missing → fallback | `readNote(path, section)` throws; `readNote(path)` returns full; budget fits | `{ found: true, content: fullContent }` |
| Note not found | `resolveWikilink` returns `null` | `{ found: false, reason: 'not_found' }` |
| Note found, budget exhausted | `budget.fits` returns false | `{ found: false, reason: 'budget_exceeded' }` |

All five scenarios use mocked `VaultReader` and `ContextBudget` instances
(plain objects implementing the relevant methods).

**Integration test — `src/__tests__/agent-vault.integration.test.ts`** (modified)

New test: `'generateContent wires wikilink_resolve tool and returns LLM content'`

- Fixture vault on disk (real files)
- `MockLanguageModelV1` configured to emit one tool call (`wikilink_resolve`,
  `wikilink: "[[Thieves Guild]]"`) followed by a text response on the next step
- Assert: `result.content` is the mocked text response
- Assert: `result.usage.totalTokens > 0`
- No snapshot for this test — the tool call round-trip is not part of the
  assembled prompt object tested by the existing snapshot; the tool's
  correctness is covered by unit tests above

**No fixture vault changes needed** — `Factions/Thieves Guild.md` and
`NPCs/Mira Shadowcloak.md` provide the two note types needed for tool
resolution tests.

---

## Out of scope / deferred

- **Pre-fetch deduplication** — tool returning `budget_exceeded` for a pre-fetched
  note is a known edge case but low-severity. Revisit if testing reveals issues.
- **`@[[note-name]]` template injection** — different mechanism (template-parse
  time, not generation time); deferred.
- **Pre-fetch deduplication** — tool returning `budget_exceeded` for a
  pre-fetched note is a known edge case but low-severity. Revisit if testing
  reveals issues.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| How does `ToolLoopAgent.stream()` expose token usage (input + output across all steps)? | Via `onFinish` callback or a `usage` property on the stream result — same shape as `streamText`. Verify exact API against installed `ai` package during implementation. | Implementation task 003 |
| Does `MockLanguageModelV1` support tool call simulation with `ToolLoopAgent` in the current AI SDK version? | Yes — `ToolLoopAgent` uses the same provider interface as `streamText`; mock tool-call responses should work the same way. Verify during test task. | Test task 004 |
