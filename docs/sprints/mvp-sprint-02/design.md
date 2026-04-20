# Design — mvp-sprint-02: Context Assembly

> **Status:** Draft
> **Sprint:** mvp-sprint-02
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint creates `src/agent/` — the module responsible for assembling the prompt that will be sent to the LLM. Two files are introduced: `context-budget.ts` (token tracking and ceiling enforcement) and `prompt-builder.ts` (system prompt template and assembly function). Both are pure logic with no filesystem access; they consume strings already read from the vault by the caller. An integration test in `src/__tests__/` exercises the full assembly pipeline against the real fixture vault with a committed snapshot.

`src/llm/` is not touched in this sprint. `getModel()` is implemented in Sprint 3 when it is first needed.

---

## Module map

```
src/
├── agent/
│   ├── context-budget.ts          (new) token tracker and ceiling enforcer
│   ├── context-budget.test.ts     (new) unit tests
│   ├── prompt-builder.ts          (new) system prompt template + assembly function
│   └── prompt-builder.test.ts     (new) unit tests
└── __tests__/
    └── agent-vault.integration.test.ts  (new) full assembly against fixture vault
```

`src/vault/` is imported by the integration test (to read fixture files) but not by `src/agent/` itself. `src/agent/` has no filesystem access — callers pass strings in.

---

## Interfaces and data types

```typescript
// src/agent/context-budget.ts

/** Tracks token usage against a ceiling and reports remaining capacity. */
export class ContextBudget {
  /**
   * Creates a budget with the given ceiling.
   * When maxTokens is omitted, reads CONTEXT_BUDGET_TOKENS from env.
   * Throws if no ceiling can be determined.
   */
  constructor(maxTokens?: number)

  /** Tokens still available within the ceiling. */
  get remaining(): number

  /**
   * Returns true if adding text would not exceed the ceiling.
   * Does not modify state.
   */
  fits(text: string): boolean

  /**
   * Records text's token count against the running total.
   * Throws if adding text would exceed the ceiling.
   */
  add(text: string): void
}
```

```typescript
// src/agent/prompt-builder.ts

/** A single vault note to be included as context. */
export type ContextNote = {
  name: string;    // note filename without extension, used as a section header
  content: string; // raw Markdown content
};

/** Inputs for a single generation request. */
export type BuildPromptArgs = {
  campaignStyle: string;        // full content of the Campaign Style note
  templateInstructions: string; // agentPrompt extracted by TemplateParser
  templateBody: string;         // bodyMarkdown from TemplateParser — the note structure to fill in
  contextNotes: ContextNote[];  // budget-filtered vault notes, in order
  userInputs: Record<string, string>; // resolved template inputs, e.g. { name: "Mira", faction: "Thieves Guild" }
};

/** Ready-to-use prompt parts for Vercel AI SDK's generateText / streamText. */
export type BuiltPrompt = {
  system: string; // passed as the `system` parameter
  prompt: string; // passed as the `prompt` parameter
};

/**
 * Assembles a prompt from campaign context.
 * Returns { system, prompt } for direct use with generateText/streamText.
 * Pure function — no I/O, no side effects.
 */
export function buildPrompt(args: BuildPromptArgs): BuiltPrompt
```

---

## Sequence / flow

Sprint 3's generation loop will assemble a prompt as follows:

```
generation-loop.ts (Sprint 3)
  │
  │  const budget = new ContextBudget()        // ceiling from env
  │  const reader = new VaultReader(vaultRoot)
  │  const parser = new TemplateParser()
  │
  ├─ reader.readNote(campaignStylePath)
  │     → campaignStyle: string
  │
  ├─ parser.parse(templateContent)
  │     → { agentPrompt, inputs, bodyMarkdown }
  │
  ├─ [for each vault note to include]:
  │     budget.fits(noteContent)  → true/false
  │     budget.add(noteContent)   (if fits)
  │
  └─ buildPrompt({
         campaignStyle,
         templateInstructions: agentPrompt,
         templateBody: bodyMarkdown,
         contextNotes: [{ name, content }, ...],
         userInputs: { name: "Mira", faction: "Thieves Guild" }
     })
         → { system, prompt }   →  passed as streamText({ system, prompt, model }) in Sprint 3
```

