# Design — v0.1: BM25 Keyword Search

> **Status:** Approved
> **Sprint:** v0.1
> **Requirements:** [requirements.md](requirements.md)

---

## Overview

This sprint adds a persistent BM25 keyword index over all vault notes and
exposes it to the generation agent as a `keyword_search` tool — the same
tool-call pattern established by `wikilink_resolve` in mvp-sprint-05. Three
modules are involved: `src/vault/` gains `VaultIndex`; `src/agent/` gains
`createKeywordSearchTool` and a new `vaultIndex?` option on `GenerateOptions`;
`src/cli/` gains `/index` subcommands and a stale-index warning on `/generate`.

The implementation is split into three sequentially dependent sub-sprints:
Sprint 01 (VaultIndex core, `src/vault/` only), Sprint 02 (agent tool wiring),
Sprint 03 (CLI commands). Each sprint's exit criterion is all tests passing
with no changes outside its target module boundary.

---

## Module map

```
src/
├── vault/
│   ├── vault-index.ts          (new) VaultIndex class — BM25 index, persist/load,
│   │                                 incremental update, staleness check
│   └── vault-index.test.ts     (new) unit tests — uses temp vault copy, not fixture
├── agent/
│   ├── tools.ts                (modified) add createKeywordSearchTool
│   ├── tools.test.ts           (modified) add keyword_search unit tests
│   └── generation-loop.ts      (modified) GenerateOptions.vaultIndex?,
│                                          SessionTools type, conditional tool
├── cli/
│   └── index.ts                (modified) CliDeps.vaultIndex?, /index subcommands,
│                                          stale/no-index warnings, main() loads index
└── __tests__/
    ├── fixtures/
    │   └── test-vault/
    │       └── Locations/
    │           └── Old Harbor District.md  (new) unlinked note with "dockworkers"
    ├── agent-vault.integration.test.ts     (modified) keyword_search scenario
    └── cli.integration.test.ts             (modified) /index command tests

docs/
└── architecture/
    └── decisions.md            (modified) ADR-007 added

package.json                    (modified) minisearch added to dependencies
```

---

## Interfaces and data types

```typescript
// src/vault/vault-index.ts

/** A single BM25 search result. */
export type SearchResult = {
  filePath: string;
  noteName: string;
  content: string;
  score: number;      // BM25+ score, descending
};

/** Summary statistics about the current index state. */
export type IndexStats = {
  noteCount: number;
  indexedAt: Date;
};

/**
 * BM25 keyword index over all vault notes. Persists to
 * {vaultRoot}/.lorecraft/index.json and index-meta.json.
 */
export class VaultIndex {
  /** Build a fresh index over all .md files and persist it. */
  static async build(vaultRoot: string): Promise<VaultIndex>

  /** Restore from disk. Returns null when no index exists yet. */
  static async load(vaultRoot: string): Promise<VaultIndex | null>

  /** Re-index changed/new files; remove deleted ones. */
  async update(vaultRoot: string): Promise<{ added: number; updated: number; removed: number }>

  /** True if any .md file has been added, removed, or modified since last build/update. */
  async isStale(vaultRoot: string): Promise<boolean>

  /** BM25-ranked results, descending by score. */
  search(query: string, limit?: number): SearchResult[]

  get stats(): IndexStats
}
```

```typescript
// src/agent/tools.ts  (additions)

export type KeywordSearchToolResult =
  | { found: true; results: Array<{ noteName: string; content: string }> }
  | { found: false; reason: 'no_results' };

/**
 * Creates the Vercel AI SDK `keyword_search` tool.
 * Results are gated through budget; at most `limit` (default 3) notes returned.
 *
 * @param index  - Loaded VaultIndex to query.
 * @param budget - Shared ContextBudget for this generation request.
 */
export function createKeywordSearchTool(
  index: VaultIndex,
  budget: ContextBudget,
): Tool<{ query: ZodString; limit?: ZodOptional<ZodNumber> }, KeywordSearchToolResult>
```

