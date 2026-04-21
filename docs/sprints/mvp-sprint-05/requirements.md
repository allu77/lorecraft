# Requirements — mvp-sprint-05: WikiLink Resolution Agentic Tool

> **Status:** Draft
> **Sprint:** mvp-sprint-05
> **Created:** 2026-04-21
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

The GM's generated content becomes richer and more lore-consistent because
the LLM can now look up vault notes on demand during generation — not just
receive a batch of pre-assembled context. When the AI encounters an entity
it wants more detail on (a faction, a location, an NPC), it calls a
`wikilink_resolve` tool, reads the note, and incorporates those details into
its output. The GM no longer needs to anticipate every note the AI might
need; the AI discovers and reads what it needs as it writes.

---

## User stories

**As a** GM, **I want** the AI to look up any vault note by wikilink during
generation **so that** generated content reflects lore the AI discovered
autonomously, not just what was pre-linked in the template.
- [ ] The LLM can invoke a `wikilink_resolve` tool with a wikilink string
  (e.g. `[[Thieves Guild]]` or `[[Mira Shadowcloak]]`)
- [ ] The tool returns the note's Markdown content when found
- [ ] The tool returns a structured "not found" signal when the note does
  not exist, without throwing an error
- [ ] The LLM uses looked-up note content in the final generated output —
  cross-referenced against the fixture vault in integration tests

**As a** GM, **I want** section-level wikilink resolution
(e.g. `[[Thieves Guild#Goals]]`) **so that** the AI can fetch a specific
heading's content rather than always pulling in an entire note.
- [ ] `[[Note#Section]]` syntax returns only the content under the named
  heading (using the existing `VaultReader.readNote(path, section)` behaviour)
- [ ] When the requested section is not found, the full note content is
  returned as fallback (Obsidian convention — a missing section anchor is
  not an error)

**As a** GM, **I want** wikilink tool calls to respect the context budget
**so that** the AI's autonomous note lookups cannot exhaust the token
budget unexpectedly.
- [ ] Each tool call response is counted against the running `ContextBudget`
- [ ] When the budget is exhausted, further tool calls return a structured
  "budget exceeded" signal instead of note content
- [ ] Token consumption reported at the end of generation includes tokens
  consumed by tool call round-trips (input + output for each call)

---

## Out of scope

- **`@[[note-name]]` template injection syntax** — embedding a note's full
  content inside an Obsidian comment at template-parse time. Related to
  wikilinks but a template-parser concern; deferred.
- **Keyword or semantic search** — finding notes without explicit wikilinks
  (v0.1 / v0.2 respectively). This sprint is wikilink-only.
- **Changes to the pre-fetch logic** — `generation-loop.ts` currently
  extracts wikilinks from the template body and pre-fetches them before
  calling the LLM. That behaviour is unchanged (see Open questions below).
- **Write operations** — the tool is read-only (ADR-003).
- **Web UI tool call display** — streaming tool use indicators in the Next.js
  UI are a v0.4 concern.
- **Depth-limiting beyond budget** — explicit recursion depth caps are not
  added; the context budget is the only limiting mechanism for now.

---

## Constraints

- Tool must be defined using Vercel AI SDK `tool()` with a Zod parameter
  schema (ADR-001).
- The tool implementation lives in `src/agent/` — it may import from
  `src/vault/` but not the reverse (ADR-002 module boundary).
- All vault access is read-only (ADR-003).
- `ContextBudget` must gate every tool call response — no unbounded reads
  (core invariant).
- No provider-specific types may appear outside `src/llm/provider.ts`
  (ADR-001 consequence).
- Must run on Node.js 20+.

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Should the existing pre-fetch in `generation-loop.ts` be removed, reduced, or kept unchanged now that the LLM has a live tool? | **Keep pre-fetch unchanged.** Template-body wikilinks are high-confidence dependencies that are cheap to resolve upfront and improve first-turn quality. The tool is additive — for anything the LLM discovers *during* generation that wasn't in the template. | If kept, the same note may be fetched twice (once pre-fetch, once via tool). Deduplication logic may be needed if this causes budget waste in practice. |
| Should the tool return metadata (resolved path, note name) alongside content, or content only? | Return content only, with a boolean `found` discriminant. The LLM does not need the filesystem path. | If callers later need the path (e.g. for write operations, v0.4), the return type will need extending. |
| Does `streamText` in generation-loop support `maxSteps > 1` today? | Yes — Vercel AI SDK `streamText` with `tools` and `maxSteps` enables the multi-step agentic loop where the LLM calls a tool, receives the result, and continues generating. | If the current `generation-loop.ts` call to `streamText` doesn't pass `maxSteps`, tool calls will be ignored. The design doc will verify and correct this. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready module boundaries
- ADR-003: Vault writes require explicit GM approval
- ADR-006: Integration testing strategy — fixture vault + mocked LLM
- PRFAQ: "How does Lorecraft decide which notes are relevant?" — wikilink traversal is Layer 2
- PRFAQ: "What can Lorecraft generate today?" — context gathering description
- PRFAQ: "What is the recommended agentic framework?" — Vercel AI SDK tool execution
