# Tasks — v02-sprints: Semantic Search via Embeddings

> **Status:** Complete
> **Sprint:** v02-sprints
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

Written after the fact: the core sprint shipped as a single commit (`c7d2bcb`,
"v0.2 — Semantic search via Bedrock embeddings") without a task checklist. This
file records what was delivered and the close-out fixes found when auditing the
implementation against the requirements.

---

## Tasks

### Core implementation (delivered in `c7d2bcb`)

- [x] 001 — `chunkNote()` in `src/vault/note-chunker.ts` + unit tests
- [x] 002 — `EmbeddingProvider` interface (`src/vault/embedding-provider.ts`) and
  `BedrockEmbeddingProvider` / `getEmbeddingProvider()` (now in
  `src/llm/embedding-provider.ts`) + unit tests
- [x] 003 — `VaultEmbeddings` build / load / update / isStale / search / searchByText
  (`src/vault/vault-embeddings.ts`) + unit tests
- [x] 004 — `semantic_search` and `hybrid_search` (RRF, k=60) tools in
  `src/agent/tools.ts` + unit tests
- [x] 005 — `buildSearchTools()` auto-selection in `src/agent/generation-loop.ts`
- [x] 006 — CLI: embedding init in `main()`, `/index rebuild|refresh|status`,
  `/generate` missing/stale warnings + integration tests
- [x] 007 — Fixture note `Locations/Sea Spirits.md`

### Close-out

- [x] 008 — `VaultEmbeddings.update()` re-embeds every note when the provider's
  `modelId` differs from the index's, and adopts the new model ID and dimensions.
  Previously a refresh after a model change mixed vectors from two models and left
  the index permanently stale.
- [x] 009 — [test] Unit test for `update()` across a model change
- [x] 010 — `/generate` names both models when the embedding model changed, instead
  of the generic stale warning; `/help` mentions both indexes + integration test
- [x] 011 — [test] Integration tests assert which search tool is wired
  (`semantic_search` vs `hybrid_search`), not just that generation completes

### Known limitation

- The mock embedding provider derives vectors from text length, so no test shows
  `Sea Spirits` surfacing via semantic search where keyword search misses it.
  That needs a real or hand-crafted embedding fixture; not required for close-out.
