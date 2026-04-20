# Requirements — mvp-sprint-04: CLI & Full Integration

> **Status:** Draft
> **Sprint:** mvp-sprint-04
> **Created:** 2026-04-20
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

At the end of this sprint, a GM can run `pnpm cli`, type `/generate npc name:"Mira" role:Spy`, watch the note stream to the terminal in real time, and then iteratively refine it by typing free-form follow-up messages — all in the same session. When satisfied, the GM copy-pastes the final output into their vault. This is the MVP deliverable: a working command-line interface that wires the full pipeline (vault reader → context assembly → generation loop) to a readline REPL with a multi-turn refinement conversation.

---

## User stories

**As a** GM, **I want** to start Lorecraft from the terminal **so that** I can interact with it via typed commands.

- [ ] `pnpm cli` boots without error and prints a welcome message.
- [ ] A `>` prompt waits for input.
- [ ] `/help` prints a summary of available commands.
- [ ] `/exit` (or Ctrl-C) exits cleanly with a goodbye message.
- [ ] Vault root is read from the `VAULT_ROOT` env var. If unset, a clear error is printed on the first `/generate` attempt (not at startup).

**As a** GM, **I want** to run `/generate <type> [key:value ...]` **so that** a lore-consistent note is generated for the entity type I specify.

- [ ] The command is parsed as: first token = entity type (e.g. `npc`), remaining tokens = key:value input pairs.
- [ ] Quoted values are supported: `name:"Mira Shadowcloak"` and `faction:"Thieves Guild"` are correctly parsed.
- [ ] The entity type maps to a template file at `{VAULT_ROOT}/_templates/{type}.md`. If the template file is not found, a clear error is printed.
- [ ] `generateContent` is called with the parsed vault root, template path, and inputs. If required inputs are missing, the error message is printed clearly.
- [ ] Streamed output is displayed incrementally. A visual delimiter is printed before and after the generated content.
- [ ] A token report is printed after generation: `Tokens: {inputTokens} input / {outputTokens} output / {totalTokens} total`.
- [ ] A new `/generate` command always resets the conversation — previous history is discarded and context is re-assembled from the vault.

**As a** GM, **I want** to type free-form follow-up messages after a generation **so that** I can iteratively refine the note without leaving the REPL.

- [ ] Any input that does not begin with `/` is treated as a continuation message in the current conversation.
- [ ] The message is appended to the conversation history and sent to the LLM along with the full prior exchange (system prompt + all previous turns).
- [ ] The LLM's response is streamed to the terminal with the same delimiter treatment as the initial generation.
- [ ] A token report is printed after each continuation response.
- [ ] If no conversation is active (no `/generate` has been run), free-form input prints a hint to use `/generate` first.

**As a** GM, **I want** to use the LLM as a creative collaborator across multiple turns **so that** I can explore alternatives and refine details before copying the final result.

- [ ] The LLM has access to the full conversation history on each continuation turn (multi-turn context window).
- [ ] The LLM can respond to any free-form message: proposing changes, listing alternatives, asking clarifying questions, or generating a revised full note — whatever the message warrants.
- [ ] The system prompt (campaign context, template instructions, vault notes) remains fixed for the entire conversation started by `/generate`. Only the `messages` array grows with each turn.

---

## Out of scope

- Direct vault writes — output is copy-pasted manually (ADR-003).
- `/generate` for types other than those with a matching `_templates/{type}.md` file — the CLI is generic but requires the template file to exist.
- Tab completion, history persistence across sessions, ANSI colour formatting — not needed at MVP.
- Multi-word entity type names — the type token is always a single word.
- Config file or setup wizard — `VAULT_ROOT` env var is sufficient.

---

## Constraints

- All vault reads go through `src/vault/` — no direct `fs` calls in `src/cli/` (architecture rules).
- `src/cli/` may import from `src/agent/`, `src/vault/`, and `src/llm/` (architecture rules).
- `generateContent` handles initial context assembly; continuation turns must go through `src/agent/` as well — no raw `streamText` calls in `src/cli/` (architecture rules).
- No provider-specific types in `src/cli/` (ADR-001).
- TypeScript strict mode; JSDoc on all exported functions (typescript rules).

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Should continuation turns re-assemble vault context (re-read notes) or reuse the context from the initial `/generate`? | Reuse the context assembled during `/generate`. The system prompt is fixed for the lifetime of the conversation. Re-reading on every turn would be wasteful and inconsistent. | If the GM edits a vault note mid-session, those edits won't be visible until the next `/generate`. Acceptable at MVP. |
| How should the CLI integration test mock the LLM, given it is a readline REPL? | The CLI exports a `processCommand` function that accepts an optional `model` injection, enabling tests to call it directly in-process with `MockLanguageModelV3`. No `execa` child process spawning for MVP. | Slightly lower test fidelity (doesn't test the readline layer), but avoids complex stdin/stdout piping in tests. |
| Does `generateContent` (sprint 03) need modification to support continuation turns? | Yes — it needs to return the assembled `system` string and initial `messages` array so the CLI can extend them. Sprint 04 will add a `continueContent` function in `src/agent/generation-loop.ts` that accepts those plus new user message. | Touching sprint 03 code is required; the existing function signature is unchanged, only additive. |
| What model parameters should continuation turns use? | Same model, same system prompt, no additional parameters. Simple one-shot per user message, not streaming back intermediate reasoning. | Fine for MVP. |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-003: Vault writes require explicit GM approval
- ADR-006: Integration testing strategy
- Sprint 3 deliverables: `src/agent/generation-loop.ts` (`generateContent`, `GenerateOptions`, `GenerateResult`)
- Sprint plan: `docs/planning/mvp-sprints.md` — Sprint 4 section
