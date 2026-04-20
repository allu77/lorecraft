# Design — mvp-sprint-03: Generation Loop

> **Status:** Draft
> **Sprint:** mvp-sprint-03
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint wires together the vault layer (Sprint 1) and context assembly layer (Sprint 2) into a single callable function, `generateContent`, in `src/agent/generation-loop.ts`. It also creates the missing `src/llm/provider.ts` (planned in Sprint 2 but not implemented). The result is a headless agentic pipeline: resolve inputs, gather budget-bounded vault context, assemble the prompt, stream the LLM response, and return the full text with token usage. The Sprint 4 CLI wraps this function for terminal display.

---

## Module map

```
src/
├── llm/
│   └── provider.ts                  (new) instantiates Bedrock model, exposes getModel()
├── agent/
│   ├── context-budget.ts            (existing, unchanged)
│   ├── prompt-builder.ts            (existing, unchanged)
│   └── generation-loop.ts           (new) generateContent() — main pipeline
└── __tests__/
    └── generation-loop.integration.test.ts  (new) end-to-end test against fixture vault, LLM mocked
```

---

## Interfaces and data types

```typescript
// src/llm/provider.ts
import type { LanguageModel } from 'ai';

/** Returns the configured Bedrock language model for use with Vercel AI SDK calls. */
export function getModel(): LanguageModel
```

```typescript
// src/agent/generation-loop.ts
import type { LanguageModel } from 'ai';

/** Token counts as reported by the Vercel AI SDK after a streamText call. */
export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/** Options for a single content generation request. */
export type GenerateOptions = {
  /** Absolute path to the vault root directory. */
  vaultRoot: string;
  /** Absolute path to the Obsidian template file (`.md`). */
  templatePath: string;
  /**
   * Caller-supplied input values, e.g. `{ name: "Mira", faction: "Thieves Guild" }`.
   * Values may be plain note names or wikilink strings (`[[Note Name]]`).
   */
  inputs: Record<string, string>;
  /**
   * Optional streaming callback. Called with each text chunk as it arrives
   * from the LLM. The CLI (Sprint 4) uses this for incremental display.
   */
  onChunk?: (chunk: string) => void;
};

/** Result returned by generateContent after a successful generation. */
export type GenerateResult = {
  /** Full generated markdown text. */
  content: string;
  /** Token counts from the Vercel AI SDK usage report. */
  usage: TokenUsage;
};

/**
 * Runs the full generation pipeline for a single vault note.
 * Resolves vault context, assembles a budget-bounded prompt, streams
 * the LLM response, and returns the complete text with token usage.
 *
 * Throws if any required template input is missing from `options.inputs`.
 *
 * @param options - Generation request parameters.
 * @returns Resolved `GenerateResult` with content and token usage.
 */
export async function generateContent(options: GenerateOptions): Promise<GenerateResult>
```

---

## Sequence / flow

```
generateContent({ vaultRoot, templatePath, inputs, onChunk })
  │
  ├─ 1. VaultReader.readNote(templatePath)
  │       → raw template content
  │
  ├─ 2. TemplateParser.parse(content)
  │       → { agentPrompt, inputs: templateInputs, bodyMarkdown }
  │
  ├─ 3. Validate required inputs
  │       for each templateInput where required === true:
  │         if not in options.inputs → collect name
  │       if any missing → throw Error("Missing required inputs: name, role")
  │
  ├─ 4. Find and read Campaign Style note
  │       VaultReader.findNote("Campaign Style")
  │       → path | null
  │       if found: VaultReader.readNote(path) → campaignStyle
  │       else: campaignStyle = ""
  │
  ├─ 5. Initialize ContextBudget(CONTEXT_BUDGET_TOKENS env or default)
  │       budget.add(campaignStyle)  // account for campaign style tokens
  │
  ├─ 6. Gather context notes
  │       candidates = [
  │         ...extractWikilinks(bodyMarkdown),        // [[links]] in template body
  │         ...Object.values(options.inputs),          // input values as note refs
  │       ]
  │       for each candidate:
  │         path = VaultReader.resolveWikilink(candidate)
  │                 ?? VaultReader.findNote(candidate)   // fallback for plain names
  │         if path found:
  │           content = VaultReader.readNote(path)
  │           if budget.fits(content):
  │             budget.add(content)
  │             contextNotes.push({ name: basename(path), content })
  │
  ├─ 7. buildPrompt({ campaignStyle, templateInstructions: agentPrompt,
  │                   templateBody: bodyMarkdown, contextNotes,
  │                   userInputs: options.inputs })
  │       → { system, prompt }
  │
  ├─ 8. streamText({ model: getModel(), system, prompt })
  │       for each chunk: onChunk?.(chunk)
  │
  └─ 9. Collect result.text + result.usage
          → return { content, usage: { promptTokens, completionTokens, totalTokens } }
```

---

## Design decisions

### Decision: Campaign Style discovery by convention

**Chosen:** `VaultReader.findNote("Campaign Style")` — search the vault for a note with that filename. If not found, proceed with an empty campaign style (no error).

**Alternatives considered:**
- Accept `campaignStylePath` as an explicit parameter — shifts burden to every caller and forces Sprint 4 CLI to hard-code a path.
- Make it a required parameter — too rigid for vaults that might name it differently.

**Rationale:** Convention over configuration is how Obsidian itself works (template folder, daily notes folder, etc.). The fixture vault already follows this convention. Soft failure (empty string) means the loop still works on minimal vaults without the note.

