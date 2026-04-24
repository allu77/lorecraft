# Design — v02-sprint-addon: Index Inspector

> **Status:** Draft
> **Sprint:** v02-sprint-addon
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint adds a standalone `pnpm inspect` binary (`src/cli/inspect.ts`) that lets a
developer read both persisted indexes — MiniSearch BM25 (`vault-index.ts`) and vector
embeddings (`vault-embeddings.ts`) — and issue ad-hoc queries against them. Two thin
read-only accessor methods are added to `VaultIndex` and `VaultEmbeddings` to expose
data the inspector needs but that are currently private. No agent or LLM logic is
involved; the inspector is a pure read-and-print tool.

---

## Module Map

```
src/cli/
  inspect.ts                 ← NEW: entry point + exported subcommand handlers

src/vault/
  vault-index.ts             ← unchanged (existing search() method is sufficient)
  vault-embeddings.ts        ← EXTENDED: add getChunks() accessor

package.json                 ← EXTENDED: add "inspect" script
```

No new files in `src/vault/`, `src/agent/`, or `src/llm/`.

---

## Interfaces and Data Types

### New accessor on `VaultEmbeddings`

```typescript
// src/vault/vault-embeddings.ts

/** A single chunk as stored in the embedding index (vectors excluded). */
export type StoredChunkInfo = {
  chunkIndex: number;
  chunkText: string;
};

/**
 * Returns all stored chunks for a note, ordered by chunk index.
 * Returns `null` if the note has no chunks in the index.
 *
 * @param noteName - The note's base filename without extension.
 */
getChunks(noteName: string): StoredChunkInfo[] | null
```

Implementation: filter `this.chunks` by `noteName`, strip `vector` fields, sort by
`chunkIndex`. Return `null` when the filtered list is empty (note not indexed).

### Subcommand handlers in `inspect.ts`

Each handler takes pre-loaded dependencies and returns a formatted string. This keeps the
entry point thin and makes the handlers directly testable without process spawning.

```typescript
// src/cli/inspect.ts

/**
 * Runs BM25, semantic, and hybrid searches and formats results as plain text.
 * Semantic and hybrid are omitted (with a notice) if provider is null.
 *
 * @param query         - Raw query string.
 * @param limit         - Maximum results per list.
 * @param vaultIndex    - Loaded BM25 index, or null if unavailable.
 * @param embeddings    - Loaded embedding index, or null if unavailable.
 * @param provider      - Embedding provider for query embedding, or null.
 */
export async function cmdSearch(
  query: string,
  limit: number,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
  provider: EmbeddingProvider | null,
): Promise<string>

/**
 * Shows how a note is represented in both the BM25 and embedding indexes.
 *
 * @param noteName  - Exact note name (base filename without extension).
 * @param vaultIndex - Loaded BM25 index, or null.
 * @param embeddings - Loaded embedding index, or null.
 */
export function cmdNote(
  noteName: string,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
): string

/**
 * Lists all stored chunks for a note with full text (no truncation).
 *
 * @param noteName  - Exact note name.
 * @param embeddings - Loaded embedding index, or null.
 */
export function cmdChunks(
  noteName: string,
  embeddings: VaultEmbeddings | null,
): string

/**
 * Shows file sizes, note/chunk counts, model metadata, and staleness for
 * both indexes.
 *
 * @param vaultRoot  - Absolute path to the vault root.
 * @param vaultIndex - Loaded BM25 index, or null.
 * @param embeddings - Loaded embedding index, or null.
 */
export async function cmdStats(
  vaultRoot: string,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
): Promise<string>
```

---

## Sequence / Flow

### `pnpm inspect search <query> [--limit N]`

1. `main()` parses argv, resolves `VAULT_ROOT`.
2. `VaultIndex.load(vaultRoot)` → `vaultIndex | null`.
3. `VaultEmbeddings.load(vaultRoot)` → `embeddings | null`.
4. `getEmbeddingProvider()` → `provider | null`.
5. `cmdSearch(query, limit, vaultIndex, embeddings, provider)`:
   a. BM25: `vaultIndex.search(query, limit)` → print ranked list with scores.
   b. Semantic: if `embeddings && provider`, `embeddings.searchByText(query, provider, limit)` → print. Else print omit notice.
   c. Hybrid: if both BM25 and semantic results available, apply inline RRF → print. Else print omit notice.
