# Lorecraft MVP — Sprint Plan

## Overview

The codebase is fully scaffolded (module boundaries, ADRs, fixture vault, TypeScript config) but has zero implementation. The MVP deliverable is a working CLI tool where a GM can run `/generate npc name:foo faction:bar` and get a lore-consistent note via an interactive refinement loop.

Key constraints from ADRs:
- Vercel AI SDK + `@ai-sdk/amazon-bedrock` (ADR-001)
- Vitest for all tests (ADR-005)
- No vault writes without GM approval (ADR-003)
- Context budget required before any vault traversal
- Token consumption reported after every generation

---

## Dependency Graph

```
Sprint 0 (Foundation)
         │
         ▼
Sprint 1 (Vault Layer)
         │
         ▼
Sprint 2 (Context Assembly)
         │
         ▼
Sprint 3 (Generation Loop)
         │
         ▼
Sprint 4 (CLI & Integration)
```

All sprints are strictly sequential.

---

## Sprint 0 — Foundation & Tooling

**Goal:** Runnable test suite, installed dependencies, CI-ready skeleton. No production logic.

| Task | Detail |
|------|--------|
| Install runtime deps | `ai`, `@ai-sdk/amazon-bedrock`, `zod` |
| Install dev deps | `vitest`, `@vitest/ui`, `execa` |
| `vitest.config.ts` | Configure globals, coverage, path aliases (`@/*`) |
| `package.json` scripts | Add `test`, `test:watch`, `typecheck`, `cli` |
| Smoke test | One trivial passing test to confirm setup |

**Exit criteria:** `pnpm test` passes; `pnpm typecheck` passes.

---

## Sprint 1 — Vault Layer

**Goal:** Read vault files, resolve wikilinks, parse templates with agent instructions.

| File | Responsibility |
|------|---------------|
| `src/vault/vault-reader.ts` | List files, read file content, find file by name |
| `src/vault/wikilink-resolver.ts` | Resolve `[[Note Name]]` → absolute path |
| `src/vault/template-parser.ts` | Parse `%% AGENT PROMPT %%` blocks, extract required inputs and field definitions |
| Unit tests (co-located `*.test.ts`) | Against fixture vault at `src/__tests__/fixtures/test-vault/` |

**Key behaviours:**
- `resolveWikilink(name, vaultRoot)` → `string | null` — scans all `.md` files, returns first match by filename (Obsidian convention)
- `parseTemplate(content)` → `{ requiredInputs: string[], agentPrompt: string, fields: string[] }` — strips `%% ... %%` blocks, extracts structured instructions
- All operations are read-only (ADR-003)

**Exit criteria:** Unit tests pass covering happy path, missing file, and circular-link edge cases.

---

## Sprint 2 — Context Assembly

**Depends on:** Sprint 1

**Goal:** Given vault content and a template, assemble a well-formed, budget-bounded prompt. Includes the thin LLM provider setup (`src/llm/provider.ts`) as a prerequisite task.

| File | Responsibility |
|------|---------------|
| `src/llm/provider.ts` | Instantiate Bedrock model from env vars, expose `getModel()` |
| `src/agent/context-budget.ts` | Token counter, budget enforcer, truncation strategy |
| `src/agent/prompt-builder.ts` | Assemble system prompt: campaign style + template instructions + gathered context |
| `src/__tests__/agent-vault.integration.test.ts` | Real fixture vault on disk, LLM mocked; snapshot-tests the assembled prompt |

**Key behaviours:**
- `getModel()` returns an AI SDK `LanguageModel` configured from env vars; no provider-specific types leak outside this file (ADR-001)
- `ContextBudget(maxTokens)` tracks running token count; `.fits(text)` and `.add(text)` methods
- `buildPrompt({ campaignStyle, templateInstructions, contextNotes, userInputs })` → `CoreMessage[]`
- Integration test uses `toMatchSnapshot()` on assembled prompt (ADR-006 — catches context assembly regressions)
- `CONTEXT_BUDGET_TOKENS` env var controls the budget ceiling

**Exit criteria:** Integration tests pass; snapshot files committed; context budget respected.

---

## Sprint 3 — Generation Loop

**Depends on:** Sprint 2

**Goal:** Full agentic pipeline — input resolution, recursive vault traversal, generation, iterative refinement.

| File | Responsibility |
|------|---------------|
| `src/agent/generation-loop.ts` | Orchestrates the full cycle end-to-end |

**Loop sequence:**
1. Parse template → extract required inputs
2. Validate provided args against required inputs
3. For each missing input: scan vault first → if not found, queue for user prompt
4. Once inputs resolved: recursively fetch wikilinked context notes (depth-limited by budget)
5. Assemble prompt via `prompt-builder`, enforce context budget
6. Stream generation from LLM via AI SDK `streamText`; collect full response
7. Present to user; accept `change` / `approve` commands
8. On approve: output final markdown; on change: re-generate with user feedback appended
9. Report token consumption (input + output tokens from `result.usage`) after each generation

**Exit criteria:** Integration test drives the loop end-to-end against fixture vault with mocked LLM; approval gate verified; token report emitted.

---

## Sprint 4 — CLI & Full Integration

**Depends on:** Sprint 3

**Goal:** Working CLI — the GM-facing MVP deliverable.

| File | Responsibility |
|------|---------------|
| `src/cli/index.ts` | REPL, `/generate` command parser, streaming display, approve/change flow |
| `src/__tests__/cli.integration.test.ts` | Spawn CLI as child process via `execa`, assert on stdout |

**Key behaviours:**
- `/generate <type> [key:value...]` parses entity type and args, dispatches to generation loop
- Streaming output displayed incrementally (Vercel AI SDK streaming)
- After generation: prompt `[approve / change / cancel]`
- On approve: print final note content with a clear delimiter; user copy-pastes to vault (ADR-003 — no direct writes in MVP)
- Token report printed after each generation

**Exit criteria:** `pnpm cli` boots REPL; CLI integration tests pass; `pnpm typecheck` passes; manual smoke test against local vault.

---

## Sprint Summary

| Sprint | Title | Depends on |
|--------|-------|------------|
| Sprint 0 | Foundation & Tooling | — |
| Sprint 1 | Vault Layer | Sprint 0 |
| Sprint 2 | Context Assembly | Sprint 1 |
| Sprint 3 | Generation Loop | Sprint 2 |
| Sprint 4 | CLI & Integration | Sprint 3 |

**Critical path:** 0 → 1 → 2 → 3 → 4 = 5 sprints, strictly sequential.
