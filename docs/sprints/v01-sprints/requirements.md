# Requirements — v0.1: BM25 Keyword Search

> **Status:** Approved
> **Sprint:** v0.1
> **Created:** 2026-04-23
> **Design doc:** [design.md](design.md)

---

## Goal

The GM's vault contains notes that are relevant to a generation request but
are not reachable via wikilinks — they exist but nothing links to them. Before
this sprint, the agent was blind to these notes. After this sprint, the agent
can search the vault by keyword using BM25 ranking, surfacing relevant notes
regardless of whether they are linked. The GM can build and maintain the index
from the CLI without leaving the REPL.

---

## User stories

**As a** GM, **I want** the agent to search my vault by keyword during
generation **so that** notes not linked from any template or NPC can still
influence the generated content.
1. The LLM can invoke a `keyword_search` tool with a free-form query string
2. The tool returns the top-ranked vault notes for that query, ordered by BM25
   score
3. Results respect the active `ContextBudget` — notes that would exceed the
   budget are silently skipped
4. When no results fit the budget (or the query matches nothing), the tool
   returns a structured `{ found: false }` signal without throwing

**As a** GM, **I want** to build a keyword index over my vault **so that**
keyword search is available the next time I open the CLI.
1. `/index rebuild` scans all `.md` files in the vault and persists the index
   to `{vault}/.lorecraft/`
2. The command reports how many notes were indexed
3. The index survives a CLI restart — subsequent sessions load it automatically

**As a** GM, **I want** to keep the index up-to-date without full rebuilds
**so that** recently added or edited notes appear in search results quickly.
1. `/index refresh` re-indexes only the notes that have changed (by mtime),
   adds new ones, and removes deleted ones
2. The command reports how many notes were added, updated, and removed
3. `/index status` shows the note count, the timestamp of the last index, and
   whether the index is fresh or stale

**As a** GM, **I want** the CLI to warn me when the keyword index is out of
date **so that** I know when to run `/index refresh` before generating content.
1. If the index is stale when `/generate` is invoked, a `[warning]` line is
   printed before generation begins
2. If no index has been built yet, an `[info]` line prompts the GM to run
   `/index rebuild`
3. Generation proceeds in both cases — wikilink resolution still works without
   an index

---

## Out of scope

- **Semantic / vector search** — finding notes by meaning rather than exact
  keyword overlap. Addressed in v0.2 (ADR-004 Proposed).
- **Hybrid search (BM25 + vector)** — combining keyword and vector scores via
  Reciprocal Rank Fusion. Requires v0.2 vector search first.
- **Automatic index updates** — the index is not updated automatically on file
  save; the GM triggers updates manually.
- **Fuzzy or prefix matching** — MiniSearch is configured for exact-token BM25
  matching only. Fuzzy search adds recall at the cost of precision and latency;
  deferred.
- **`.lorecraft/` gitignore handling** — documenting or enforcing that the
  generated index is excluded from the vault's own version control is out of
  scope.
- **Web UI keyword search** — the `keyword_search` tool is wired into the
  agent and available to web UI sessions at v0.4 at no additional cost, but
  web UI `/index` management commands are deferred.

---

## Constraints

- BM25 index library must have zero native dependencies, built-in TypeScript
  types, first-class JSON serialization, and incremental update support
  (ADR-007: MiniSearch).
- Index persistence lives in `{vaultRoot}/.lorecraft/` — never inside
  `src/` or any other project directory.
- `src/vault/` module boundary: `VaultIndex` lives in `src/vault/` and may
  not import from `src/agent/`, `src/llm/`, or `src/cli/` (ADR-002).
- `ContextBudget` must gate every keyword search result returned to the LLM —
  unbounded reads are prohibited (core invariant).
- The tool must be defined using Vercel AI SDK `tool()` with a Zod parameter
  schema (ADR-001).
- All vault access is read-only (ADR-003).
- Must run on Node.js 20+.

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Should MiniSearch fuzzy matching be enabled? | No — exact-token BM25 only for v0.1. Fuzzy increases recall but may surface noisy results at unpredictable score ranges. | If GMs report poor recall for typo-variant queries, fuzzy can be enabled with a `fuzzy: 0.2` option without changing the stored index format. |
| Should keyword search results be deduplicated against the pre-fetched context notes already in the system prompt? | No deduplication in v0.1. Pre-fetch and keyword search share the same `ContextBudget`, so a pre-fetched note will typically exhaust part of the budget; a tool call for the same note would receive `budget_exceeded`. The LLM already has the content, so this is low-severity. | If testing reveals meaningful budget waste or confusing LLM behaviour, a shared `seen` set can be passed into both the pre-fetch loop and `createKeywordSearchTool`. |
| Should the index be rebuilt atomically (write to a temp file and rename) to protect against partial writes? | No — `fs.writeFile` is used directly. Partial writes would leave a corrupt index that `load()` would fail to parse. On next `/index rebuild` or `/index refresh`, the index is regenerated cleanly. | If the process crashes mid-write frequently, switch to write-then-rename in a follow-up. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready module boundaries
- ADR-003: Vault writes require explicit GM approval
- ADR-006: Integration testing strategy — fixture vault + mocked LLM
- ADR-007: MiniSearch as the BM25 keyword index (added this sprint)
- Vision doc: "Context gathering" — wikilink traversal is Layer 2, keyword
  search is Layer 3, semantic search is Layer 4
- PRFAQ: "How does Lorecraft decide which notes are relevant?"
