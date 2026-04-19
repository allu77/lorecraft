# Design — {{sprint-id}}: {{title}}

> **Status:** Draft | Approved
> **Sprint:** {{sprint-id}}
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

<!-- Two to four sentences. What is being built and how does it fit
into the existing module structure? Name the modules involved. -->

---

## Module map

<!-- Which existing modules are touched, and what new files are
created? Use a tree or table. For each file, one line explaining
its responsibility.

src/
├── vault/
│   ├── wikilink-resolver.ts   (new) resolves [[Note Name]] to filepath
│   └── ...
-->

---

## Interfaces and data types

<!-- The key TypeScript types and function signatures that this sprint
introduces. These become the contracts between modules. Other sprints
depend on these being stable.

Do not write implementation — only signatures and types.

```typescript
// src/vault/wikilink-resolver.ts
export type WikilinkResolution =
  | { found: true; path: string }
  | { found: false; wikilink: string };

export async function resolveWikilink(
  vaultRoot: string,
  wikilink: string
): Promise<WikilinkResolution>
```
-->

---

## Sequence / flow

<!-- For the main user-visible flow in this sprint, describe the
sequence of calls across modules. ASCII diagram or numbered steps.
Reference the function signatures defined above.

1. GM types `/generate npc name:"Mira" faction:"Thieves Guild"`
2. cli/index.ts parses the command → calls agents/generate.ts
3. agents/generate.ts calls vault/template-parser.ts to read npc.md
4. ...
-->

---

## Design decisions

<!-- For each significant decision, state: what was decided, what
alternatives were considered, and why this choice was made.
Flag ADR candidates explicitly.

### Decision: X
**Chosen:** ...
**Alternatives considered:** ...
**Rationale:** ...
> **ADR candidate:** Yes / No
-->

---

## Test strategy

<!-- How will this sprint's code be tested? Reference ADR-006.

- Which functions get unit tests? (list them)
- Which integration scenarios are covered by agent-vault tests?
- Does the fixture vault need new notes for this sprint? If so, what?
- Are any snapshot tests needed?
-->

---

## Out of scope / deferred

<!-- Design decisions that were considered but explicitly deferred.
State what was deferred and why (usually: not needed for this sprint's
acceptance criteria, will be revisited in sprint-N). -->

---

## Open questions

<!-- Any design-level questions that remain unresolved. If proceeding
with an assumption, state it here.

| Question | Assumption | Flagged for |
|---|---|---|
| | | |
-->