`buildPrompt` and `ContextBudget` are not called by each other — the caller controls the gating loop. This keeps both units testable in isolation.

---

## System prompt structure

`buildPrompt` constructs two messages: a system message and a user message.

**System message** (concatenated in this fixed order):

```
You are Lorecraft, an AI co-author for tabletop RPG Game Masters. Your role
is to generate lore-consistent campaign content that fits the world the GM
has already built. You read the GM's vault notes before writing anything.
You never invent facts that contradict the existing lore. You produce
output as a Markdown note using the template structure provided.

---
## Campaign Style

{campaignStyle}

---
## Your Task

{templateInstructions}

---
## Output Template

Fill in the following template. Preserve all Markdown headings and fields.
Do not add sections that are not in the template.

{templateBody}

---
## Relevant Notes from the Vault

{contextNotes — each note formatted as:}
### {note.name}
{note.content}
```

When `templateInstructions` is empty (no AGENT PROMPT block in the template), the "Your Task" section is omitted entirely. When `contextNotes` is empty, the "Relevant Notes" section is omitted entirely. `templateBody` is always included — a template with no body would produce no usable output.

**User message:**

```
Generate the note with the following inputs:
{each userInput formatted as "- key: value"}
```

---

## Design decisions

### Decision: `buildPrompt` is a standalone function, not a class

**Chosen:** Named export `buildPrompt(args)`. No class, no constructor.

**Alternatives considered:** A `PromptBuilder` class instantiated with the base prose as config. Rejected — the base prose is a fixed constant, not configuration. There is no state to carry between calls.

**Rationale:** Stateless assembly logic is cleanest as a function. Easier to test, easier to import.

> **ADR candidate:** No.

---

### Decision: Base system prompt prose is a hardcoded constant in `prompt-builder.ts`

**Chosen:** The "You are Lorecraft…" paragraph lives as a `const` in `prompt-builder.ts`.

**Alternatives considered:**
- A separate `prompts/system.txt` file read at startup. Rejected — adds I/O to a pure module and an extra asset to maintain.
- A `.env` variable. Rejected — the base framing is code behaviour, not deployment configuration.

**Rationale:** The base prose is as much a part of the code's correctness as a function name. It belongs in source control next to the function that uses it, not in a config file.

> **ADR candidate:** No.

---

### Decision: Context notes passed as `{ name, content }` objects, not raw strings

**Chosen:** `ContextNote = { name: string; content: string }`.

**Alternatives considered:** Plain `string[]` where each string is already formatted. Rejected — callers (Sprint 3) would need to format the note header themselves, coupling them to the prompt structure. With the typed object, formatting is fully encapsulated in `buildPrompt`.

**Rationale:** The prompt builder owns the formatting decision. Callers own the selection decision. Clean separation.

> **ADR candidate:** No.

---

### Decision: Token counting uses a character-based approximation (4 chars ≈ 1 token)

**Chosen:** `Math.ceil(text.length / 4)` as the token estimate inside `ContextBudget`.

**Alternatives considered:**
- `tiktoken` or `@anthropic-ai/tokenizer` for accurate token counts. Rejected — additional dependency, adds complexity, and billing accuracy is not needed at MVP.
- Word count (`text.split(/\s+/).length`). Rejected — character count is a tighter proxy for byte-level tokenisers used by modern models.

**Rationale:** The goal is reliable ceiling enforcement, not billing accuracy. A 20–30% error margin is acceptable. The default ceiling should be set conservatively to account for this.

> **ADR candidate:** No.

---

### Decision: `ContextBudget.add()` throws if the text exceeds the ceiling

