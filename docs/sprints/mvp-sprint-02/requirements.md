# Requirements — mvp-sprint-02: Context Assembly

> **Status:** Draft
> **Sprint:** mvp-sprint-02
> **Created:** 2026-04-19
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

At the end of this sprint, Lorecraft can take a parsed template, a campaign style document, and a set of vault notes, and produce a well-formed, budget-bounded prompt ready to be sent to an LLM. The LLM provider is configured and accessible to the rest of the codebase. Although no actual generation happens yet (Sprint 3), the full input side of the pipeline is complete and verified by integration tests with snapshot assertions.

---

## User stories

**As a** developer, **I want** to define a system prompt template with base instructions and named placeholders **so that** the AI always receives a consistent framing ("you are a GM assistant that…") regardless of which entity type is being generated.

- [ ] The system prompt has a fixed base — a prose description of Lorecraft's role and behaviour as a GM assistant
- [ ] The base prompt contains named placeholders for: campaign style, template agent instructions, gathered context notes, and user inputs
- [ ] The placeholder structure is documented so Sprint 3 can fill it correctly

**As a** developer building the generation loop, **I want** a function that fills the system prompt placeholders with actual content and returns a provider-ready prompt **so that** Sprint 3 can call it without knowing how context was gathered or how the budget was enforced.

- [ ] Campaign style is always injected before template instructions, which are always injected before context notes — order is fixed and deterministic
- [ ] User-supplied inputs (e.g. name, faction) are included in the prompt
- [ ] A prompt can be assembled with no context notes and remains valid

**As a** GM, **I want** the generation instructions I write in my template to be included in every prompt for that note type **so that** the AI follows my template-specific directions without me repeating them each time.

- [ ] Template agent instructions (from the `%% == AGENT PROMPT == %%` block) are always present in the assembled prompt
- [ ] If a template has no agent instructions block, the prompt is still valid — the placeholder is simply empty

**As a** developer building the generation loop, **I want** a mechanism that tracks how many tokens of vault context have been included and enforces a configurable ceiling **so that** vault traversal in Sprint 3 can never produce an unbounded prompt.

- [ ] The token ceiling is configurable via an environment variable
- [ ] The mechanism can report whether a given piece of text fits within the remaining budget before it is added
- [ ] The mechanism rejects content that would exceed the ceiling — it does not silently truncate or drop notes
- [ ] Token counting does not require a live LLM call

**As a** developer, **I want** an integration test that verifies the shape of the assembled prompt against the fixture vault **so that** future changes to context assembly are caught before they reach production.

- [ ] The test runs against real vault files on disk — no in-memory stubs for vault content
- [ ] The test does not make live LLM calls
- [ ] A snapshot of the assembled prompt is committed to the repository and fails the test if it changes unexpectedly

---

## Out of scope

- LLM provider instantiation and `getModel()` — implemented in Sprint 3 when first needed
- Recursive wikilink traversal and note collection (Sprint 3 — context assembly receives already-collected notes as input)
- Actual LLM calls or streaming (Sprint 3)
- CLI interface (Sprint 4)
- Truncating or summarising notes that exceed the budget — notes that do not fit are skipped by the caller; no automatic summarisation (v0.1+)
- `@[[note-name]]` injection syntax in template comments (Sprint 3 — requires traversal)
- Frontmatter parsing — notes are treated as raw Markdown strings at this stage

---

## Constraints

- No vault writes under any code path in this sprint (ADR-003)
- A context budget must gate all vault content included in a prompt — uncapped prompt assembly is not allowed (sprint plan constraint)
- All tests use Vitest (ADR-005)
- Snapshot files are committed and reviewed like source code (ADR-006)

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| How accurate does token counting need to be for the MVP? | A character-based approximation is sufficient — the goal is reliable ceiling enforcement, not billing accuracy | If the approximation is too coarse the prompt may run 20–30% over or under budget. Acceptable for MVP; revisit if a model's hard context limit becomes a practical problem. |
| Should context assembly receive pre-read note content, or should it read vault files itself? | It receives already-read content — callers are responsible for reading and filtering notes before passing them in | If Sprint 3 needs to filter notes mid-assembly the interface may need to change. Low risk given the architecture boundary between vault/ and agent/. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready boundaries
- ADR-003: Vault writes require explicit GM approval
- ADR-005: Vitest as the testing framework
- ADR-006: Integration testing strategy (snapshot tests on assembled prompt)
- Sprint plan: `docs/planning/mvp-sprints.md` — Sprint 2 section
- PR/FAQ: "What is the approach to context window management?" and "What is the recommended agentic framework?"
