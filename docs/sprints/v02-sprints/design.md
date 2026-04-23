# v0.2 Sprint Design: Semantic Search via Embeddings

---

## Overview

v0.2 adds three new source files and extends four existing ones. The
embedding pipeline follows the same structural pattern as the BM25 pipeline
from v0.1: a new vault-layer class handles indexing and search; a new agent-
layer tool factory exposes it to the LLM.

---

## Module Map

```
src/vault/
  note-chunker.ts          ← NEW: splits notes into embedding chunks
  embedding-provider.ts    ← NEW: EmbeddingProvider interface + BedrockEmbeddingProvider
  vault-embeddings.ts      ← NEW: VaultEmbeddings (cosine similarity, persistence)
  vault-reader.ts          ← unchanged
  vault-index.ts           ← unchanged

src/agent/
  tools.ts                 ← EXTENDED: createSemanticSearchTool, createHybridSearchTool
  generation-loop.ts       ← EXTENDED: vaultEmbeddings + embeddingProvider options,
                                        buildSearchTools() helper

src/cli/
  index.ts                 ← EXTENDED: CliDeps, /index commands, /generate warnings, main()
```

---

## Key Interfaces

### `EmbeddingProvider` (src/vault/embedding-provider.ts)

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly modelId: string;
}
```

`BedrockEmbeddingProvider` is the only concrete implementation. Uses Vercel AI
SDK `embed()` / `embedMany()` from `'ai'` with `bedrock.embeddingModel()` from
`'@ai-sdk/amazon-bedrock'`.

`getEmbeddingProvider()` reads `EMBEDDING_PROVIDER` env var and returns `null`
when absent (semantic search disabled).

### `NoteChunk` (src/vault/note-chunker.ts)

```typescript
type NoteChunk = { noteName: string; chunkIndex: number; chunkText: string };
```

`chunkNote(noteName, content, maxChunkChars?)` — pure function, no I/O.
Split points: H2/H3 heading boundaries, then paragraph boundaries for
sections > 1500 chars. Chunks < 50 chars discarded.

### `VaultEmbeddings` (src/vault/vault-embeddings.ts)

Mirrors `VaultIndex` exactly:

| Method | Behaviour |
|--------|-----------|
| `static build(vaultRoot, provider, batchSize?)` | Chunk all notes, batch-embed via `provider.embedMany()`, persist |
| `static load(vaultRoot)` | Load from `.lorecraft/`; `null` if absent |
| `update(vaultRoot, provider)` | Incremental: mtime-based change detection |
| `isStale(vaultRoot, provider?)` | `true` on file changes or `modelId` mismatch |
| `search(queryVector, limit?)` | Cosine similarity, best chunk per note |
| `searchByText(query, provider, limit?)` | `provider.embed(query)` then `search()` |
| `get stats` | `{ noteCount, indexedAt, modelId }` |

Persistence: `.lorecraft/embeddings.json` (chunk array) + `.lorecraft/embeddings-meta.json`
(mtime map, model ID, dimensions).

Model change detection: if `meta.modelId !== provider.modelId`, `isStale()` returns
`true` (all vectors are in a different space; full rebuild required).

---

## Hybrid Search: RRF Formula

`reciprocalRankFusion(bm25Results, semanticResults, k=60)` (in `tools.ts`):

```
score(note) = 1/(k + bm25_rank + 1) + 1/(k + semantic_rank + 1)
```

Notes appearing in both lists accumulate two terms; notes in only one list get
one term. Results sorted descending. Budget-gated before returning.

---

## Tool Auto-Selection Logic (`generation-loop.ts`)

`buildSearchTools(options, budget)` returns the appropriate partial `SessionTools`:

```
vaultIndex + vaultEmbeddings + embeddingProvider  →  { hybrid_search }
vaultEmbeddings + embeddingProvider               →  { semantic_search }
vaultIndex                                        →  { keyword_search }
(none)                                            →  {}
```

The `wikilink_resolve` tool is always present (unchanged from MVP).

---

## CLI Changes

`CliDeps` gains:
- `vaultEmbeddings?: VaultEmbeddings | null`
- `embeddingProvider?: EmbeddingProvider | null`

`main()` initialises both after loading `VaultIndex`. The `/index rebuild`
handler in `main()` (mutable reference pattern, unchanged) now also calls
`VaultEmbeddings.build()` when a provider is configured.

`processCommand` handles `/index status` and `/index refresh` with embedding
awareness via the injected deps.

---

## Test Strategy

| Test file | Scope |
|-----------|-------|
| `src/vault/note-chunker.test.ts` | Unit — chunking algorithm, edge cases |
| `src/vault/embedding-provider.test.ts` | Unit — factory, Bedrock calls mocked |
| `src/vault/vault-embeddings.test.ts` | Unit — build/load/search/isStale/update; mock provider |
| `src/agent/tools.test.ts` | Unit — semantic + hybrid tools; mock embeddings + budget |
| `src/__tests__/agent-vault.integration.test.ts` | Integration — semantic/hybrid session wiring |
| `src/__tests__/cli.integration.test.ts` | Integration — embedding warnings, /index commands |

Mock embedding provider: deterministic 3-dim vectors seeded by text length.
Real Bedrock calls never happen in CI.

---

## Fixture Vault Addition

`src/__tests__/fixtures/test-vault/Locations/Sea Spirits.md` — lore note about
spectral sailors near the docks. Thematically adjacent to the harbor but
uses no keywords matching existing notes. Demonstrates semantic search
surfacing content that keyword search would miss.