**Chosen:** `add()` throws rather than silently dropping content or truncating.

**Alternatives considered:**
- Return a boolean from `add()` (success/failure). Rejected — callers must always call `fits()` first anyway; a silent failure from `add()` would be confusing.
- Silently drop excess content. Rejected — silent data loss in a context assembly pipeline is dangerous; the caller should decide what to do when a note doesn't fit.

**Rationale:** The caller (Sprint 3's generation loop) is responsible for checking `fits()` before calling `add()`. If it fails to do so, throwing is the right signal. The pattern is: `if (budget.fits(content)) { budget.add(content); notes.push(...) }`.

> **ADR candidate:** No.

---

### Decision: Empty sections are omitted, not rendered as empty headings

**Chosen:** When `templateInstructions` is `""` or `contextNotes` is `[]`, their section headers are not included in the system prompt.

**Alternatives considered:** Always include all section headers, leaving some empty. Rejected — empty sections waste tokens and may confuse the model ("Relevant Notes from the Vault: [nothing]").

**Rationale:** A minimal prompt with only a campaign style and a user message is still valid and should not contain distracting empty scaffolding.

> **ADR candidate:** No.

---

## Test strategy

### `context-budget.test.ts` (unit)

- `new ContextBudget(100)` — `remaining` starts at 100
- `.fits()` returns `true` for text that fits, `false` for text that doesn't
- `.add()` reduces `remaining` correctly
- `.add()` throws when text exceeds remaining budget
- Default ceiling read from `CONTEXT_BUDGET_TOKENS` env var when no arg supplied
- Throws on construction when neither arg nor env var is present

### `prompt-builder.test.ts` (unit)

- Full args → `system` contains campaign style, template instructions, template body, context notes in correct order
- Empty `templateInstructions` → "Your Task" section absent from `system`
- Empty `contextNotes` → "Relevant Notes" section absent from `system`
- `templateBody` always present in `system` regardless of other fields
- Multiple context notes → each rendered with name as `###` heading
- `userInputs` appear in `prompt`
- Returns `{ system: string; prompt: string }` — both fields always present

### `agent-vault.integration.test.ts` (integration)

Runs against the real fixture vault. No LLM calls — `buildPrompt` is pure.

1. `VaultReader` + `TemplateParser` read the fixture vault (same classes from Sprint 1)
2. `ContextBudget` with a fixed test ceiling (e.g. 8 000 tokens)
3. Campaign style from `Campaign Style.md`, template instructions from `_templates/npc.md`, context notes from `Thieves Guild.md` and `Mira Shadowcloak.md`
4. `buildPrompt(...)` called with assembled inputs
5. Result asserted with `toMatchSnapshot()`

The snapshot captures the exact system message text and user message text. Any future change to the base prose, section ordering, or note formatting will fail this test and require a conscious snapshot update.

No fixture vault changes are required for this sprint — the existing four notes are sufficient.

---

## Out of scope / deferred

- `src/llm/provider.ts` and `getModel()` — implemented in Sprint 3 when first needed (not touched here)
- Context truncation and summarisation — notes that don't fit the budget are skipped by the caller; no summarisation logic in this sprint (v0.1+)
- `@[[note-name]]` injection in template comments — requires wikilink traversal (Sprint 3)
- Frontmatter extraction from notes — raw Markdown passed through as-is
- Multi-turn conversation history in the prompt — Sprint 3 concern (the refinement loop appends to messages)

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Should the base system prompt prose be reviewed with a real LLM before Sprint 3 ships? | Yes — the prose will be validated during Sprint 3's manual smoke test; snapshot tests only catch structural regressions, not quality | Sprint 3 smoke test |
| Should `ContextBudget` track fixed overhead (base prompt + user message) separately from variable vault context? | No — the ceiling applies only to `contextNotes`; base prose and user message are always included regardless | Revisit in Sprint 3 if prompts approach model context limits |
