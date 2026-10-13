# Design — v02-sprint-ollama: Ollama provider (chat + embeddings)

> **Status:** Draft
> **Sprint:** v02-sprint-ollama
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

`src/llm/provider.ts` becomes a small provider switch: `LLM_PROVIDER` selects
Bedrock (default) or Ollama for chat, and `getEmbeddingModel()` does the same for
embeddings. The Ollama context window (`num_ctx`) is injected once, as a
`wrapLanguageModel` middleware inside `provider.ts`, so `src/agent/` stays
provider-agnostic. `src/llm/embedding-provider.ts` gains an Ollama implementation
beside the Bedrock one. The agent asks `src/llm/` for the active context window and
warns when the context budget does not fit. The CLI translates the two common Ollama
failures (server down, model not pulled) into readable messages.

The design was checked against `ollama-ai-provider-v2@4.0.1` (its built `dist/`),
not only its README, and against `ai@7.0.x`.

---

## Verified adapter behaviour (facts the design depends on)

| Fact (from `ollama-ai-provider-v2@4.0.1` dist) | Consequence |
|---|---|
| Default base URL is `http://127.0.0.1:11434/api`; chat posts to `${baseURL}/chat`, embeddings to `${baseURL}/embed`. | `OLLAMA_BASE_URL` is documented as `http://localhost:11434` (no `/api`). We must append `/api`, or every request 404s. |
| `provider(modelId)` and `provider.chat(modelId)` are the same model; `chat()` does **not** apply constructor settings. | `num_ctx` cannot be set when creating the model. It is read per call from `providerOptions.ollama.options.num_ctx`. |
| Usage comes from `prompt_eval_count` / `eval_count` and defaults to 0 when absent. | `normalizeUsage` already handles this; no code change, one test. |
| Peer dependency `ai ^7`, Node 22+. | Matches the repo after v03-ai-sdk-7. |
| `embedding` / `embeddingModel` take settings (`truncate`, `keepAlive`, `dimensions`). `truncate` defaults to Ollama's default (true). | Chunks are at most ~1500 characters (`note-chunker.ts`), far below `nomic-embed-text`'s 8192-token window, so silent truncation is not a practical risk. |

---

## Module map

```
package.json                                   (mod) + ollama-ai-provider-v2 "~4.0.1"
pnpm-lock.yaml                                 (mod)
.env.example                                   (mod) OLLAMA_* vars, EMBEDDING_PROVIDER=ollama
docs/development/setup.md                      (mod) Ollama section, recommended models
docs/architecture/decisions.md                 (mod) amend ADR-004 (+ ADR-001 note)
docs/sprints/overview.md                       (mod) add sprint
src/
├── llm/
│   ├── provider.ts                            (mod) LLM_PROVIDER switch; num_ctx middleware;
│   │                                                getEmbeddingModel(provider, modelId);
│   │                                                getModelInfo(); getContextWindow()
│   ├── config.ts                              (new) env parsing/validation only, no adapter imports
│   ├── embedding-provider.ts                  (mod) + OllamaEmbeddingProvider; dimensions table
│   ├── errors.ts                              (new) describeProviderError()
│   ├── provider.test.ts                       (mod)
│   ├── config.test.ts                         (new)
│   ├── embedding-provider.test.ts             (mod)
│   └── errors.test.ts                         (new)
├── agent/
│   └── generation-loop.ts                     (mod) log real provider/model; budget vs window warning
├── cli/
│   └── index.ts                               (mod) use describeProviderError in error paths
└── __tests__/
    ├── provider-boundary.test.ts              (mod) adapter list: bedrock + ollama
    └── generation-loop.integration.test.ts    (mod) usage normalisation / budget warning
```

`src/vault/` is unchanged: it keeps the `EmbeddingProvider` interface and the
staleness logic that rebuilds the index when `modelId` changes.

---

## Interfaces and data types

```typescript
// src/llm/config.ts  (no adapter imports; pure env parsing)
export type LlmProviderName = 'bedrock' | 'ollama';
export type EmbeddingProviderName = 'bedrock' | 'ollama';

export type OllamaConfig = {
  /** Always ends in `/api`, as the adapter requires. */
  baseURL: string;
  /** `OLLAMA_MODEL`, default `llama3.1`. */
  model: string;
  /** `OLLAMA_NUM_CTX`, default 16384. */
  numCtx: number;
};

export const DEFAULT_OLLAMA_NUM_CTX = 16_384;

export function getLlmProviderName(): LlmProviderName;          // throws on unknown / unimplemented
export function getOllamaConfig(): OllamaConfig;                 // throws on invalid OLLAMA_NUM_CTX
export function normalizeOllamaBaseURL(raw: string | undefined): string;
```

