# Requirements — v02-sprint-ollama: Ollama provider (chat + embeddings)

> **Status:** Draft
> **Sprint:** v02-sprint-ollama
> **Created:** 2026-10-13
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

A GM can run Lorecraft entirely on their own machine. By setting
`LLM_PROVIDER=ollama` and `EMBEDDING_PROVIDER=ollama` they get chat generation
and semantic search from local Ollama models, with no AWS account, no cloud
cost, and no campaign lore leaving the machine. They also control the model's
context window explicitly, so Ollama no longer silently truncates the vault
context that Lorecraft assembles. Amazon Bedrock stays the default and keeps
working unchanged.

---

## User stories

**As a** GM, **I want** to set `LLM_PROVIDER=ollama` **so that** Lorecraft
generates content with a model running on my own machine.

1. With `LLM_PROVIDER=ollama`, `getModel()` returns a model backed by the Ollama
   server at `OLLAMA_BASE_URL` (default `http://localhost:11434`) using
   `OLLAMA_MODEL` (default `llama3`).
2. With `LLM_PROVIDER` unset or `bedrock`, behaviour is identical to today
   (Bedrock, `MODEL_ID`).
3. An unknown `LLM_PROVIDER` value fails fast with an error that lists the
   supported values (`bedrock`, `ollama`).
4. `LLM_PROVIDER=anthropic` (documented in `.env.example` but not implemented)
   fails with an explicit "not implemented" message rather than the generic
   unknown-provider error. *(See out of scope.)*
5. The agent's "model resolved" log line reports the actual provider and model
   in use (today it only logs `MODEL_ID`, which is wrong for Ollama).
6. `src/agent/` and `src/cli/` contain no Ollama-specific imports; the adapter
   is imported only inside `src/llm/provider.ts`.

---

**As a** GM, **I want** to control the Ollama context window **so that** the
model sees all the vault context Lorecraft assembled instead of a silently
truncated prompt.

1. `OLLAMA_NUM_CTX` (positive integer) is sent as `num_ctx` on every Ollama chat
   request.
