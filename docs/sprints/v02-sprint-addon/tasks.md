# Tasks — v02-sprint-addon: Index Inspector

> **Status:** Complete
> **Sprint:** v02-sprint-addon
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/v02-sprint-addon/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "v02-sprint-addon-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [x] 001 — Verify CI baseline passes before starting
  - Run `pnpm typecheck && pnpm test`; fix any pre-existing failures before proceeding

### Core implementation

- [x] 002 — Add `StoredChunkInfo` type, `getChunks()` method, and `chunkCount` getter to `VaultEmbeddings`
  (`src/vault/vault-embeddings.ts`)
  - Export `StoredChunkInfo = { chunkIndex: number; chunkText: string }`
  - `getChunks(noteName: string): StoredChunkInfo[] | null` — filter `this.chunks` by noteName, strip vectors, sort by chunkIndex; return null if empty
  - `get chunkCount(): number` — returns `this.chunks.length`

- [x] 003 — [test] Extend `VaultEmbeddings` unit tests for `getChunks()` and `chunkCount` (`src/vault/vault-embeddings.test.ts`)
  - `getChunks()`: note with multiple chunks returns them ordered by chunkIndex
  - `getChunks()`: note not in index returns null
  - `getChunks()`: vectors are not present in returned objects
  - `chunkCount`: returns total chunk count across all notes

- [x] 004 — Implement `src/cli/inspect.ts`: all subcommand handlers and `main()`
  (`src/cli/inspect.ts`)
  - Export `cmdSearch(query, limit, vaultIndex, embeddings, provider): Promise<string>`
    - BM25: `vaultIndex.search(query, limit)` → ranked list with scores
    - Semantic: `embeddings.searchByText(query, provider, limit)` if both present; else omit notice
    - Hybrid: inline RRF (k=60) over BM25 + semantic results if both present; else omit notice
  - Export `cmdNote(noteName, vaultIndex, embeddings): string`
    - BM25: `vaultIndex.search(noteName, 50).find(r => r.noteName === noteName)` → filePath + content excerpt (300 chars); "not found" if absent
    - Semantic: `embeddings.getChunks(noteName)` → chunk count + each chunk truncated to 120 chars
  - Export `cmdChunks(noteName, embeddings): string`
    - `embeddings.getChunks(noteName)` → each chunk with index, char count, full text
  - Export `cmdStats(vaultRoot, vaultIndex, embeddings): Promise<string>`
    - BM25: noteCount, indexedAt, file sizes via `fs.stat()`, staleness via `isStale()`
    - Embeddings: noteCount, chunkCount, modelId, dimensions from meta, file sizes, staleness
  - `main()`: parse `process.argv` for subcommand + args; resolve `VAULT_ROOT`; load indexes; dispatch; exit with code 1 on error
  - Arg parsing: `--limit N` (default 10); exit with usage message on unknown subcommand

- [x] 005 — [test] Unit tests for all `inspect.ts` subcommand handlers
  (`src/cli/inspect.test.ts`)
  - `cmdSearch`: BM25-only (null embeddings) → semantic/hybrid omit notices present
  - `cmdSearch`: all three indexes available → all three sections printed with correct note names
  - `cmdSearch`: hybrid RRF ranks note appearing in both lists above note in one list only
  - `cmdNote`: note found in BM25 → filePath and content excerpt in output
  - `cmdNote`: note not in BM25 → "not found" message in BM25 section
  - `cmdNote`: note found in embeddings → chunk count and truncated texts in output
  - `cmdNote`: null indexes → both sections show "index not available"
  - `cmdChunks`: note with chunks → all chunks printed with full text
  - `cmdChunks`: note not in index → appropriate message
  - `cmdChunks`: null embeddings → "index not available" message
  - `cmdStats`: null indexes → "not found" for both sections
  - `cmdStats`: loaded indexes → noteCount, chunkCount, modelId present in output

### Integration

- [x] 006 — Add `"inspect"` script to `package.json` and verify `pnpm inspect stats` runs end-to-end against the fixture vault
  (`package.json`)
  - Add `"inspect": "tsx src/cli/inspect.ts"` to scripts
  - Smoke-test: `VAULT_ROOT=src/__tests__/fixtures/test-vault pnpm inspect stats` — should print index stats or "not found" without crashing

### Documentation and wrap-up

- [x] 007 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

<!--
| Task | Blocked by | Since |
|---|---|---|
| | | |
-->

---

## Discovered during sprint

<!--
- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