6. `process.stdout.write(result)`.

### `pnpm inspect note <note-name>`

1. `main()` loads `vaultIndex` and `embeddings` as above.
2. `cmdNote(noteName, vaultIndex, embeddings)`:
   a. BM25 section: `vaultIndex.search(noteName, 50).find(r => r.noteName === noteName)` → show `filePath` and content excerpt (first 300 chars). Returns "not found" if no exact match.
   b. Semantic section: `embeddings.getChunks(noteName)` → show chunk count + each chunk truncated to 120 chars.
3. Print result.

### `pnpm inspect chunks <note-name>`

1. `main()` loads `embeddings` only.
2. `cmdChunks(noteName, embeddings)`:
   - `embeddings.getChunks(noteName)` → print each chunk with its index and full text.
3. Print result.

### `pnpm inspect stats`

1. `main()` loads both indexes.
2. `cmdStats(vaultRoot, vaultIndex, embeddings)`:
   a. BM25: show `stats.noteCount`, `stats.indexedAt`, file sizes from `fs.stat()`,
      staleness via `vaultIndex.isStale(vaultRoot)`.
   b. Embeddings: show `stats.noteCount`, total chunk count
      (from `getChunks` across all notes — or exposed via a `chunkCount` getter),
      `stats.modelId`, dimensions from meta, file sizes, staleness via `embeddings.isStale(vaultRoot)`.
3. Print result.

---

## Design Decisions

### Decision: Subcommand handlers return strings, not write to stdout directly
**Chosen:** Each `cmd*` function returns a formatted string; `main()` writes it.
**Alternatives considered:** Writing directly to `process.stdout` inside each handler.
**Rationale:** Returning strings makes handlers testable without capturing stdout or
spawning a process. `main()` remains a thin dispatcher.
> **ADR candidate:** No

### Decision: Inline RRF formula in inspect.ts
**Chosen:** Reproduce the 3-line RRF formula directly in `cmdSearch` rather than
importing from `src/agent/tools.ts`.
**Alternatives considered:** Exporting `reciprocalRankFusion` from `tools.ts` and
importing it in the inspector.
**Rationale:** `reciprocalRankFusion` is currently module-private in `tools.ts` and is
coupled to `SearchResult` / `EmbeddingSearchResult` types. Exporting it would widen the
agent module's public surface for a utility that is self-contained. The formula is three
lines; inlining it is less coupling than a cross-module dependency.
> **ADR candidate:** No

### Decision: Semantic search requires the provider to be configured
**Chosen:** `inspect search` calls `getEmbeddingProvider()`. If it returns `null`,
semantic and hybrid lists are omitted with a one-line notice. No error.
**Alternatives considered:** Requiring a pre-computed query vector supplied on the command
line (unwieldy); always requiring the provider.
**Rationale:** The inspector must work without Bedrock credentials configured (read-only
stats/chunks/note inspection should never block on cloud credentials). Semantic search is
still available when the provider is configured.
> **ADR candidate:** No

### Decision: Use existing search() for BM25 note lookup; add getChunks() only for embeddings
**Chosen:** For the BM25 section of `inspect note`, call `vaultIndex.search(noteName, 50)` and
filter client-side for `r.noteName === noteName`. Add `getChunks()` on `VaultEmbeddings`.
**Alternatives considered:** A `findByNoteName()` accessor on `VaultIndex`; parsing
`.lorecraft/*.json` directly.
**Rationale:** `search()` already returns stored `noteName`, `filePath`, and `content` fields —
no new VaultIndex API is needed. A new accessor would duplicate existing capability.
`getChunks()` on `VaultEmbeddings` is necessary because the existing `search()` path
requires a query vector (calling Bedrock), which the inspector avoids.
> **ADR candidate:** No

### Decision: `pnpm inspect` as the entry point name
**Chosen:** `tsx src/cli/inspect.ts` registered as `"inspect"` in package.json scripts.
**Alternatives considered:** `pnpm run debug`, `pnpm run explore`, a top-level
`lorecraft-inspect` binary.
**Chosen rationale:** `inspect` is the most descriptive single word for the tool's purpose
and is consistent with existing `pnpm cli` convention in the project.
> **ADR candidate:** No

---

## Output Format