```typescript
// src/llm/provider.ts
import type { EmbeddingModel, LanguageModel } from 'ai';

export function getModel(): LanguageModel;                       // switches on LLM_PROVIDER

/** Provider + model actually in use, for logging. */
export function getModelInfo(): { provider: LlmProviderName; modelId: string };

/**
 * Context window sent to the provider, in tokens, or null when the provider
 * manages it itself (Bedrock).
 */
export function getContextWindow(): number | null;

/** CHANGED signature: provider is now explicit. */
export function getEmbeddingModel(
  provider: EmbeddingProviderName,
  modelId: string,
): EmbeddingModel;
```

```typescript
// src/llm/embedding-provider.ts
export class BedrockEmbeddingProvider { /* unchanged */ }

export class OllamaEmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  constructor(modelId?: string, dimensions?: number);   // default nomic-embed-text / 768
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export const OLLAMA_EMBEDDING_DIMENSIONS: Readonly<Record<string, number>>;
// { 'nomic-embed-text': 768, 'mxbai-embed-large': 1024, 'all-minilm': 384 }

export function getEmbeddingProvider():
  BedrockEmbeddingProvider | OllamaEmbeddingProvider | null;
```

```typescript
// src/llm/errors.ts
/**
 * Returns a GM-readable explanation for connection and missing-model failures
 * from any provider, or undefined when the error is not one we recognise.
 */
export function describeProviderError(error: unknown): string | undefined;
```

Both embedding classes satisfy `EmbeddingProvider` (`src/vault/`) structurally; `src/llm/`
still does not import from `src/vault/`.

---

## Sequence / flow

**Chat generation with Ollama**

1. `.env`: `LLM_PROVIDER=ollama`, `OLLAMA_MODEL=qwen3`, `OLLAMA_NUM_CTX=32768`.
2. `GenerationSession.create()` calls `getModel()` (`src/llm/provider.ts`).
3. `getLlmProviderName()` returns `ollama`; `getOllamaConfig()` validates
   `OLLAMA_NUM_CTX` and normalises the URL to `http://localhost:11434/api`.
4. `provider.ts` builds `createOllama({ baseURL })(model)` and wraps it:
   `wrapLanguageModel({ model, middleware: defaultSettingsMiddleware({ settings:
   { providerOptions: { ollama: { options: { num_ctx } } } } }) })`.
5. `create()` then calls `getContextWindow()`; if the context-budget ceiling plus
   `RESERVED_TOKENS` exceeds it, it logs a `warn` with both numbers. It logs
   `getModelInfo()` at `info`.
6. `ToolLoopAgent.stream()` runs unchanged. Every step reaches Ollama with
   `options.num_ctx` set. Usage comes back through the normal `totalUsage`.
7. On failure the CLI catch block calls `describeProviderError(error)` and prints
   that message instead of the raw error when it returns a string.

**Semantic search with Ollama**

1. `EMBEDDING_PROVIDER=ollama`, optional `EMBEDDING_MODEL_ID`, `EMBEDDING_DIMENSIONS`.
2. `getEmbeddingProvider()` resolves the model and its dimension (table, then
   override, otherwise throw) and returns `OllamaEmbeddingProvider`.
3. `embed`/`embedMany` call `getEmbeddingModel('ollama', modelId)` and the SDK
   `embed`/`embedMany`.
4. `VaultEmbeddings.isStale()` already compares `provider.modelId` with stored
   metadata, so switching from Titan to `nomic-embed-text` flags the index stale
   and `/index rebuild` regenerates it. No change in `src/vault/`.

---

## Design decisions

### Decision 1: Inject `num_ctx` with a language-model middleware in `provider.ts`
**Chosen:** `wrapLanguageModel` + `defaultSettingsMiddleware` with
`providerOptions.ollama.options.num_ctx`, applied only to the Ollama branch.
**Alternatives considered:**
- *Pass `providerOptions` in `ToolLoopAgent` / `stream()` calls:* works, but puts an
  Ollama-specific key into `src/agent/`, which the invariants forbid.
- *`createOllama().chat(id, { options: { num_ctx } })`:* the type accepts it, but
  the 4.0.1 implementation ignores constructor settings (verified in `dist`).
