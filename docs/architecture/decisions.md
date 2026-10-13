# Architecture Decision Records

## ADR-001: Vercel AI SDK as the agentic framework
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** Needed a TypeScript-native agentic framework with provider
  abstraction, streaming, and human-in-the-loop support.
- **Decision:** Use Vercel AI SDK. Bedrock via `@ai-sdk/amazon-bedrock`
  as the default provider. Switching providers requires changing one import
  and one env var. *Amended 2026-10-13 (v03-ai-sdk-7):* `ai`,
  `@ai-sdk/amazon-bedrock` and `zod` are pinned with `~` ranges (currently
  `ai` 7.0.x, Bedrock provider 5.0.x) instead of `latest`; major upgrades happen
  as explicit sprints. Node.js 22+ is required. *Amended 2026-10-13
  (v02-sprint-ollama):* `LLM_PROVIDER` selects Amazon Bedrock (default) or Ollama
  (`ollama-ai-provider-v2`); both adapters are imported only in `src/llm/provider.ts`
  and the Ollama context window (`OLLAMA_NUM_CTX`) is injected there as `num_ctx`
  through a language-model middleware.
- **Consequences:** Not tied to AWS-specific deployment. Strands Agents SDK
  may be revisited at v0.3 (multi-agent) once its TypeScript SDK stabilises.
  Patch updates need a periodic bump; the lockfile and the test suite gate them.

---

## ADR-002: Single package, monorepo-ready boundaries
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** Turborepo monorepo adds overhead not justified for an MVP.
- **Decision:** Single pnpm package. Internal module boundaries enforced
  manually: `src/vault/`, `src/agent/`, `src/llm/`, `src/cli/`. Turborepo
  migration triggered when the web UI (v0.4) introduces shared packages.
  At that point `src/vault/`, `src/agent/`, and `src/llm/` become
  `packages/core`; `src/cli/` becomes `packages/cli`.
- **Consequences:** Migration cost is low if boundaries are respected.
  Enforce via `.claude/rules/architecture.md` and code review.

---

## ADR-003: Vault writes require explicit GM approval
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** Autonomous writes to a vault the GM considers source of truth
  would be destructive if wrong.
- **Decision:** Read operations (wikilink resolution, context gathering) are
  always autonomous. Write operations always require a confirmation step
  before any filesystem mutation.
- **Consequences:** MVP output is copy-pasted manually. Direct writes land in
  v0.4 behind the approval gate.

---

## ADR-004: Embeddings for semantic search: Amazon Bedrock or Ollama (v0.2)
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** Semantic search requires an embedding model. The project already
  uses Amazon Bedrock for LLM inference; adding a local Ollama dependency for
  embeddings would increase setup complexity without clear benefit.
- **Decision:** Use Amazon Bedrock for embeddings (`amazon.titan-embed-text-v2:0`
  by default). Enabled via `EMBEDDING_PROVIDER=bedrock` env var; absent means
  semantic search is disabled. Model override via `EMBEDDING_MODEL_ID`. The
  abstraction (`EmbeddingProvider` interface in `src/vault/embedding-provider.ts`)
  makes alternative providers straightforward to add later. *Amended 2026-10-13
  (v03-ai-sdk-7):* the Bedrock implementation (`BedrockEmbeddingProvider`,
  `getEmbeddingProvider()`) lives in `src/llm/embedding-provider.ts` and reaches the
  adapter only through `getEmbeddingModel()` in `src/llm/provider.ts`, so
  `src/vault/` has no dependency on `src/llm/`. *Amended 2026-10-13
  (v02-sprint-ollama):* `EMBEDDING_PROVIDER=ollama` is also supported
  (`OllamaEmbeddingProvider`, default `nomic-embed-text`, 768 dimensions), so the
  original "no local Ollama dependency" rationale no longer holds: a GM can run
  fully local. Output dimensions come from a known-model table with an
  `EMBEDDING_DIMENSIONS` override. Changing provider or model changes the stored
  `modelId`, which marks the embedding index stale and forces a rebuild.
- **Consequences:** AWS credentials required (already assumed for LLM). Zero
  new local dependencies. Embedding calls incur Bedrock token costs. Notes are
  chunked before embedding (via `src/vault/note-chunker.ts`) to improve
  retrieval quality for long notes.

---

## ADR-005: Vitest as the testing framework
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** Needed a test framework for a TypeScript-first, Next.js,
  ESM-native project. Jest requires additional transformer configuration
  (`ts-jest` or `@swc/jest`) to work correctly with modern TypeScript and
  native ESM. Vitest is designed for this stack, has Jest-compatible syntax,
  and the Vercel AI SDK ships test utilities (`MockLanguageModelV1`) built
  for it.
