# Requirements — mvp-sprint-01: Vault Layer

> **Status:** Draft
> **Sprint:** mvp-sprint-01
> **Created:** 2026-04-19
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

At the end of this sprint, Lorecraft can read any note from an Obsidian vault, resolve a `[[Wikilink]]` (including section and alt-text variants) to note content, and parse a template's embedded agent instructions. These three capabilities form the complete vault access layer that all subsequent sprints (context assembly, generation loop, CLI) depend on.

---

## User stories

**As a** GM, **I want** Lorecraft to read notes from my vault **so that** other modules can retrieve note content during context assembly.

- [ ] Lorecraft can retrieve the full text of a note given its path.
- [ ] Lorecraft can find a note anywhere in the vault by name alone, without needing to know its subdirectory.
- [ ] Lorecraft can list all notes in the vault.
- [ ] If a vault read fails due to a filesystem error, Lorecraft surfaces a descriptive error rather than silently returning empty content.

---

**As a** GM, **I want** Lorecraft to follow `[[Wikilinks]]` in my notes **so that** the context assembler can automatically fetch related lore without me having to provide full file paths.

- [ ] Given a plain wikilink (`[[Note Name]]`), Lorecraft finds the matching note anywhere in the vault regardless of which subdirectory it lives in.
- [ ] Wikilink matching is case-insensitive: `[[thieves guild]]` matches `Factions/Thieves Guild.md`.
- [ ] Given a section wikilink (`[[Note Name#Section]]`), Lorecraft returns only the text under the named heading and all deeper headings (its full subtree), not the entire note.
- [ ] Given an alt-text wikilink (`[[Note Name|Alt Text]]`), Lorecraft resolves to the note as normal and ignores the alt text.
- [ ] The two modifiers can be combined: `[[Note Name#Section|Alt Text]]` resolves the section subtree and ignores the alt text.
- [ ] When no matching note exists, Lorecraft returns a clear "not found" result rather than an error.
- [ ] If a filesystem error occurs during resolution, Lorecraft surfaces a descriptive error.

---

**As a** GM, **I want** Lorecraft to understand the generation instructions I embed in my templates **so that** it knows what inputs are required and how to generate each note type without me having to repeat those instructions at generation time.

- [ ] Lorecraft extracts the agent prompt from the `%% == AGENT PROMPT == ... %%` block in a template.
- [ ] Lorecraft extracts the list of required inputs declared inside the agent prompt block.
- [ ] Lorecraft returns the template's body with only the `%% == AGENT PROMPT == ... %%` block stripped. All other `%% ... %%` comments are preserved in the body, as they contain field-level instructions the agent will read at generation time.
- [ ] A template with no `%% == AGENT PROMPT == %%` block is handled gracefully: Lorecraft returns an empty prompt, no required inputs, and the full template content as the body.
- [ ] A malformed or unclosed `%% == AGENT PROMPT == %%` block is tolerated: Lorecraft returns whatever was successfully parsed rather than throwing.

---

## Out of scope

- Keyword search (v0.1) and semantic/embedding search (v0.2).
- Any vault write operations (ADR-003 — no writes without GM approval; direct writes arrive in v0.4).
- Recursive wikilink traversal / context gathering (Sprint 3 — Context Assembly).
- Context budget management (Sprint 3).
- LLM provider or agent logic (Sprint 2 and Sprint 3 respectively).
- Frontmatter parsing (not required by any sprint before Sprint 3; deferred).
- `@[[note-name]]` note injection syntax in template comments (Sprint 3).

---

## Constraints

- `src/vault/` must have zero dependencies on `src/agent/`, `src/llm/`, or `src/cli/` (ADR-002, architecture.md).
- All vault reads go through `src/vault/` — no direct `fs` calls outside this module (architecture.md).
- All operations are read-only; no `fs.writeFile` or equivalent (ADR-003).
- Must run on Node.js 20+.
- Tests use Vitest co-located with source files (ADR-005, ADR-006).
- Unit tests run against the fixture vault at `src/__tests__/fixtures/test-vault/` (ADR-006).

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| What happens when multiple files match the same wikilink name (e.g. `NPCs/Rat.md` and `Monsters/Rat.md`)? | Return the first match in filesystem traversal order; do not throw. Matches Obsidian's own behaviour. | Could return wrong note in ambiguous vaults; acceptable for MVP since the GM controls the vault. |
| Should `parseTemplate` parse the required inputs list from free text, or expect a structured syntax? | Parse from the free-text agent prompt block using a simple heuristic (lines under a `Required inputs` heading starting with `-`). | If template authors use a different list format, parsing may miss inputs; acceptable for MVP since the starter pack templates are under our control. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready boundaries
- ADR-003: Vault writes require explicit GM approval
- ADR-005: Vitest as the testing framework
- ADR-006: Integration testing strategy
- Vision doc: Vault exploration section
- PR/FAQ: "How does vault exploration work? What is the search roadmap?"
- Sprint plan: `docs/planning/mvp-sprints.md` — Sprint 1 section