> **ADR candidate:** No — too small a decision; document it in this design doc and CLAUDE.md if needed.

---

### Decision: Context candidate sources

**Chosen:** Two sources of context candidates: (a) `[[wikilinks]]` extracted from `bodyMarkdown` via regex, and (b) every value in `options.inputs`, treated as a potential note reference.

**Alternatives considered:**
- Only template body wikilinks — misses faction/location notes that the GM passes as inputs.
- Only input values — misses notes explicitly linked in the template structure.
- Recursive wikilink traversal (follow links inside fetched notes) — deferred to v0.2 per requirements.

**Rationale:** The fixture vault demonstrates both paths: the NPC template body has no `[[links]]` itself, but the GM passes `faction: "Thieves Guild"` as an input. Including input values as candidates covers the common case without recursive traversal.

Duplicate resolution (same note resolved twice from both sources) is handled by tracking seen paths in a `Set<string>` before reading.

> **ADR candidate:** No.

---

### Decision: Input value resolution strategy

**Chosen:** Try `VaultReader.resolveWikilink(value)` first (handles `[[Note Name]]` syntax), then fall back to `VaultReader.findNote(value)` (handles plain names like `"Thieves Guild"`). If neither resolves, skip silently — the input value is used as a string in the prompt regardless.

**Alternatives considered:**
- Only wikilink resolution — GM would have to write `[[Thieves Guild]]` every time.
- Always treat as plain name — would break if GM does pass wikilink syntax.

**Rationale:** The GM may use either form depending on where they invoke `/generate`. Both forms should work transparently.

> **ADR candidate:** No.

---

### Decision: streamText with onChunk callback

**Chosen:** Use `streamText` from the Vercel AI SDK. Forward each text chunk to the optional `onChunk` callback. Await `result.text` for the complete content and `result.usage` for token counts.

**Alternatives considered:**
- `generateText` — simpler but no streaming. The Sprint 4 CLI needs streaming for incremental display, so `streamText` is the right primitive. The generation loop uses it even now so Sprint 4 doesn't have to change the interface.
- Return `AsyncIterable<string>` instead of a complete result — would require the caller to collect, complicating tests and making token reporting harder.

**Rationale:** `streamText` + callback separates concerns cleanly: the generation loop collects the full result for its return value, while forwarding chunks to whichever transport layer cares about incremental display.

> **ADR candidate:** No — ADR-001 already governs Vercel AI SDK usage.

---

### Decision: Missing required inputs throw immediately

**Chosen:** If any `required` template input is absent from `options.inputs`, throw synchronously before any vault I/O with a clear error message listing the missing names.

**Alternatives considered:**
- `onPromptUser` callback to ask interactively — removed from scope after requirements revision.
- Return a discriminated union result (`{ ok: false, missingInputs: string[] }`) — adds type complexity for a condition that is a programmer error at MVP stage.

**Rationale:** At MVP the CLI (Sprint 4) will parse inputs before calling `generateContent`, so missing inputs are a contract violation. A thrown error with a clear message is the right signal.

> **ADR candidate:** No.

---

## Test strategy

Follows ADR-006. No meaningful pure-logic unit tests for `generation-loop.ts` — the function is orchestration with no branching logic worth isolating. Coverage comes entirely from the integration test.

**`src/__tests__/generation-loop.integration.test.ts`**

- Uses real fixture vault on disk (`src/__tests__/fixtures/test-vault/`)
- LLM mocked at provider boundary via `MockLanguageModelV1` from `@ai-sdk/mock` (Vercel AI SDK test utilities). `getModel()` is replaced with a mock model in tests via dependency injection — see below.
- Test cases:
  1. **Happy path** — provide `name` and `role`; assert `content` is non-empty string; assert `usage` has numeric token fields; assert `onChunk` was called at least once.
  2. **Context notes gathered** — provide `faction: "Thieves Guild"`; spy on `buildPrompt` or inspect mock model's received messages to verify Thieves Guild content appears in the assembled prompt.
  3. **Missing required input throws** — omit `name`; assert the function throws with a message listing "name".
  4. **Budget exceeded gracefully** — set a tiny budget (< 100 tokens); assert generation succeeds (context notes skipped, not a crash).

**Dependency injection for `getModel()`:** The integration test cannot call real Bedrock. Rather than monkey-patching the module, `generateContent` accepts an optional `model` parameter in `GenerateOptions`. When omitted it calls `getModel()`. In tests the mock model is passed explicitly. This keeps the production path clean while making tests straightforward.

```typescript
// Added to GenerateOptions:
model?: LanguageModel;  // injected in tests; omit in production
```

**Fixture vault changes:** None required. Existing notes (Campaign Style, Thieves Guild, Mira Shadowcloak, npc template) cover all test scenarios.

---

## Out of scope / deferred

- `src/llm/provider.ts` unit tests — `getModel()` is a one-liner wrapping the AI SDK; the integration test exercises it indirectly via the mock injection path.
- Recursive wikilink traversal — v0.2.
- Interactive approve/change loop — future enhancement.
- Token cost in dollars — future enhancement.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Does `result.usage` from `streamText` resolve before or after `result.text`? | Both require awaiting the full stream to complete. Await `result.text` first, then read `result.usage` (both should be available once the stream is exhausted). | Verify during implementation — check Vercel AI SDK docs. |
| `@ai-sdk/mock` package name for `MockLanguageModelV1` | The mock utilities ship as part of `ai` package's test exports or a separate `@ai-sdk/mock` package. Confirm during task 001. | Task 001 (provider setup). |