- *Run through Ollama's OpenAI-compatible endpoint:* cannot set `num_ctx` at all.
**Rationale:** One place, no leakage, covered by one test that inspects the options
the adapter receives. Caveat: if a call supplies its own `providerOptions.ollama`,
the middleware must merge rather than replace; a test covers this.
> **ADR candidate:** No

### Decision 2: Default `num_ctx` is 16384; `OLLAMA_NUM_CTX` overrides
**Chosen:** `DEFAULT_OLLAMA_NUM_CTX = 16_384`, sent on every request, logged at `info`.
**Alternatives considered:** leave Ollama's default (2k to 4k, silently truncates the
vault context: the original problem); require the GM to set it (hostile first run);
auto-detect from `/api/show` (extra request and parsing, deferred).
**Rationale:** Fits the default 8000-token budget plus prompt and output, and runs on
a typical 16 GB machine with an 8B model. Higher values cost memory.
> **ADR candidate:** No

### Decision 3: Validate budget against the window; do not derive it
**Chosen:** `getContextWindow()` exposes the window; `GenerationSession.create()`
warns when `ceiling + RESERVED_TOKENS > window` (`RESERVED_TOKENS = 4096`, covering
system prompt, template and output). The two settings stay independent.
**Alternatives considered:** derive `CONTEXT_BUDGET_TOKENS = window - reserved` (removes
an explicit knob and changes behaviour for existing users); hard-fail on mismatch
(too strict, as models differ in how much they need).
**Rationale:** Surfaces the mismatch that silently truncates, with no behaviour change.
The check lives in `src/agent/` because only it knows the budget, and `src/agent/`
may import `src/llm/`. It is skipped when a model is injected (tests).
> **ADR candidate:** No

