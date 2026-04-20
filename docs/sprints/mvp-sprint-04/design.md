# Design — mvp-sprint-04: CLI & Full Integration

> **Status:** Draft
> **Sprint:** mvp-sprint-04
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint delivers the GM-facing CLI by creating `src/cli/index.ts` (readline REPL) and extending `src/agent/generation-loop.ts` with multi-turn support. The generation loop gains a `ConversationContext` return value and a `continueContent` function so the CLI can append follow-up messages without re-running vault traversal. All LLM calls remain inside `src/agent/`; the CLI is purely transport.

---

## Module map

```
src/
├── agent/
│   └── generation-loop.ts   (modified) new types: ConversationContext, ContinueOptions;
│                             new function: continueContent;
│                             GenerateResult gains conversation field
├── cli/
│   └── index.ts             (new) REPL entry point, command parser, processCommand
└── __tests__/
    └── cli.integration.test.ts  (new) tests processCommand with mocked model
```

---

## Interfaces and data types

### Additions to `src/agent/generation-loop.ts`

```typescript
import type { CoreMessage } from 'ai';

/**
 * Conversation state carried between turns.
 * `system` is fixed for the lifetime of a conversation (assembled once by
 * `generateContent`). `messages` grows with each user + assistant turn.
 */
export type ConversationContext = {
  system: string;
  messages: CoreMessage[];
};

// GenerateResult gains one new field (additive — existing callers unaffected):
export type GenerateResult = {
  content: string;
  usage: TokenUsage;
  /** Conversation context to pass to `continueContent` for refinement turns. */
  conversation: ConversationContext;
};

/** Options for a continuation turn in an existing conversation. */
export type ContinueOptions = {
  /** Conversation context returned by a prior `generateContent` or `continueContent` call. */
  conversation: ConversationContext;
  /** The GM's free-form follow-up message. */
  userMessage: string;
  /** Optional streaming callback, same as in `GenerateOptions`. */
  onChunk?: (chunk: string) => void;
  /** Language model override — inject mock in tests. */
  model?: LanguageModel;
};

/**
 * Sends a follow-up message in an existing conversation and streams the response.
 * Skips vault traversal and prompt assembly — uses the system prompt already
 * assembled by `generateContent`.
 *
 * @param options - Continuation request including prior conversation context.
 * @returns Updated `GenerateResult` with the new content, usage, and extended conversation.
 */
export async function continueContent(options: ContinueOptions): Promise<GenerateResult>
```

### `src/cli/index.ts`

```typescript
/** Injected dependencies for testing (replaces env vars and real model). */
export type CliDeps = {
  model?: LanguageModel;
  vaultRoot?: string;
  output?: NodeJS.WriteStream;  // defaults to process.stdout
};

/**
 * Processes a single line of CLI input against the current state.
 * Returns updated state. Pure enough to call directly in tests.
 *
 * @param line    - Raw input line from the GM (e.g. "/generate npc name:Mira").
 * @param state   - Current conversation state (null if no active conversation).
 * @param deps    - Injected dependencies; omit in production to use env/defaults.
 * @returns Updated `ConversationContext | null` after processing the command.
 */
export async function processCommand(
  line: string,
  state: ConversationContext | null,
  deps?: CliDeps,
): Promise<ConversationContext | null>

/**
 * Starts the interactive readline REPL. Reads VAULT_ROOT from env.
 * Runs until the GM types /exit or sends EOF.
 */
export async function main(): Promise<void>
```

---

## Sequence / flow

### Initial generation (`/generate npc name:"Mira" role:Spy`)

```
CLI readline receives: /generate npc name:"Mira" role:Spy
  │
  ├─ parseGenerateCommand(line)
  │   → { type: "npc", inputs: { name: "Mira", role: "Spy" } }
  │
  ├─ resolve templatePath = {vaultRoot}/_templates/npc.md
  │
  ├─ generateContent({ vaultRoot, templatePath, inputs, onChunk, model })
  │   (vault traversal + prompt assembly + streamText — Sprint 3 pipeline)
  │   onChunk: write each chunk to output
  │   → { content, usage, conversation: { system, messages } }
  │
  ├─ print delimiter + token report
  │
  └─ return conversation (stored in CLI state)
```

### Continuation turn (free-form text)

```
CLI readline receives: "Give this NPC a weird habit"
  │
  ├─ no leading "/" → treat as continuation
  │
  ├─ if state === null → print hint, return null
  │
  ├─ continueContent({ conversation: state, userMessage, onChunk, model })
  │   streamText({ model, system: state.system, messages: [...state.messages,
  │                { role: 'user', content: userMessage }] })
  │   onChunk: write each chunk to output
  │   → { content, usage, conversation: updated with new user + assistant turns }
  │
  ├─ print delimiter + token report
  │
  └─ return updated conversation
```

### `generateContent` internal changes

After streaming, the function now builds and returns the initial `ConversationContext`:

```typescript
const conversation: ConversationContext = {
  system,
  messages: [
    { role: 'user', content: prompt },       // the initial generation request
    { role: 'assistant', content: content }, // the generated note
  ],
};
return { content, usage, conversation };
```

### `continueContent` internal flow

```typescript
const newMessages: CoreMessage[] = [
  ...conversation.messages,
  { role: 'user', content: userMessage },
];
const streamResult = streamText({ model, system: conversation.system, messages: newMessages });
// collect chunks, call onChunk
const content = chunks.join('');
const usage = await streamResult.usage;
const updatedMessages: CoreMessage[] = [
  ...newMessages,
  { role: 'assistant', content },
];
return {
  content,
  usage: { ... },
  conversation: { system: conversation.system, messages: updatedMessages },
};
```