Plain text, printed to stdout. Section headers use `===`. All columns are
space-padded for readability; no external formatting library.

**`inspect search`:**
```
=== BM25 results for "dockside ambush" ===
 1. Harbor District       12.345
 2. Thieves Guild          9.876
 3. Sea Spirits            3.210

=== Semantic results for "dockside ambush" ===
 1. Sea Spirits            0.923
 2. Harbor District        0.876
semantic: index not available — run /index rebuild to enable

=== Hybrid results (RRF, k=60) for "dockside ambush" ===
 1. Sea Spirits            0.0313
 2. Harbor District        0.0302
```

**`inspect note`:**
```
=== BM25: "Sea Spirits" ===
File:    Locations/Sea Spirits.md
Content: Spectral sailors are said to haunt the waters near the old harbor...
         (first 300 chars)

=== Semantic: "Sea Spirits" ===
Chunks: 3
[0] 423 chars  Spectral sailors are said to haunt the waters near...
[1] 387 chars  The spirits are known to appear at dusk, drawn to the...
[2] 201 chars  Local fishermen leave offerings of salt and rope at the...
```

**`inspect chunks`:**
```
Note: "Sea Spirits" — 3 chunks

[chunk 0] 423 chars
Spectral sailors are said to haunt the waters near the old harbor. Their forms
appear as pale blue flames just above the waterline...
(full text)

[chunk 1] 387 chars
...
```

**`inspect stats`:**
```
=== BM25 index ===
Notes:     12
Indexed:   2026-04-20 14:23:11 UTC
Files:     .lorecraft/index.json (45.2 KB)
           .lorecraft/index-meta.json (1.1 KB)
Staleness: up to date

=== Embedding index ===
Notes:     12
Chunks:    47
Model:     amazon.titan-embed-text-v2:0
Dims:      1024
Indexed:   2026-04-20 14:23:45 UTC
Files:     .lorecraft/embeddings.json (1.2 MB)
           .lorecraft/embeddings-meta.json (1.8 KB)
Staleness: up to date
```

---

## Test Strategy

Per ADR-006, all test files use Vitest.

| Test file | Scope | What is tested |
|---|---|---|
| `src/vault/vault-embeddings.test.ts` | Unit (extend existing) | `getChunks()` — found, not found, ordering by chunkIndex |
| `src/cli/inspect.test.ts` | Unit (new) | `cmdSearch`, `cmdNote`, `cmdChunks`, `cmdStats` with mocked `VaultIndex` / `VaultEmbeddings`; assert on returned string content |

No integration test is added for the inspect binary. The handler functions are unit-tested
with mock dependencies; that covers all logic paths. A process-spawn integration test
adds complexity (spawn, env setup, fixture vault path) for little additional safety on top
of the unit tests.

**Mock strategy for inspect.test.ts:** Pass `null` indexes to test omit notices.
Pass mock objects with stub methods for the positive paths. No `MockLanguageModelV1`
needed — no LLM is involved.

**No new fixture vault notes required** — tests use inline mock data.

---

## Out of Scope / Deferred

- Interactive REPL / shell mode for the inspector — all subcommands are one-shot.
- Colour output, TUI, or pager integration.
- `inspect search` respecting the context budget — intentionally excluded so the developer
  sees the raw index ranking.
- A `chunkCount` property exposed directly from `VaultEmbeddings.stats` — `cmdStats`
  derives it from `getChunks()` calls across all notes, or we add a simple `get chunkCount`
  getter. Deferred to implementation.
- Per-note term analysis from MiniSearch (term frequency, IDF) — MiniSearch does not
  expose per-document term weights via its public API, and reverse-engineering the internal
  `_index` map is fragile. Stored content field is sufficient for the inspector's purpose.

---

## Open Questions

| Question | Assumption | Flagged for |
|---|---|---|
| Does `VaultEmbeddings.stats` need a `chunkCount` field, or is `getChunks()` across all notes acceptable for `cmdStats`? | Add a `get chunkCount(): number` getter to `VaultEmbeddings` (reads `this.chunks.length`) alongside `getChunks()`. Simpler than iterating all notes in `cmdStats`. | Implementation task |
| Should `inspect search` accept `--limit` as `--limit=N` or `--limit N`? | `--limit N` (space-separated), matching common CLI convention; parse with a simple argv loop. | Implementation task |