### Decision 4: `OLLAMA_BASE_URL` is the server root; `/api` is appended
**Chosen:** `normalizeOllamaBaseURL` strips trailing slashes and appends `/api` unless
already present.
**Alternatives considered:** require users to include `/api` (contradicts the existing
`.env.example` and Ollama's own docs, and fails with a confusing 404).
**Rationale:** Matches what GMs already know (`http://localhost:11434`).
> **ADR candidate:** No

### Decision 5: Embedding dimension from a known-model table, with an override
**Chosen:** `OLLAMA_EMBEDDING_DIMENSIONS` table; `EMBEDDING_DIMENSIONS` overrides it;
an unknown model without the override throws at startup with the fix in the message.
**Alternatives considered:** probe by embedding a test string at startup (needs an
async factory and a running server just to construct the provider, which breaks the
synchronous `getEmbeddingProvider()` contract used by two CLIs); store no dimension
(the interface requires it).
**Rationale:** Keeps `EmbeddingProvider` unchanged and failures early and explicit.
Probing can come later without changing callers if the factory is made async then.
> **ADR candidate:** No

### Decision 6: `getEmbeddingModel` takes the provider explicitly
**Chosen:** `getEmbeddingModel(provider, modelId)`; callers pass `'bedrock'` or `'ollama'`.
**Alternatives considered:** keep `(modelId)` and read `EMBEDDING_PROVIDER` inside
(hidden env dependency, awkward to test); a second function per provider (more
exports, same adapter import rule).
**Rationale:** Explicit and testable. This changes the signature introduced by
v03-ai-sdk-7; its two call sites and tests are updated in this sprint.
> **ADR candidate:** No

### Decision 7: Only `config.ts` is adapter-free env logic; `provider.ts` stays the only adapter importer
**Chosen:** env parsing and validation live in `src/llm/config.ts` and are unit-tested
without mocking any adapter; `provider.ts` imports `@ai-sdk/amazon-bedrock` and
`ollama-ai-provider-v2`. The boundary test checks both packages.
**Alternatives considered:** put everything in `provider.ts` (large, hard to test
validation without adapters).
**Rationale:** Keeps the "single file imports adapters" invariant intact and
testable.
> **ADR candidate:** No

### Decision 8: Error translation in `src/llm/errors.ts`, applied by the CLI
**Chosen:** `describeProviderError` recognises connection refusal/unreachable
(`APICallError` whose cause code is `ECONNREFUSED`/`ENOTFOUND`, or message
`Cannot connect to API`) and Ollama's 404 `model "x" not found, try pulling it first`,
returning a message that names `OLLAMA_BASE_URL` / `ollama pull <model>`. The CLI uses
it in the generate/reply catch blocks and around `/index` operations.
**Alternatives considered:** a language-model middleware that rewrites errors (hides the
original error from logs and callers); handling in `src/agent/` (agent should not
format user messages).
**Rationale:** Smallest surface, original error stays in the logs, and only the display
changes. Matching is by structure first, message text second, so a wording change in
Ollama degrades to the raw error rather than breaking.
> **ADR candidate:** No

### Decision 9: Document and amend ADR-004 rather than add an ADR
**Chosen:** Amend ADR-004 (embeddings now Bedrock or Ollama; the "no Ollama dependency"
rationale no longer holds) and add a one-line note to ADR-001 that `LLM_PROVIDER`
selects Bedrock or Ollama.
**Alternatives considered:** a new ADR-008 superseding ADR-004.
**Rationale:** The decision is an extension, and the amendment style is already used.
> **ADR candidate:** Yes (amendment above)

---

## Test strategy

Follows ADR-005/006: Vitest, adapters mocked, no live Ollama server.

- **`config.test.ts`:** provider selection (unset, `bedrock`, `ollama`, `anthropic` →
  not-implemented error, junk → unknown-provider error listing supported values);
  `OLLAMA_NUM_CTX` default, valid, `abc`, `0`, `-5`; `normalizeOllamaBaseURL`
  (with/without trailing slash, with/without `/api`, unset → default).
- **`provider.test.ts`:** mock `ollama-ai-provider-v2` and `ai`'s
  `wrapLanguageModel`; assert `createOllama` receives the normalised URL, the model ID
  is passed through, and the middleware settings carry `num_ctx`. A second case invokes
  the wrapped model's `doGenerate` with and without call-level
  `providerOptions.ollama` and asserts `num_ctx` reaches the underlying mock and
  call-level keys are preserved. Bedrock default path unchanged. `getContextWindow()`
  returns the window for Ollama and `null` for Bedrock. `getEmbeddingModel` covers both
  providers.
- **`embedding-provider.test.ts`:** Ollama provider selected, default model/dimension,
  table lookup, override, unknown-model failure, unknown provider message lists both,
  `embed`/`embedMany` call `getEmbeddingModel('ollama', modelId)`, empty `embedMany`.
- **`errors.test.ts`:** connection-refused and model-not-found shapes produce the
  specified messages; unrelated errors return `undefined`.
- **`generation-loop.integration.test.ts`:** budget-vs-window warning logged when the
  budget is too large and not logged otherwise (logger spied); usage still normalised
  when the mock reports no token counts.
- **`provider-boundary.test.ts`:** assert `@ai-sdk/amazon-bedrock` and
  `ollama-ai-provider-v2` are imported only from `src/llm/provider.ts`.
- **Re-index scenario (vault test):** a `VaultEmbeddings` built with a Titan-ID
  provider reports stale for an Ollama-ID provider. (Existing behaviour; one assertion
  added to lock acceptance criterion 3.)
- **Fixture vault:** no changes needed.
- **Manual smoke (not CI):** documented in `setup.md`: pull `llama3.1` and
  `nomic-embed-text`, run `/index rebuild`, generate an NPC, confirm no truncation
  warning and token line printed.

---

## Out of scope / deferred

- Anthropic direct provider; cost estimation; auto-detecting the model's context
  window via `/api/show`; async embedding-dimension probing; auto-pulling models;
  per-command model switching.
- Streaming of "thinking" output (`think` option) for reasoning models: not exposed.
- Moving `getLogger` use out of `src/llm/` (already accepted in v03-ai-sdk-7).

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Does `defaultSettingsMiddleware` merge call-level `providerOptions` with defaults or replace them? | Merge (SDK docs say call params win per key). Verified by a test written first (TDD); if it replaces, we write a tiny custom `transformParams` middleware instead. | Task: provider spike |
| Is `RESERVED_TOKENS = 4096` enough for system prompt + template + output? | Yes for the shipped templates; it only drives a warning. | Revisit if warnings prove noisy |
| Exact shape of the error Ollama/`ai` raises for an unreachable server and for a missing model on `ai@7`. | `APICallError` with `cause.code` / status 404 and the text shown above. | Task: errors spike with a recorded sample; fall back to message matching |
| Default chat model name. | `llama3.1` (supports tools); docs recommend `qwen3` as an alternative. | Smoke test |
| Is `src/utils/logger.ts` usable from `src/llm/config.ts`? | Yes, as already assumed in v03-ai-sdk-7. | Architecture rules clarification (optional) |
