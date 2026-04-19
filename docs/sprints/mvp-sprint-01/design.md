# Design — mvp-sprint-01: Vault Layer

> **Status:** Draft
> **Sprint:** mvp-sprint-01
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint creates `src/vault/` — the only module in Lorecraft that touches the filesystem. Two files are introduced: `vault-reader.ts` (file discovery, reading, and wikilink resolution) and `template-parser.ts` (Obsidian comment extraction). No other module touches `fs` directly. Sprint 3 (Context Assembly) will import from both.

---

## Module map

```
src/
└── vault/
    ├── vault-reader.ts         (new) list, find, read notes; parse and resolve wikilinks
    ├── vault-reader.test.ts    (new) unit tests against fixture vault
    ├── template-parser.ts      (new) extract agent prompt and strip AGENT PROMPT block
    ├── template-parser.test.ts (new) unit tests
    └── .gitkeep                (remove)
```

No other `src/` directories are touched in this sprint.

---

## Interfaces and data types

```typescript
// src/vault/vault-reader.ts

export type WikilinkParts = {
  noteName: string;       // "Thieves Guild"
  section: string | null; // "Goals" from [[Thieves Guild#Goals]]
  altText: string | null; // "the Guild" from [[Thieves Guild|the Guild]]
};

/**
 * Provides all read access to a single Obsidian vault, including wikilink
 * resolution. All methods are scoped to the vaultRoot provided at
 * construction time.
 */
export class VaultReader {
  constructor(vaultRoot: string) {}

  /** Returns absolute paths of all .md files under vaultRoot, recursively. */
  async listNotes(): Promise<string[]>

  /**
   * Reads a note's content. If section is provided, returns only the text
   * under that heading and all deeper headings (the section subtree).
   * Throws if the file cannot be read or if section is specified but not found.
   */
  async readNote(filePath: string, section?: string): Promise<string>

  /**
   * Finds the first .md file whose base name matches `name` (case-insensitive,
   * path-agnostic). Returns the absolute path, or null if not found.
   * Throws on filesystem errors.
   */
  async findNote(name: string): Promise<string | null>

  /**
   * Parses a raw wikilink string into its constituent parts.
   * Accepts with or without [[ ]] brackets. No I/O.
   */
  parseWikilink(raw: string): WikilinkParts

  /**
   * Resolves a wikilink to the absolute path of the matching note.
   * Accepts raw wikilink strings (brackets optional). Only the noteName
   * is used for path resolution; section and altText are ignored here —
   * call parseWikilink first to retrieve them.
   * Returns null if no matching file exists. Throws on filesystem errors.
   */
  async resolveWikilink(wikilink: string): Promise<string | null>
}
```

```typescript
// src/vault/template-parser.ts

export type TemplateInput = {
  name: string;        // "faction"
  required: boolean;   // true for (required), false for (optional)
  description: string; // "Wikilink to the faction this NPC belongs to"
};

export type ParsedTemplate = {
  agentPrompt: string;    // prose text extracted from %% == AGENT PROMPT == ... %%,
                          // with the == INPUTS == block removed
  inputs: TemplateInput[]; // parsed from the == INPUTS == block
  bodyMarkdown: string;   // template with the AGENT PROMPT block removed;
                          // all other %% ... %% comments are preserved
};

/**
 * Parses Obsidian templates. Stateless — no constructor args, no side effects.
 */
export class TemplateParser {
  /** Tolerates malformed or absent AGENT PROMPT blocks. */
  parse(content: string): ParsedTemplate
}
```

---

## Sequence / flow

Sprint 3 instantiates the vault layer classes once with the vault root and reuses them throughout context assembly. The typical call chain:

```
Sprint 3 caller
  │
  │  const reader = new VaultReader(vaultRoot)
  │  const parser = new TemplateParser()
  │
  ├─ reader.listNotes()
  │     → string[]  (all .md paths)
  │
  ├─ reader.findNote("Campaign Style")
  │     → "/vault/Campaign Style.md"
  │
  ├─ reader.readNote("/vault/Campaign Style.md")
  │     → full note text
  │
  ├─ [scan note text for [[wikilinks]]]
  │
  ├─ reader.parseWikilink("[[Thieves Guild#Goals]]")
  │     → { noteName: "Thieves Guild", section: "Goals", altText: null }
  │
  ├─ reader.resolveWikilink("[[Thieves Guild#Goals]]")
  │     → "/vault/Factions/Thieves Guild.md"
  │
  └─ reader.readNote("/vault/Factions/Thieves Guild.md", "Goals")
        → "## Goals\nControl the black market..."
```

