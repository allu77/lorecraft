# Tasks — v02-sprint-ollama: Ollama provider (chat + embeddings)

> **Status:** Not started
> **Sprint:** v02-sprint-ollama
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/v02-sprint-ollama/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Test first: each `[test]` task is written (and seen failing) before the
   implementation task it covers; both land in the same commit
5. Run `pnpm typecheck && pnpm lint && pnpm test` before marking a task done
6. Commit after each completed task with the task ID in the message:
   `git commit -m "v02-sprint-ollama-NNN: <description>"`
7. Check the box in this file after the commit

---

## Tasks

### Setup

- [x] 001 — Verify baseline is green on `main` (`pnpm typecheck`, `lint`, `test`, `build`) and note the counts in the commit message
- [x] 002 — Add the adapter: `pnpm add ollama-ai-provider-v2@~4.0.1` (`package.json`, `pnpm-lock.yaml`)
  - Confirm no peer-dependency warnings against `ai` 7.0.x

### Configuration (`src/llm/config.ts`)

- [x] 003 — [test] Config unit tests written first (`src/llm/config.test.ts`)
  - `LLM_PROVIDER`: unset → `bedrock`; `bedrock`; `ollama`; `anthropic` → "not implemented" error; junk → unknown-provider error listing `bedrock`, `ollama`
  - `OLLAMA_NUM_CTX`: default 16384; valid; `abc`, `0`, `-5`, `1.5` → clear error
  - `OLLAMA_BASE_URL` passed through unchanged; unset → `undefined`; `OLLAMA_MODEL` default `llama3.1`
- [x] 004 — Implement `getLlmProviderName()`, `getOllamaConfig()`, `DEFAULT_OLLAMA_NUM_CTX`, types (`src/llm/config.ts`)

### Chat provider (`src/llm/provider.ts`)

- [ ] 005 — [test] Provider tests written first (`src/llm/provider.test.ts`)
  - Mock `ollama-ai-provider-v2`; assert `createOllama` gets the base URL (or none) and the model ID
  - Invoke the wrapped model's `doGenerate`: `num_ctx` reaches the inner mock; call-level `providerOptions.ollama` keys are preserved (spike: does `defaultSettingsMiddleware` merge? if not, switch to a `transformParams` middleware)
  - Bedrock path unchanged when `LLM_PROVIDER` is unset
  - `getModelInfo()` and `getContextWindow()` (Ollama → window, Bedrock → `null`)
- [ ] 006 — Implement the `LLM_PROVIDER` switch, `num_ctx` middleware, `getModelInfo()`, `getContextWindow()`; log the effective `num_ctx` at `info` (`src/llm/provider.ts`)
- [ ] 007 — [test] Extend the boundary test to assert both `@ai-sdk/amazon-bedrock` and `ollama-ai-provider-v2` are imported only from `src/llm/provider.ts` (`src/__tests__/provider-boundary.test.ts`)

### Embeddings

- [ ] 008 — [test] Embedding provider tests written first (`src/llm/embedding-provider.test.ts`)
  - `EMBEDDING_PROVIDER=ollama` returns `OllamaEmbeddingProvider`; default `nomic-embed-text` / 768
  - Table lookup, `EMBEDDING_DIMENSIONS` override, unknown model without override → error with the fix
  - Unknown provider error lists `bedrock` and `ollama`
  - `embed` / `embedMany` call `getEmbeddingModel('ollama', modelId)`; empty `embedMany` returns `[]`
  - Existing Bedrock cases updated for the new `getEmbeddingModel(provider, modelId)` signature
- [ ] 009 — Change `getEmbeddingModel` to `(provider, modelId)` with Ollama support; add `OllamaEmbeddingProvider`, `OLLAMA_EMBEDDING_DIMENSIONS`, and the `ollama` branch of `getEmbeddingProvider()` (`src/llm/provider.ts`, `src/llm/embedding-provider.ts`)
  - Update the Bedrock call sites to pass `'bedrock'`
- [ ] 010 — [test] A `VaultEmbeddings` built with a Titan model ID reports stale for an Ollama model ID provider (`src/vault/vault-embeddings.test.ts`)

### Errors and agent integration

- [ ] 011 — [test] `describeProviderError` tests written first (`src/llm/errors.test.ts`)
  - Spike: capture the real error shapes from `ai` 7 + the adapter for connection refused and missing model (mocked `fetch`), and use them as fixtures
  - Unrecognised errors return `undefined`
- [ ] 012 — Implement `describeProviderError` (`src/llm/errors.ts`)
- [ ] 013 — [test] Generation-loop tests written first (`src/__tests__/generation-loop.integration.test.ts`)
  - Warning logged when budget + 4096 exceeds the window; none when it fits; skipped when a model is injected
  - Token usage normalised to 0 when the model reports no counts
- [ ] 014 — Log `getModelInfo()` instead of `MODEL_ID` and add the budget-vs-window warning (`src/agent/generation-loop.ts`)
- [ ] 015 — [test] CLI shows the translated message for generate/reply and `/index` failures (`src/__tests__/cli.integration.test.ts`)
- [ ] 016 — Use `describeProviderError` in the CLI error paths, including `/index rebuild|refresh|status` (`src/cli/index.ts`, `src/cli/inspect.ts` if it calls the provider)

### Integration

- [ ] 017 — Full run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; confirm `src/agent/`, `src/cli/`, `src/vault/` contain no Ollama imports (boundary test green)
- [ ] 018 — Manual smoke test against a real Ollama (not CI): pull `llama3.1` and `nomic-embed-text`, `/index rebuild`, `/generate` an NPC; confirm `num_ctx` in Ollama's log, tool calls work, token line printed; record the result in the sprint notes below

### Documentation and wrap-up

- [ ] 019 — Update `.env.example` and `docs/development/setup.md`: `OLLAMA_BASE_URL=http://localhost:11434/api`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `EMBEDDING_PROVIDER=ollama`, `EMBEDDING_MODEL_ID`, `EMBEDDING_DIMENSIONS`, recommended models, smoke-test steps (`.env.example`, `docs/development/setup.md`)
- [ ] 020 — Amend ADR-004 (Bedrock or Ollama embeddings) and add the ADR-001 note on `LLM_PROVIDER` (`docs/architecture/decisions.md`)
- [ ] 021 — Update fixture vault if new note types were introduced: none expected (`src/__tests__/fixtures/test-vault/`)
- [ ] 022 — Update `docs/sprints/overview.md` to mark sprint complete (`docs/sprints/overview.md`)

---

## Blocked tasks

| Task | Blocked by | Since |
|---|---|---|
| | | |

---

## Discovered during sprint

<!-- Log bugs, scope changes, and new tasks here rather than adding ad-hoc checkboxes above.
- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->

---

## Smoke test notes

<!-- Task 018: model versions, machine, num_ctx used, results. -->
