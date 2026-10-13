# Requirements — v02-sprint-ollama: Ollama provider (chat + embeddings)

> **Status:** Approved
> **Sprint:** v02-sprint-ollama
> **Created:** 2026-10-13
> **Revised:** 2026-10-13 (rebased on `main` after v03-ai-sdk-7: `ai` 7.x, embedding provider moved to `src/llm/`)
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
   server at `OLLAMA_BASE_URL` (used as given, e.g. `http://localhost:11434/api`; when unset the adapter default applies) using
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
6. `src/agent/`, `src/cli/` and `src/vault/` contain no Ollama-specific imports;
   the Ollama adapter is imported only inside `src/llm/provider.ts`. The existing
   `src/__tests__/provider-boundary.test.ts` is extended to enforce this for the
   Ollama adapter, as it already does for Bedrock.

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

1. `getEmbeddingProvider()` (in `src/llm/embedding-provider.ts`) returns an
   Ollama-backed provider when `EMBEDDING_PROVIDER=ollama`, using
   `EMBEDDING_MODEL_ID` (default `nomic-embed-text`) against `OLLAMA_BASE_URL`.
   The Ollama embedding model is obtained through `getEmbeddingModel()` in
   `src/llm/provider.ts`, which gains Ollama support alongside Bedrock.
   Its return type satisfies the `EmbeddingProvider` interface in
   `src/vault/embedding-provider.ts` structurally (no import from `src/vault/`).
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

1. After a generation or follow-up with Ollama, the CLI prints input/output/total
   tokens as it does for Bedrock, taken from the `ai` 7 `totalUsage`.
2. If the adapter returns no usage numbers, tokens are reported as 0 without
   crashing (`normalizeUsage` behaviour verified by a test).
3. No cost line is added: the CLI does not estimate cost for any provider today
   (see out of scope), so there is nothing provider-specific to fix.

---

**As a** developer, **I want** the setup docs and decision records updated **so
that** the new provider is discoverable and the architecture docs are
accurate.

1. `.env.example` and `docs/development/setup.md` document `OLLAMA_BASE_URL`
   (with the `/api` suffix the adapter requires),
   `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `EMBEDDING_PROVIDER=ollama`, and the
   recommended models.
2. `docs/architecture/decisions.md` records the decision (ADR-004 amended or a
   new ADR supersedes its "no Ollama dependency" rationale).
3. `docs/sprints/overview.md` lists this sprint.

---

## Out of scope

- **Anthropic direct provider** (`LLM_PROVIDER=anthropic`). Documented but
  separate; same pattern, own sprint.
- **Cost estimation.** The "estimated cost" half of the token-reporting invariant
  is not implemented for any provider (the CLI prints tokens only). Adding it is
  a separate piece of work; Ollama's cost would simply be $0.
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
- The repo is on `ai` 7.x (`~7.0.137`) with dependencies pinned by tilde range and
  no `latest` (v03-ai-sdk-7). The adapter is `ollama-ai-provider-v2` 4.x (peer
  `ai ^7`), added with a `~` range; 3.x is for `ai` 5/6 and must not be used.
- Provider-adapter imports live only in `src/llm/provider.ts` (enforced by
  `src/__tests__/provider-boundary.test.ts`); `src/llm/embedding-provider.ts`
  reaches adapters only through `getEmbeddingModel()`.
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
| 1 | ~~Which `ai` major?~~ **Resolved:** `main` is on `ai` 7.0.x / Bedrock 5.0.x. | Use `ollama-ai-provider-v2@~4.0.1` (peer `ai ^7`); to be verified against the installed `ai` version in the design phase. | Adapter 4.x may lag a minor `ai` 7 API; check at install. |
| 2 | How should the context window be configured and what is the default `num_ctx`? | `OLLAMA_NUM_CTX` env var; default **16384** when unset. | Too low truncates; too high can exhaust RAM/VRAM on small machines. |
| 3 | Should `num_ctx` drive the budget (derive `CONTEXT_BUDGET_TOKENS` from it) or just validate it? | Validate only: warn if budget + headroom exceeds `num_ctx`; the two stay independent settings. | A silent mismatch recreates the truncation problem; deriving removes an explicit knob some users want. |
| 4 | How do we learn the embedding dimension? `EmbeddingProvider.dimensions` is a synchronous property; Titan's is hardcoded. | Known-model table (`nomic-embed-text` = 768, `mxbai-embed-large` = 1024, `all-minilm` = 384) plus optional `EMBEDDING_DIMENSIONS` override; unknown model without override fails fast. | Wrong dimension corrupts index metadata; probing at runtime would need an async API change. |
| 5 | ~~Where may the Ollama embedding adapter be imported?~~ **Resolved:** v03-ai-sdk-7 moved embeddings to `src/llm/embedding-provider.ts` and the adapter to `src/llm/provider.ts`. | Ollama follows the same layout; no deviation from the invariant remains. | None. |
| 6 | ~~Cost reporting~~ **Resolved:** no cost estimator exists for any provider. | Out of scope; no change. | None. |
| 7 | Recommended chat models? | Document `llama3.1`/`qwen3` class models that support tool calling, with a manual smoke test. | Chosen model may not call tools reliably. |
| 8 | Sprint ID and layout. The sibling sprint is now `v03-ai-sdk-7`. | Keep `v02-sprint-ollama`; rename to `v03-ollama` if you prefer to follow the new prefix. | Cosmetic. |
| 9 | ADR handling. ADR-004 already carries a v03-ai-sdk-7 amendment note. | Amend ADR-004 again (Ollama embeddings now supported, rationale no longer "no Ollama dependency"), and mention the chat provider switch in ADR-001. | Cosmetic. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-004: Amazon Bedrock embeddings (to be amended)
- `docs/vision/lorecraft-prfaq.md`: Ollama listed as a supported provider;
  local embeddings (`nomic-embed-text`) named the recommended default for the
  local-first principle
- `.claude/rules/architecture.md`: module boundary rules
- v03-ai-sdk-7 sprint: `docs/sprints/v03-ai-sdk-7/` (`ai` 7, dependency pinning,
  embedding provider move)
- Existing code: `src/llm/provider.ts` (`getModel()`, `getEmbeddingModel()`),
  `src/llm/embedding-provider.ts` (`getEmbeddingProvider()`),
  `src/vault/embedding-provider.ts` (`EmbeddingProvider` interface),
  `src/__tests__/provider-boundary.test.ts`,
  `src/agent/generation-loop.ts` (budget, `normalizeUsage`)
- Adapter: `ollama-ai-provider-v2` (`options.num_ctx` is supported as a provider
  option)