Sprint 3 calls `parseWikilink` to retrieve the `section`, then passes it to `readNote`. `resolveWikilink` uses only the `noteName` internally and returns the path.

---

## Design decisions

### Decision: Wikilink operations belong on `VaultReader`, not a separate class

**Chosen:** `parseWikilink` and `resolveWikilink` are instance methods on `VaultReader`. Wikilink resolution is inherently a vault operation — it finds a note inside a specific vault. Separating it into its own class would require duplicating `vaultRoot` injection for no gain.

**Alternatives considered:**
- Separate `WikilinkResolver` class. Rejected: both classes would take `vaultRoot` in their constructor, and callers would need to instantiate and carry two objects that represent the same vault. The separation is artificial.

**Rationale:** One vault = one `VaultReader`. All operations that require knowing the vault's contents live on the same object.

> **ADR candidate:** No.

---

### Decision: Class-based design with vault root injected at construction

**Chosen:** `VaultReader` receives `vaultRoot` in its constructor. `TemplateParser` is instantiated with no args since it has no state. This eliminates `vaultRoot` from every method signature and makes the classes substitutable with test doubles in Sprint 3 and 4.

**Alternatives considered:**
- Standalone exported functions (each taking `vaultRoot` as a parameter). Rejected: repeating `vaultRoot` on every call is noisy, and standalone functions are harder to substitute in tests.

**Rationale:** Constructor injection is idiomatic TypeScript OOP, keeps method signatures clean, and aligns with how Sprint 3 will use these classes (instantiate once per generation session, reuse throughout).

> **ADR candidate:** No.

---

### Decision: Section extraction in `readNote` via optional parameter

**Chosen:** `readNote(filePath, section?)` handles section extraction internally when `section` is provided. The extraction algorithm: find the first heading line whose text matches `section` (case-insensitive), then collect all subsequent lines until a heading of equal or shallower depth (or end of file). The heading line itself is included in the returned text.

**Alternatives considered:**
- A separate `extractSection` method on `VaultReader`. Not ruled out, but embedding it in `readNote` avoids exposing an operation that no caller needs independently.

**Rationale:** From Sprint 3's perspective, "read this section of a note" is a single logical operation. The section parameter keeps the call site clean.

> **ADR candidate:** No.

---

### Decision: No external dependencies for filesystem operations

**Chosen:** Use Node.js built-in `fs/promises` throughout. For recursive directory listing, use a simple manual recursive `readdir` rather than `fs.readdir` with `{ recursive: true }` (available in Node 20 but returns relative paths requiring manual resolution).

**Alternatives considered:**
- `glob` or `fast-glob` package. Rejected — no complex patterns needed, dependency is unnecessary.

**Rationale:** Zero new dependencies; behavior is explicit and easy to test.

> **ADR candidate:** No.

---

### Decision: `TemplateParser.parse` only strips the `== AGENT PROMPT ==` block

**Chosen:** Only the `%% == AGENT PROMPT == ... %%` block is removed from `bodyMarkdown`. All other `%% ... %%` comments are preserved. The agent (Sprint 4) receives the body including those comments, which contain field-level generation instructions.

**Alternatives considered:**
- Strip all `%% ... %%` comments. Rejected: field-level comments are intentional agent instructions, not metadata to hide.

**Rationale:** Matches the requirement: only the structured AGENT PROMPT block is extracted; generic comments are the agent's working context.

> **ADR candidate:** No.

---

### Decision: Input declaration syntax — annotated list with `(required)`/`(optional)` qualifier

**Chosen:** Inputs are declared inside the `== AGENT PROMPT ==` block under an `== INPUTS ==` sub-heading, using this format:

