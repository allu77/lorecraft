# Requirements — mvp-sprint-03: Generation Loop

> **Status:** Draft
> **Sprint:** mvp-sprint-03
> **Created:** 2026-04-20
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

At the end of this sprint, a developer can call `generateContent(...)` programmatically, point it at the fixture vault, and receive a fully assembled, LLM-generated markdown note. The function resolves template inputs from the vault, assembles a budget-bounded prompt, and streams the response — returning the full text and a token usage report. The generation loop module is the core agentic engine; the GM-facing CLI transport layer (Sprint 4) will wrap it and handle printing. The GM copy-pastes the output into the vault manually.

---

## User stories

**As a** GM, **I want** the system to automatically fetch relevant vault notes when generating content **so that** my generated output is consistent with lore I've already documented.

- [ ] Given a template with `[[wikilinks]]` in its body, the loop resolves each link against the vault and includes the note content in the prompt as long as budget allows.
- [ ] Context notes are added in order of resolution; a note that would exceed the budget is skipped (not truncated).
- [ ] The assembled prompt passed to the LLM matches the shape produced by `buildPrompt` from Sprint 2.

**As a** GM, **I want** the system to resolve missing template inputs from the vault before prompting me **so that** I don't have to re-type facts I've already recorded.

- [ ] For each required input declared in the template that is not supplied by the caller, the loop searches the vault by note name; if a match is found its content is used as the resolved value.
- [ ] Required inputs that cannot be resolved from the vault are surfaced to the caller via an `onPromptUser` callback so the transport layer (CLI, web) can ask the GM interactively.
- [ ] Resolved inputs are logged clearly so the GM can verify what the system found.

**As a** GM, **I want** to see the generated note and token consumption after generation **so that** I can copy the content into my vault and track API costs.

- [ ] `generateContent` returns the full generated markdown text and a `TokenUsage` object (input tokens, output tokens, total tokens).
- [ ] Token data is read from `result.usage` provided by the Vercel AI SDK after `streamText` completes.
- [ ] The caller (Sprint 4 CLI) is responsible for printing output; `generateContent` does not write to stdout.

---

## Out of scope

- Terminal I/O (stdout printing, ANSI formatting) — Sprint 4 CLI.
- `/generate` command parsing — Sprint 4 CLI.
- Interactive approve/change/cancel refinement loop — the MVP output is copy-pasted manually by the GM; iterative refinement is a future enhancement.
- Saving generated content to the vault — future (behind GM approval gate, ADR-003).
- Multi-type entity dispatch (NPCs, factions, items, etc.) — the loop is generic; Sprint 4 wires types.
- Semantic search / embedding-based note retrieval — v0.2 (ADR-004).
- Cost estimation in dollars — deferred until provider pricing constants are confirmed.
- Depth-limited recursive wikilink traversal (following wikilinks inside fetched notes) — the loop fetches first-level links from the template body only; recursive traversal is v0.2.

---

## Constraints

- Must use Vercel AI SDK `streamText` for generation (ADR-001).
- All vault reads must go through `src/vault/` — no direct `fs` calls in `src/agent/` (architecture rules).
- Context budget manager (`ContextBudget`) must gate every vault read before adding content to the prompt.
- No vault writes anywhere in this sprint (ADR-003).
- Provider-specific types must not leak outside `src/llm/provider.ts` (ADR-001).
- TypeScript strict mode; no `any`; JSDoc on all exported symbols (typescript rules).

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| How should missing required inputs be handled when the caller provides no `onPromptUser` callback? | If omitted, missing inputs cause a hard error listing which inputs are missing. | Callers that expect a soft failure would need a different signal — adjust to return an error result instead of throwing. |
| How are wikilinks extracted from the template body? | Simple regex over `[[...]]` patterns in the raw template body (already available from `TemplateParser.bodyMarkdown`). No AST needed at MVP. | Nested brackets or escaped links could break the regex — acceptable edge case at MVP scale. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready boundaries
- ADR-003: Vault writes require explicit GM approval
- ADR-005: Vitest as the testing framework
- ADR-006: Integration testing strategy — snapshot tests on assembled prompt; mock LLM at provider boundary
- Sprint 2 deliverables: `src/agent/context-budget.ts`, `src/agent/prompt-builder.ts`, `src/__tests__/agent-vault.integration.test.ts`
- Sprint plan: `docs/planning/mvp-sprints.md` — Sprint 3 section
