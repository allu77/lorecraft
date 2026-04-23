# v0.2 Sprint Requirements: Semantic Search via Embeddings

**Status:** In Progress  
**ADR:** ADR-004 (Accepted)

---

## Goal

Extend vault search with vector embeddings so the agent can surface
thematically related notes even when they share no keywords with the
generation request. Supplement (not replace) the BM25 keyword search
added in v0.1.

---

## User Stories

### Semantic search during generation
> As a GM, when I run `/generate`, I want the agent to find vault notes that
> are thematically related to my request — even if they don't share keywords
> — so that the generated content is richer and more consistent with my campaign.

### Hybrid search
> As a GM, I want the agent to combine keyword and semantic results automatically,
> so that I get the best of both: exact matches AND thematic relevance.

### Embedding index management
> As a GM, I want `/index rebuild` to build both the BM25 and embedding indexes,
> `/index refresh` to update both, and `/index status` to show embedding index
> health alongside BM25 health.

### Stale embedding warning
> As a GM, if I run `/generate` with an outdated or missing embedding index,
> I want a clear warning so I know to run `/index rebuild`.

---

## Functional Requirements

1. **Chunking**: vault notes are split into semantic chunks before embedding
   (split at H2/H3 headings, then by paragraph if a section exceeds 1500 chars;
   chunks under 50 chars discarded).

2. **Embedding provider**: Amazon Bedrock (`amazon.titan-embed-text-v2:0` by
   default). Enabled via `EMBEDDING_PROVIDER=bedrock`. Model override via
   `EMBEDDING_MODEL_ID`. No new npm packages required.

3. **Vector index**: persisted to `{vaultRoot}/.lorecraft/embeddings.json` +
   `embeddings-meta.json`. Incremental updates supported.

4. **Semantic search tool**: `semantic_search` — embed the query, search by
   cosine similarity, return best chunk per note, budget-gated.

5. **Hybrid search tool**: `hybrid_search` — runs BM25 and semantic search in
   parallel, merges via Reciprocal Rank Fusion (k=60), budget-gated. This
   replaces both separate tools when both indexes are available.

6. **Tool auto-selection in `GenerationSession`**:
   - `vaultIndex` + `vaultEmbeddings` + `embeddingProvider` → `hybrid_search`
   - `vaultEmbeddings` + `embeddingProvider` only → `semantic_search`
   - `vaultIndex` only → `keyword_search` (unchanged from v0.1)
   - neither → wikilink only (unchanged from MVP)

7. **CLI updates**:
   - `/index rebuild` — rebuilds BM25 + embeddings (when configured)
   - `/index refresh` — updates both indexes incrementally
   - `/index status` — shows embedding model ID, note count, freshness
   - `/generate` — warns if embedding index is missing or stale

---

## Out of Scope

- Automatic re-indexing on vault file save (v0.3+)
- Provider support beyond Bedrock (Ollama, OpenAI, etc.) — interface exists,
  implementation deferred
- Embedding cost reporting per generation (deferred)

---

## Constraints

- No new npm packages
- Zero breaking changes to existing CLI or agent API
- Context budget gates all search results (embedding results included)
- Vault access only through `src/vault/` (architecture rule)