---

## Design decisions

### Decision: Extend `GenerateResult` with `conversation` field

**Chosen:** Add `conversation: ConversationContext` to `GenerateResult`. Both `generateContent` and `continueContent` return the same type. The CLI stores the latest result's `conversation` as its state.

**Alternatives considered:**
- Return `ConversationContext` as a separate parallel value (two return values) — awkward in TypeScript without tuples.
- A `ConversationSession` class with a `.continue()` method — more OO, but the codebase uses functional style with named exports.

**Rationale:** Additive change to the existing type. Existing tests that destructure only `{ content, usage }` still compile. The conversation state travels with each result, so the CLI never has to track it separately from the content.

> **ADR candidate:** No — a minor internal API extension.

---

### Decision: `continueContent` as a standalone function, not an overload of `generateContent`

**Chosen:** A separate `continueContent(options: ContinueOptions)` function with a distinct options type.

**Alternatives considered:**
- Single `generateContent` overload with optional `conversation` field that switches between assembly and continuation mode — conflates two logically distinct operations and makes the function harder to reason about.

**Rationale:** The two operations differ fundamentally: `generateContent` does vault I/O and prompt assembly; `continueContent` skips all of that and just extends the message list. Separate functions make this distinction explicit and keep each function's contract clear.

> **ADR candidate:** No.

---

### Decision: `CoreMessage` from `'ai'` in the exported `ConversationContext` type

**Chosen:** `messages: CoreMessage[]` from the `ai` package.

**Alternatives considered:**
- Define a custom `{ role: 'user' | 'assistant'; content: string }` type — avoids the SDK dependency in the exported type, but requires a cast when passing to `streamText`.

**Rationale:** `CoreMessage` is already a transitive dependency (the module imports `streamText` from `'ai'`). Using it directly keeps types accurate and eliminates the cast. If the SDK ever changes `CoreMessage`, the compiler will catch the break immediately.

> **ADR candidate:** No.

---

### Decision: `processCommand` export for in-process CLI testing

**Chosen:** Export `processCommand(line, state, deps?)` so tests call it directly in-process with a mocked model. No `execa` child process spawning.

**Alternatives considered:**
- `execa` child process test with `MOCK_LLM=true` env var — requires a test-mode code path in the production binary, adds process lifecycle complexity, and requires stdin/stdout piping.
- Pure unit tests of the parser only, no integration — misses wiring bugs between CLI and generation loop.

**Rationale:** `processCommand` is a pure-enough function (state in, state out, output captured via injected WriteStream) that direct in-process testing gives the same coverage as `execa` at a fraction of the complexity. ADR-006 called for `execa` but the rationale was catching wiring bugs — `processCommand` tests achieve this without the overhead. The deviation is noted in the requirements open questions.

> **ADR candidate:** No.

---

### Decision: `/generate` resets conversation completely; no `/reset` command

**Chosen:** Issuing `/generate` is the only way to start a new conversation. It discards the previous context and re-runs vault assembly.

**Alternatives considered:**
- Separate `/reset` command — unnecessary; `/generate` subsumes it.
- Keeping old context across `/generate` calls — confusing; different notes should start fresh.

**Rationale:** Simple and predictable. The GM's mental model: `/generate` = fresh start, anything else = continue current thread.

> **ADR candidate:** No.

---

## Test strategy

Follows ADR-006.

**`src/__tests__/cli.integration.test.ts`** — tests `processCommand` in-process:

- Mock model injected via `deps.model` (`MockLanguageModelV3`)
- Fixture vault at `src/__tests__/fixtures/test-vault/`
- Captured output stream (array of written strings)

Test cases:
1. **`/generate` happy path** — returns non-null `ConversationContext`; output contains streamed content; output contains token report line
2. **Continuation turn** — feed `/generate` result's state into a second `processCommand` call with free-form text; returned state has 4 messages (user, assistant, user, assistant); output contains second response
3. **`/generate` resets state** — continuation after a second `/generate` uses fresh context (message history has 2 entries, not 4+)
4. **Free-form input with no active conversation** — returns `null` state; output contains hint
5. **Unknown slash command** — returns unchanged state; output contains error hint
6. **Template not found** — output contains error; state unchanged (null)

**Unit tests for `parseGenerateCommand`** — co-located at `src/cli/index.test.ts`:
- `name:Mira role:Spy` → `{ name: 'Mira', role: 'Spy' }`
- `name:"Mira Shadowcloak" faction:"Thieves Guild"` → quoted values parsed correctly
- Empty args → `{}`
- Returns `{ type, inputs }` correctly for all cases

**Changes to existing `generation-loop.integration.test.ts`** — update assertions to account for the new `conversation` field in `GenerateResult`. Existing snapshot may need update.

**Fixture vault** — no changes needed.

---

## Out of scope / deferred

- Interactive approve/change loop — the multi-turn conversation model replaces this; the GM refines by just typing.
- `execa`-based child process CLI tests — deferred; in-process `processCommand` tests are sufficient at MVP.
- Readline history persistence — deferred.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Does `streamText` accept `{ system, messages }` together (system separate from messages array)? | Yes — this is the standard multi-turn pattern in the Vercel AI SDK. Verify during implementation. | Task 002 (continueContent). |
| Will adding `conversation` to `GenerateResult` break the existing snapshot test? | Yes — the snapshot will change since the returned object gains a new field. Accept the new snapshot. | Task 001 (update generation-loop.ts). |