- **Decision:** Use Vitest for all unit and integration tests. Add Playwright
  for end-to-end tests when the web UI (v0.4) arrives. No additional
  framework needed before then.
- **Consequences:** Fast CI, no transformer boilerplate, native ESM. Team
  members with Jest experience face minimal learning curve — the API is
  deliberately compatible.

---

## ADR-006: Integration testing strategy
- **Date:** 2026-04-18
- **Status:** Accepted
- **Context:** The highest-risk integration in Lorecraft is not HTTP or
  database plumbing — it is the pipeline from vault traversal through context
  assembly to the prompt sent to the LLM. Bugs there produce subtly wrong
  output rather than hard errors. Standard mocking-heavy unit tests do not
  catch this class of bug.
- **Decision:** Three-layer test strategy, all using Vitest:

  **1. Unit tests** — co-located with source files (`*.test.ts`). Pure logic,
  everything external mocked. Cover individual functions in `src/vault/`,
  `src/agent/`, `src/llm/`.

  **2. Integration tests** — in `src/__tests__/`, using a real fixture vault
  on disk. The fixture vault (`src/__tests__/fixtures/test-vault/`) is a
  small but realistic campaign: a campaign style document, a few linked entity
  notes, and a set of templates. These tests run the full vault traversal +
  context assembly pipeline against real files and assert on the assembled
  context and prompt shape. The LLM is mocked at the provider boundary using
  `MockLanguageModelV1` from the Vercel AI SDK.

  **3. CLI integration tests** — in `src/__tests__/`, spawning the CLI as a
  child process via `execa`, pointing it at the fixture vault, asserting on
  stdout. Catches wiring bugs between the CLI transport layer and the agent
  logic. LLM still mocked.

  **LLM output strategy: prompt snapshots.** Do not assert on LLM responses
  (non-deterministic). Instead, use Vitest snapshot testing (`toMatchSnapshot`)
  on the assembled prompt object sent to the model. This catches context
  assembly regressions — the most important correctness property — without
  requiring a live LLM in CI.

- **Consequences:** The fixture vault becomes a first-class repo asset.
  It must be maintained as the template format and vault conventions evolve.
  Snapshot files (`*.snap`) are committed to the repo and reviewed in PRs
  like any other code change — an unexpected snapshot diff is a signal that
  context assembly behaviour changed.

  **Deferred:** Playwright E2E tests for the web UI (v0.4+). Record/replay
  of real LLM responses (may be added later if prompt snapshot coverage
  proves insufficient).

---

## ADR-007: MiniSearch as the BM25 keyword index
- **Date:** 2026-04-23
- **Status:** Accepted
- **Context:** Notes relevant to a generation request but not linked from anything
  are invisible to the agent. A keyword index over all vault notes would let the
  agent surface these notes during generation. The index algorithm needs to rank
  results by relevance so the best notes reach the LLM first.
- **Decision:** Use MiniSearch for the keyword index. MiniSearch applies BM25+
  scoring by default (the same algorithm as Lucene/Elasticsearch for keyword
  ranking), provides first-class JSON serialization (`toJSON()`/`loadJSON()`),
  an incremental update API (`add`/`remove`/`replace`/`discard`), is ~7 KB
  gzipped with zero native dependencies, and ships built-in TypeScript types.
  Fuse.js targets fuzzy matching, not BM25-ranked full-text search. Orama also
  supports BM25 and hybrid search natively, but adds ~90 KB and is more complex
  than the MVP requires. A custom inverted index would be unnecessary reinvention.
- **Consequences:** MiniSearch index stored locally in `{vaultRoot}/.lorecraft/`.
  When v0.2 adds vector search (ADR-004), BM25 scores from MiniSearch combine
  straightforwardly with vector scores via Reciprocal Rank Fusion.

---

## Test file layout

```
src/
├── vault/
│   ├── wikilink-resolver.ts
│   ├── wikilink-resolver.test.ts       # unit
│   ├── template-parser.ts
│   └── template-parser.test.ts         # unit
├── agent/
│   ├── prompt-builder.ts
│   ├── prompt-builder.test.ts          # unit
│   ├── context-budget.ts
│   └── context-budget.test.ts          # unit
├── llm/
│   ├── provider.ts
│   └── provider.test.ts                # unit
├── cli/
│   └── index.ts
└── __tests__/
    ├── fixtures/
    │   └── test-vault/
    │       ├── Campaign Style.md
    │       ├── NPCs/
    │       │   └── Mira Shadowcloak.md
    │       ├── Factions/
    │       │   └── Thieves Guild.md
    │       └── _templates/
    │           └── npc.md
    ├── agent-vault.integration.test.ts  # vault + agent, real disk, LLM mocked
    └── cli.integration.test.ts          # full CLI invocation, LLM mocked
```