```typescript
// src/agent/generation-loop.ts  (additions)

export type GenerateOptions = {
  // ... existing fields unchanged ...

  /**
   * Loaded VaultIndex. When provided, the agent can call keyword_search
   * during generation. Omit to run without keyword search.
   */
  vaultIndex?: VaultIndex;
};
```

```typescript
// src/cli/index.ts  (additions)

export type CliDeps = {
  model?: LanguageModel;
  vaultRoot?: string;
  output?: NodeJS.WriteStream;
  /** null = no index built yet; undefined = not injected (production uses env). */
  vaultIndex?: VaultIndex | null;
};
```

---

## Sequence / flow

### Index lifecycle

```
pnpm cli starts
  └─ main()
       └─ VaultIndex.load(vaultRoot)
            ├─ .lorecraft/ exists → return VaultIndex (loaded)
            └─ .lorecraft/ missing → return null

GM types /index rebuild
  └─ main() intercepts before processCommand
       └─ VaultIndex.build(vaultRoot)
            └─ VaultReader.listNotes() → all .md files
            └─ for each file: readNote + fs.stat (mtime)
            └─ MiniSearch.addAll(docs)
            └─ persist: index.json + index-meta.json
       └─ vaultIndex = built; print note count

GM types /generate npc name:"..."
  └─ processCommand('/generate ...', state, { ..., vaultIndex })
       ├─ if vaultIndex && isStale → print [warning]
       ├─ if vaultIndex === null → print [info]
       └─ GenerationSession.create({ ..., vaultIndex })
            └─ tools = {
                 wikilink_resolve: createWikilinkTool(reader, budget),
                 keyword_search:   createKeywordSearchTool(index, budget)  // if index
               }
            └─ ToolLoopAgent({ model, tools })

LLM calls keyword_search({ query: "dockworkers" })
  └─ createKeywordSearchTool.execute
       └─ VaultIndex.search("dockworkers")
            └─ MiniSearch.search("dockworkers").slice(0, limit)
       └─ for each result (descending score):
            if budget.fits(content): budget.add; include
            else: skip
       └─ included.length > 0 → { found: true, results: [...] }
          included.length === 0 → { found: false, reason: 'no_results' }
```

### Staleness check on /index status

```
GM types /index status
  └─ processCommand reads vaultIndex from deps
  └─ vaultIndex.isStale(vaultRoot)
       └─ VaultReader.listNotes() → currentNotes
       └─ compare count with meta.fileMtimes keys
       └─ for each current file: fs.stat(mtime) vs stored mtime
       └─ any mismatch or count diff → true
  └─ print: N notes, indexed at <ts> — fresh/stale
```

### Incremental update on /index refresh

```
GM types /index refresh
  └─ vaultIndex.update(vaultRoot)
       └─ VaultReader.listNotes() → current files
       └─ for each file:
            relPath not in meta.fileMtimes → add + track mtime
            mtime changed → replace + track mtime
            mtime unchanged → skip
       └─ for each relPath in meta that has no current file → discard
       └─ persist updated index + meta
  └─ print: X added, Y updated, Z removed
```

---

## Design decisions

### Decision: `VaultIndex` in `src/vault/`, not `src/agent/`

**Chosen:** `VaultIndex` lives in `src/vault/` alongside `VaultReader`.

**Alternatives considered:**
- Place in `src/agent/` since it is consumed by the agent tool.

**Rationale:** The index is a vault concern — it reads vault files, tracks
vault file mtimes, and persists to the vault directory. It has no dependency
on the agent layer. Moving it to `src/vault/` respects ADR-002 module
boundaries: `src/agent/` may import from `src/vault/`, but not the reverse.
When the monorepo split happens (v0.4), `VaultIndex` belongs in `packages/core`
alongside `VaultReader`.

> **ADR candidate:** No — covered by ADR-002.

---

### Decision: MiniSearch as the BM25 engine (ADR-007)

**Chosen:** MiniSearch v7 with BM25+ scoring.