2. When `OLLAMA_NUM_CTX` is unset, Lorecraft sends a documented default (not
   Ollama's own small default) and logs the value used at `info` level.
3. A non-numeric, zero, or negative `OLLAMA_NUM_CTX` fails fast with a clear
   error.
4. At session start, if the effective context budget
   (`CONTEXT_BUDGET_TOKENS` / `budgetTokens`) plus headroom for the system
   prompt and output exceeds `num_ctx`, Lorecraft logs a warning naming both
   values.
5. The context window setting is applied in one place and covered by a test that
   inspects the request options passed to the adapter.

---

**As a** GM, **I want** to set `EMBEDDING_PROVIDER=ollama` **so that** semantic
search works offline with a local embedding model.

1. `getEmbeddingProvider()` returns an Ollama-backed `EmbeddingProvider` when
   `EMBEDDING_PROVIDER=ollama`, using `EMBEDDING_MODEL_ID` (default
   `nomic-embed-text`) against `OLLAMA_BASE_URL`.
2. `embed` and `embedMany` return vectors whose length equals the provider's
   `dimensions`.
3. `dimensions` and `modelId` are correct for the configured model, so changing
   embedding provider or model invalidates the persisted index and triggers a
   full rebuild (existing `VaultEmbeddings` behaviour; verified by a test, not
   changed).
4. `EMBEDDING_PROVIDER=bedrock` behaviour is unchanged; unknown values still
   throw, and the error message lists both `bedrock` and `ollama`.
5. `/index rebuild` and `pnpm inspect` work with an Ollama-built index.

---

**As a** GM, **I want** clear errors when Ollama is not set up correctly **so
that** I can fix the problem without reading stack traces.

1. If the Ollama server is unreachable, the error names `OLLAMA_BASE_URL` and
   suggests starting Ollama.
2. If the model is not pulled, the error names the model and suggests
   `ollama pull <model>`.
3. These errors surface through the CLI as readable messages for both chat and
   `/index` operations.

---

**As a** GM, **I want** token usage reported for local models too **so that**
the existing "report after every generation" invariant still holds.

1. After a generation with Ollama, the CLI prints input/output/total tokens as
   it does for Bedrock.
2. Estimated cost for Ollama is reported as $0.00 (not a Bedrock price).
3. If the adapter returns no usage numbers, tokens are reported as 0 without
   crashing (`normalizeUsage` behaviour verified by a test).

---

**As a** developer, **I want** the setup docs and decision records updated **so
that** the new provider is discoverable and the architecture docs are
accurate.

1. `.env.example` and `docs/development/setup.md` document `OLLAMA_BASE_URL`,
   `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `EMBEDDING_PROVIDER=ollama`, and the
   recommended models.
2. `docs/architecture/decisions.md` records the decision (ADR-004 amended or a
   new ADR supersedes its "no Ollama dependency" rationale).
3. `docs/sprints/overview.md` lists this sprint.

---

## Out of scope

- **Anthropic direct provider** (`LLM_PROVIDER=anthropic`). Documented but
  separate; same pattern, own sprint.
- **Upgrading `ai` to v7** and the matching `@ai-sdk/amazon-bedrock` major
  (see open questions).
- **Automatic discovery of the model's real context window** via Ollama's
  `/api/show`. The GM sets `OLLAMA_NUM_CTX`; auto-detect is a possible follow-up.
- **Auto-pulling models** or managing the Ollama server.
- **Tool-calling quality guarantees** for local models. We document known-good
  models; we do not work around models that cannot call tools.
- **Per-request/per-command model switching** (e.g. a `/model` slash command).
- **Web UI** configuration (v0.4).
- **Mixing providers beyond what env vars already allow** (e.g. Bedrock chat +
  Ollama embeddings is allowed because the two settings are independent; no
  extra work is planned for it).

---

## Constraints

- Provider selection is a single `.env` change; the swap must not require code
  changes elsewhere (CLAUDE.md core invariant).
- Module boundaries (`.claude/rules/architecture.md`): `src/llm/` imports no
  other `src/` module; `src/vault/` imports none of `src/agent/`, `src/llm/`,
  `src/cli/`.
- The Ollama adapter must be compatible with the installed `ai` major (currently
  6.x): `ollama-ai-provider-v2@^3.6.0` supports `ai` 5 and 6; 4.x requires `ai` 7.
- TypeScript strict mode; follow `docs/development/typescript-rules.md` and the
  style guide; logging only through `getLogger`.
- Tests follow ADR-005/006: no live Ollama server in CI; the adapter is mocked.
- Context budget manager continues to gate all vault traversal (invariant); this
  sprint only adds a consistency check against `num_ctx`.
- Vault is never written without GM approval (unchanged).

---

## Open questions and assumptions

| # | Question | Assumption | Risk if wrong |
|---|---|---|---|
| 1 | Which `ai` major? The latest `ollama-ai-provider-v2` (4.x) needs `ai` 7; the repo is on `ai` 6.0.168 with `@ai-sdk/amazon-bedrock` 4.x. | Stay on `ai` 6 and use `ollama-ai-provider-v2@^3.6.0`. Upgrade to `ai` 7 as its own sprint (it also needs a Bedrock major bump). | Skipping the upgrade leaves us a major behind; upgrading now widens the sprint to touch all Bedrock/agent code. |
| 2 | How should the context window be configured and what is the default `num_ctx`? | `OLLAMA_NUM_CTX` env var; default **16384** when unset. | Too low truncates; too high can exhaust RAM/VRAM on small machines. |
| 3 | Should `num_ctx` drive the budget (derive `CONTEXT_BUDGET_TOKENS` from it) or just validate it? | Validate only: warn if budget + headroom exceeds `num_ctx`; the two stay independent settings. | A silent mismatch recreates the truncation problem; deriving removes an explicit knob some users want. |
| 4 | How do we learn the embedding dimension? `EmbeddingProvider.dimensions` is a synchronous property; Titan's is hardcoded. | Known-model table (`nomic-embed-text` = 768, `mxbai-embed-large` = 1024, `all-minilm` = 384) plus optional `EMBEDDING_DIMENSIONS` override; unknown model without override fails fast. | Wrong dimension corrupts index metadata; probing at runtime would need an async API change. |
| 5 | Where may the Ollama embedding adapter be imported? The invariant says provider code lives in `src/llm/provider.ts`, but `src/vault/` cannot import `src/llm/` and Bedrock embeddings are already in `src/vault/embedding-provider.ts`. | Follow the existing ADR-004 pattern (adapter imported in `src/vault/embedding-provider.ts`). Reconciling the invariant is noted in the ADR update, not refactored here. | Leaves one known deviation from the stated invariant. |
| 6 | Cost reporting: where is the estimator and does it assume Bedrock pricing? | It is a small function in the CLI/agent path; Ollama returns $0 via a provider-aware lookup. | Could be larger than expected if pricing is hard-wired in several places. |
| 7 | Recommended chat models? | Document `llama3.1`/`qwen3` class models that support tool calling, with a manual smoke test. | Chosen model may not call tools reliably. |
| 8 | Sprint ID and layout. | `v02-sprint-ollama` under `docs/sprints/`, matching `v02-sprint-addon`. | Cosmetic. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-004: Amazon Bedrock embeddings (to be amended)
- `docs/vision/lorecraft-prfaq.md`: Ollama listed as a supported provider;
  local embeddings (`nomic-embed-text`) named the recommended default for the
  local-first principle
- `.claude/rules/architecture.md`: module boundary rules
- Existing code: `src/llm/provider.ts`, `src/vault/embedding-provider.ts`,
  `src/agent/generation-loop.ts` (`getModel()`, budget, `normalizeUsage`)
- Adapter: `ollama-ai-provider-v2` (`options.num_ctx` is supported as a provider
  option)
