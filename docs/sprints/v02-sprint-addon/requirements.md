# Requirements — v02-sprint-addon: Index Inspector

> **Status:** Draft
> **Sprint:** v02-sprint-addon
> **Created:** 2026-04-24
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

After running `/index rebuild`, the developer can launch a separate `lorecraft-inspect`
binary to understand exactly what both indexes contain and how search behaves. They can
test a query and see ranked results from BM25, semantic, and hybrid search side by side
with raw scores; inspect how a specific note is represented in the keyword index; and see
the exact chunks a note was split into as stored in the embeddings index. All output goes
to stdout as plain text.

---

## User stories

**As a** developer, **I want** to run `pnpm inspect search <query>` **so that** I can see
which vault notes surface for a given query, with raw scores from each search strategy,
and verify that the right notes are ranking at the top.

1. Running `pnpm inspect search "dockside ambush"` prints three ranked lists: BM25 results
   with BM25 scores, semantic results with cosine-similarity scores, and hybrid results with
   RRF scores.
2. Each result line shows: rank, note name, and score.
3. The number of results per list is configurable via `--limit N` (default: 10).
4. If an index is unavailable (e.g. no embeddings index), that list is omitted with a
   one-line notice (e.g. `semantic: index not found — run /index rebuild`).
5. If no vault path or index is found, the command exits with a clear error message.

---

**As a** developer, **I want** to run `pnpm inspect note <note-name>` **so that** I can see
how a specific note is indexed in both the keyword and embeddings indexes without reading
the raw JSON files by hand.

1. Running `pnpm inspect note "Sea Spirits"` prints two sections: a BM25 section and a
   Semantic section.
2. The BM25 section shows the note's stored fields as indexed by MiniSearch (title, content
   excerpt, tags if present).
3. The Semantic section shows the number of chunks indexed for the note, plus the text of
   each chunk (truncated to ~120 chars per chunk for readability).
4. If the note does not exist in an index, that section says so explicitly (e.g.
   `BM25: "Sea Spirits" not found in index`).

---

**As a** developer, **I want** to run `pnpm inspect chunks <note-name>` **so that** I can
see the exact chunk boundaries applied to a note during indexing and verify that the
chunker split the content at sensible boundaries.

1. Running `pnpm inspect chunks "Sea Spirits"` lists every chunk stored in the embeddings
   index for that note: chunk index, character count, and full chunk text.
2. Output is not truncated — full chunk text is printed.
3. If the note has no chunks in the index (note not indexed or embeddings index missing),
   a clear message is shown.

---

**As a** developer, **I want** to run `pnpm inspect stats` **so that** I can see a detailed
summary of both index files without opening them manually.

1. For the BM25 index: note count, file size of `.lorecraft/index.json`, and index
   creation/update timestamp.
2. For the embeddings index: note count, total chunk count, embedding dimensions, model ID,
   file sizes of `.lorecraft/embeddings.json` and `.lorecraft/embeddings-meta.json`, and
   index creation/update timestamp.
3. If an index file is absent, that section says `not found`.
4. Staleness is shown: if the index is stale (vault files changed since last index), a
   warning line is printed.

---

## Out of scope

- Interactive REPL mode — all subcommands are one-shot (no session loop).
- Re-chunking notes on the fly — reads only from persisted index files; does not call
  `chunkNote()` at runtime.
- Live vault file reads beyond what's needed to resolve the vault root and check staleness.
- Embedding vector inspection (raw float arrays) — vectors are internal implementation
  detail; scores are sufficient.
- Modifying or rebuilding indexes — this is read-only tooling.
- Adding this tooling to the main GM-facing CLI (`src/cli/index.ts`) — it lives in its
  own entry point.
- Filtering or pagination of results beyond `--limit`.

---

## Constraints

- Must read from the same `.lorecraft/` persistence files that `VaultIndex` and
  `VaultEmbeddings` write — no separate data format.
- Uses existing `VaultIndex` and `VaultEmbeddings` public APIs only; no access to
  internal MiniSearch `_index` state.
- No new npm packages.
- Plain text stdout; no colour library, no TUI.
- Vault root resolved via `VAULT_ROOT` env var (same as main CLI).
- Must work without an embeddings provider configured (read-only; never calls Bedrock).

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Does `VaultIndex` expose per-note field data (title, content, tags as indexed)? | MiniSearch `getStoredFields()` or the raw stored document is accessible via public API or a thin accessor added to `VaultIndex`. | May need a small accessor method on `VaultIndex`; low risk. |
| Does `VaultEmbeddings` expose the raw chunk array (text + metadata) without returning vectors? | `VaultEmbeddings` already stores `NoteChunk[]` in `embeddings.json`; a `getChunks(noteName)` accessor can be added. | If chunks are not stored separately from vectors, the design needs a read-only loader that parses the JSON directly; still low risk. |
| Should `inspect search` respect the context budget? | No — the inspector shows raw index results without budget gating, so the developer can see what the index contains regardless of token limits. | Developer sees more results than the agent would use; this is intentional for debugging. |

---

## Reference

- ADR-004: Amazon Bedrock embeddings
- ADR-007: MiniSearch as the BM25 keyword index
- ADR-002: Single package, monorepo-ready boundaries (new `src/cli/inspect.ts` entry point)
- Existing persistence: `src/vault/vault-index.ts`, `src/vault/vault-embeddings.ts`