**Alternatives considered:**
- Fuse.js — fuzzy matching, not BM25-ranked full-text search.
- Orama — supports BM25 + hybrid natively, but ~90 KB and more complex than
  the MVP needs. Revisit when v0.2 adds vector search.
- Custom inverted index — unnecessary reinvention.

**Rationale:** MiniSearch is ~7 KB gzipped, zero native deps, built-in
TypeScript types, first-class `toJSON()`/`loadJSON()` serialization, and an
incremental update API (`add`/`replace`/`discard`). Its BM25 scores are
straightforward to combine with vector scores via Reciprocal Rank Fusion
when v0.2 arrives.

> **ADR candidate:** Yes — documented as ADR-007.

---

### Decision: Two persistence files (`index.json` + `index-meta.json`)

**Chosen:** Separate `index.json` (MiniSearch serialized data) and
`index-meta.json` (`{ noteCount, indexedAt, fileMtimes }`).

**Alternatives considered:**
- Single file combining both — requires custom serialization wrapper.
- Embed `fileMtimes` inside MiniSearch's stored fields — `fileMtimes` is an
  index-level property, not a per-document property.

**Rationale:** `MiniSearch.toJSON()` is the canonical serialization format for
the search index. Keeping metadata separate avoids monkey-patching MiniSearch's
output and allows metadata to be read without deserializing the full index.
`fileMtimes` is the key that makes both `isStale()` and `update()` O(n) rather
than O(n log n) — it maps vault-relative path to mtime epoch ms.

> **ADR candidate:** No.

---

### Decision: `/index rebuild` handled in `main()`, not `processCommand`

**Chosen:** `main()` intercepts `/index rebuild` before dispatching to
`processCommand`. All other `/index` subcommands (status, refresh) go through
`processCommand` with `vaultIndex` in `deps`.

**Alternatives considered:**
- Make `processCommand` return `{ state, vaultIndex }` — cleaner separation
  but a breaking change to `processCommand`'s return type and all existing tests.

**Rationale:** `processCommand` returns `GenerationSession | null` because the
CLI state is a session. Changing that return type to accommodate an occasional
index rebuild would spread index-lifecycle concerns into the session abstraction.
Intercepting in `main()` keeps `processCommand` pure: it always receives the
current `vaultIndex` as read-only input via `deps`, and its return type stays
unchanged. `/index rebuild` is a CLI-lifecycle operation, not a session operation.

> **ADR candidate:** No.

---

### Decision: Budget gating iterates results descending by score, skips on miss

**Chosen:** Iterate MiniSearch results (already sorted by descending BM25
score); check `budget.fits(content)` before `budget.add(content)`; skip
results that do not fit; stop after `limit` included results.

**Alternatives considered:**
- Return only the first `limit` results and let the LLM deal with budget
  truncation at the prompt level — would require returning partial content
  or truncated strings.
- Check total token cost across all results upfront and trim the list —
  over-complex; BM25 scores are not calibrated to token lengths.

**Rationale:** The per-result `fits`/`add` pattern is already established by
`createWikilinkTool`. Applying it to keyword results keeps the two tools
behaviorally consistent and ensures the highest-scoring notes are included
first. Notes that don't fit are dropped silently; the LLM receives only what
fits in context.

> **ADR candidate:** No.

---

### Decision: Fixture vault gets `Locations/Old Harbor District.md`

**Chosen:** Add a new, intentionally unlinked fixture note containing the
terms "dockworkers" and "smugglers".

**Rationale:** The integration test for `keyword_search` needs a note the
wikilink pre-fetch cannot reach — otherwise the test doesn't distinguish
keyword search from pre-fetching. The new note is not referenced from any
existing fixture note and does not appear in any existing wikilink traversal
path, making it a clean negative control for wikilink tests and a clean
positive control for keyword search tests.

> **ADR candidate:** No.

---

## Test strategy

Following ADR-006's three-layer strategy:

**Unit tests — `src/vault/vault-index.test.ts`** (new, co-located)