```
== INPUTS ==
- name (required): The NPC's full name
- faction (optional): Wikilink to the faction this NPC belongs to
- role (required): Their function in the campaign
```

The parser extracts lines matching `- <name> (required|optional): <description>` under the `== INPUTS ==` heading. The `== INPUTS ==` block itself is stripped from `agentPrompt` before it is returned; only the prose instructions remain.

**Alternatives considered:**
- `*`/`?` suffix (`- name*: ...`). Rejected: unfamiliar to GMs without a development background.
- `@param` directives. Rejected: directive syntax feels code-like rather than natural Markdown; less readable in Obsidian edit mode.

**Rationale:** Readable prose-style syntax that a GM can write without knowing any programming conventions. The parse rule is unambiguous: one regex per line under a known heading.

> **ADR candidate:** No.

---

## Test strategy

All tests are Vitest unit tests co-located with source files (ADR-005, ADR-006). `TemplateParser.parse` and `VaultReader.parseWikilink` are tested with inline strings. The remaining `VaultReader` methods run against the fixture vault on disk.

### `vault-reader.test.ts`
All tests use `new VaultReader(FIXTURE_VAULT_ROOT)`.
- `listNotes()`: returns exactly the 4 `.md` files in the fixture vault
- `findNote()`: finds `Thieves Guild.md` by exact name and by different case; returns `null` for a nonexistent name
- `readNote()`: returns full content of `Campaign Style.md`; extracts `## Goals` subtree from `Thieves Guild.md`; throws when section is not found; throws on bad path
- `parseWikilink()`: plain `[[Note]]`, section `[[Note#Section]]`, alt-text `[[Note|Alt]]`, combined `[[Note#Section|Alt]]`, no brackets
- `resolveWikilink()`: resolves `[[Thieves Guild]]` to the correct path; case-insensitive (`[[thieves guild]]`); returns `null` for `[[Nonexistent Note]]`

### `template-parser.test.ts`
All tests use `new TemplateParser()`.
- Extracts `agentPrompt` (prose only, `== INPUTS ==` block stripped) from the fixture `npc.md` template
- Extracts `inputs` array with correct `name`, `required`, and `description` for each declared input
- `bodyMarkdown` contains structural Markdown with AGENT PROMPT block absent
- Other `%% ... %%` comments in the body are preserved
- Template with no AGENT PROMPT block returns empty `agentPrompt` and empty `inputs`
- Template with an AGENT PROMPT block but no `== INPUTS ==` section returns prose `agentPrompt` and empty `inputs`
- Malformed (unclosed) AGENT PROMPT block: returns partial parse, does not throw

### Fixture vault changes
`src/__tests__/fixtures/test-vault/_templates/npc.md` must be updated to use the new `== INPUTS ==` syntax:

```markdown
%% == AGENT PROMPT ==
Generate a new NPC consistent with the campaign tone and the faction
or location they belong to. Read the faction note and any linked NPCs
before generating. The NPC should feel like they belong to the world
already described — not like a generic fantasy character.

== INPUTS ==
- name (required): The NPC's full name
- faction (optional): Wikilink to the faction this NPC belongs to
- location (optional): Wikilink to the NPC's base location
- role (required): Brief description of their function in the campaign
%%
```

All other fixture vault files are unchanged.

---

## Out of scope / deferred

- Recursive wikilink traversal (Sprint 3 — the vault layer only resolves a single link per call).
- `@[[note-name]]` injection syntax in template comments (Sprint 3 — `TemplateParser` will need a second pass once traversal exists).
- Frontmatter parsing (Sprint 3 — not needed until context assembly).
- Wikilink extraction from note content (finding all `[[ ]]` occurrences in a string) — this is a string utility Sprint 3 will implement; it does not belong in `src/vault/`.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Should `readNote` throw or return `null` when a requested section is not found? | Throw — a missing section is most likely a template authoring error, and silent failures are hard to debug. | Revisit in Sprint 3 if callers prefer a softer failure. |
| What is the canonical section-match algorithm when a note has multiple headings at the same level with the same text? | Match the first occurrence. Duplicate headings are non-standard in Obsidian. | Non-issue for MVP. |