Uses a fresh temp vault copy (via `fs.mkdtemp` + copy of fixture files)
per test to avoid polluting the fixture vault with `.lorecraft/` artifacts.

| Scenario | Assertion |
|---|---|
| `build()` indexes all `.md` files | `stats.noteCount` equals file count |
| `search("guild")` on fixture vault | Results non-empty; Thieves Guild ranks first; scores descending |
| `search("dragonfire")` on fixture vault | Empty results (false-positive guard) |
| `isStale()` immediately after build | Returns false |
| `isStale()` after touching a file | Returns true |
| `update()` after adding a new file | `added: 1`, new file searchable |
| Persist → load round-trip | `search()` results identical before and after |
| `load()` with no `.lorecraft/` | Returns null |

**Unit tests — `src/agent/tools.test.ts`** (modified)

All paths through `createKeywordSearchTool.execute` using mocked `VaultIndex`
and `ContextBudget`:

| Scenario | Setup | Expected |
|---|---|---|
| Results fit budget | `fits` always true | `{ found: true, results: [...] }` |
| All results fail budget | `fits` always false | `{ found: false, reason: 'no_results' }` |
| First fits, second doesn't | `fits` sequence: true, false | Only first result returned |
| Empty search results | `index.search` returns `[]` | `{ found: false, reason: 'no_results' }` |

**Integration test — `src/__tests__/agent-vault.integration.test.ts`** (modified)

New scenario: `GenerationSession` built with a real `VaultIndex` over the
fixture vault. `MockLanguageModelV3` first call emits a `keyword_search`
tool-call for `"dockworkers"`. Assert `callCount === 2` (tool executed,
second LLM call made) and `result.content` is the mocked text.

**CLI integration tests — `src/__tests__/cli.integration.test.ts`** (modified)

Eight new tests in a `/index commands` describe block. Uses `afterEach` to
remove `{fixture_vault}/.lorecraft/` after each test. Patches `isStale` via
`Object.defineProperty` to simulate stale state without filesystem mutation.

| Test | Assertion |
|---|---|
| `/index rebuild` | Output matches `/Index built: \d+ notes indexed/` |
| `/index status` when fresh | Output contains "notes" and "fresh" |
| `/index status` when stale | Output contains "stale" |
| `/index refresh` | Output matches `/\d+ added, \d+ updated, \d+ removed/` |
| `/index status` with no index | Output contains "No index loaded" |
| `/index refresh` with no index | Output contains "No index loaded" |
| `/generate` with stale index | Output contains "[warning] Index is stale" |
| `/generate` with no index | Output contains "[info] No keyword index" |

---

## Out of scope / deferred

- **Fuzzy / prefix search** — exact-token BM25 only. If recall proves
  insufficient, `fuzzy: 0.2` can be added to the `MiniSearch.search()` call
  without changing the storage format.
- **Pre-fetch deduplication** — keyword-searched notes and pre-fetched notes
  share the same `ContextBudget` but do not deduplicate. Low-severity edge
  case; revisit in v0.2 if budget waste is observed.
- **Atomic index writes** — `fs.writeFile` writes directly; a crash mid-write
  would leave a corrupt index. `load()` would fail to parse it, and a rebuild
  would recover. Switch to write-then-rename if this proves problematic.
- **Hybrid BM25 + vector search** — requires v0.2 vector index (ADR-004).
  Reciprocal Rank Fusion or linear blend to be designed at that point.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Should MiniSearch be configured with a custom tokenizer to handle Obsidian wikilink syntax (`[[...]]`) inside note content? | Default tokenizer (splits on whitespace and punctuation) is sufficient; `[[` and `]]` are treated as punctuation delimiters, so wikilink text is indexed without the brackets. | v0.2 if BM25 recall on linked entity names proves poor |
| Should `isStale()` use a fast hash (e.g. xxHash) instead of mtime comparison? | Mtime is sufficient for the single-user, local-filesystem case. Network filesystems or sync tools that preserve mtimes while changing content are out of scope. | v0.3 if vault sync tools become common in the user base |
