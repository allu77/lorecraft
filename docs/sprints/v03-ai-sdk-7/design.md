# Design — v03-ai-sdk-7: Upgrade Vercel AI SDK to 7.x

> **Status:** Approved
> **Sprint:** v03-ai-sdk-7
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

The sprint moves `ai` to 7.0.x and `@ai-sdk/amazon-bedrock` to 5.0.x, adapts the
three code areas that use removed or changed APIs (`src/agent/generation-loop.ts`,
the test mocks, `src/vault/embedding-provider.ts`), and pins versions with `~`
ranges. The design was checked against the migration guide and the type
definitions shipped in `ai@7.0.138`, not just the guide. It also moves the single
stray Bedrock import out of `src/vault/` and behind `src/llm/provider.ts`.

---

## Module map

```
package.json                              (mod) ~ pins, engines.node >=22, @types/node ^22
pnpm-lock.yaml                            (mod) regenerated
docs/development/setup.md                 (mod) Node 22+ requirement
docs/architecture/decisions.md            (mod) ADR-001 "latest" -> pinned ~ range; ADR-004 note on boundary
src/
├── llm/
│   └── provider.ts                       (mod) adds getEmbeddingModel(); only file importing the Bedrock adapter
├── vault/
│   ├── embedding-provider.ts             (mod) drops Bedrock import, calls getEmbeddingModel()
│   └── embedding-provider.test.ts        (mod) mocks ../llm/provider.js instead of the Bedrock package
├── agent/
│   └── generation-loop.ts                (mod) isStepCount, stream, usage, responseMessages
└── __tests__/
    ├── cli.integration.test.ts           (mod) MockLanguageModelV4 if required (see decision 3)
    ├── generation-loop.integration.test.ts (mod) same
    └── agent-vault.integration.test.ts   (mod) same
```

`src/agent/tools.ts` uses only `tool()` with `inputSchema` and `execute`; it needs
no change (verified against the guide; to be confirmed by typecheck).

---

## Interfaces and data types

```typescript
// src/llm/provider.ts
import type { EmbeddingModel, LanguageModel } from 'ai';

export function getModel(): LanguageModel;                        // unchanged

/**
 * Returns the Bedrock embedding model for the given model ID.
 * The only place that calls bedrock.embeddingModel().
 */
export function getEmbeddingModel(modelId: string): EmbeddingModel;
```

`EmbeddingProvider` (the interface in `src/vault/embedding-provider.ts`),
`BedrockEmbeddingProvider`, and `getEmbeddingProvider()` keep their current public
signatures. `GenerateResult`, `TokenUsage` and `StreamCallbacks` in
`generation-loop.ts` are unchanged. No other sprint's contract changes.

---

## Sequence / flow

Behaviour for the GM is unchanged. Internally, in `GenerationSession`:

1. `create()` builds `new ToolLoopAgent({ model, instructions, tools, stopWhen: isStepCount(n) })`.
2. `generate()` / `reply()` call `agent.stream(...)` and iterate `streamResult.stream`
   (was `fullStream`). Part types handled (`text-delta`, `reasoning-*`, `tool-call`)
   are unchanged.
3. After the loop, usage is read from `await streamResult.usage` (the all-steps total;
   was `totalUsage`) and passed to `normalizeUsage()`.
4. The conversation history is extended with `await streamResult.responseMessages`
   (was `(await streamResult.response).messages`). See decision 2.

Embeddings: `BedrockEmbeddingProvider.embed/embedMany` call
`embed({ model: getEmbeddingModel(this.modelId), ... })`, with `getEmbeddingModel`
imported from `../llm/provider.js`.

---

## Design decisions

### Decision 1: Read `usage`, not `totalUsage`, and not `finalStep.usage`
**Chosen:** `await streamResult.usage`.
**Alternatives considered:** keep `totalUsage` (works as a deprecated alias, removed
in a future major); use `finalStep.usage` (last step only, would under-report cost).
**Rationale:** In v7, `usage` is the sum across all steps and `totalUsage` is
`@deprecated`. This preserves the requirement that reported tokens equal the sum
across tool-loop steps. Reading `usage` without this change would still compile,
which is why a test must assert the multi-step sum.
> **ADR candidate:** No

### Decision 2: Build follow-up history from `responseMessages`
**Chosen:** `await streamResult.responseMessages`.
**Alternatives considered:** keep `(await streamResult.response).messages` (the
property is `@deprecated` in favor of `finalStep.response`, and the guide says step
response messages are no longer accumulated); flatten `steps` manually.
**Rationale:** This is the highest-risk change in the sprint. If the old code were
kept, the history could contain only the final step's messages. After a tool-using
turn the next `reply()` would then lose the assistant tool calls and tool results, and
the model's context would silently degrade. It would still typecheck. A multi-step
integration test (tool call, then answer, then follow-up) must verify the second
request contains the tool messages.
> **ADR candidate:** No

### Decision 3: Mock model class follows what the v7 `ai/test` export requires
**Chosen:** Check at implementation time which mock `ai@7` expects. The package
exports both `MockLanguageModelV3` and `MockLanguageModelV4`, and the v7 provider
spec is V4. Move tests to `MockLanguageModelV4` if V3 models do not run or are
flagged deprecated; otherwise keep V3 for now and note it.
**Alternatives considered:** always switch to V4 (may require rewriting the chunk
shapes in three files for no behavioural gain if V3 still works); build our own
mock (loses the SDK-maintained fixture, contradicts ADR-006).
**Rationale:** Minimal change that keeps tests meaningful. The task list includes
a spike to decide this before editing the three files.
> **ADR candidate:** No

### Decision 4: Provider boundary for embeddings is a function returning the SDK type
**Chosen:** `getEmbeddingModel(modelId): EmbeddingModel` in `src/llm/provider.ts`.
**Alternatives considered:** move the whole `EmbeddingProvider` implementation into
`src/llm/` (bigger move, changes ADR-004 wording, touches `vault/` imports and tests
for no benefit); pass the model into `BedrockEmbeddingProvider` via its constructor
(pushes the import to callers such as `cli/index.ts` and `inspect.ts`).
**Rationale:** Smallest change that makes `grep` for the Bedrock package match only
`provider.ts`. `src/vault/` importing from `src/llm/` is allowed by ADR-002 (only
imports from `agent/` and `cli/` are forbidden). `EmbeddingProvider`,
`getEmbeddingProvider()` and env handling stay as ADR-004 describes, so no ADR-004
change is needed beyond a one-line note.
> **ADR candidate:** Yes. Amend ADR-004 with a line stating that the Bedrock
> adapter is reached only via `src/llm/provider.ts`.

### Decision 5: Use manual edits rather than `npx @ai-sdk/codemod v7`
**Chosen:** Apply the three edits by hand, using the codemod only as a dry-run
cross-check if it runs offline.
**Alternatives considered:** run the full codemod across the repo.
**Rationale:** Only `stepCountIs` and `fullStream` are in scope, and neither the
`usage` nor the `responseMessages` change is something the codemod table covers.
Running broad rewrites over the repo adds review noise.
> **ADR candidate:** No

### Decision 6: Pin with `~` and raise `@types/node` to `^22`
**Chosen:** `ai`, `@ai-sdk/amazon-bedrock`, `zod` use `~` ranges to the resolved
versions; `engines.node >=22`; `@types/node` moves from `^20` to `^22` to match the
runtime.
**Alternatives considered:** leave `@types/node` at `^20` (type errors against Node
22 APIs are unlikely but possible, and it misstates the supported runtime).
**Rationale:** Aligns type surface with the enforced runtime. Change is
low-risk, verified by typecheck.
> **ADR candidate:** Yes. Amend ADR-001: replace "(latest)" with "pinned to `~`
> ranges; upgrades are explicit sprints".

---

## Test strategy

Follows ADR-006 (Vitest; SDK mock models; fixture vault).

- **Existing suites must pass:** `embedding-provider.test.ts`,
  `generation-loop.integration.test.ts`, `cli.integration.test.ts`,
  `agent-vault.integration.test.ts`, `tools.test.ts`.
- **`embedding-provider.test.ts`:** replace the Bedrock package mock with a mock of
  `../llm/provider.js` exposing `getEmbeddingModel`; same cases, plus one asserting
  it is called with `EMBEDDING_MODEL_ID` when set.
- **New in `generation-loop.integration.test.ts`:**
  1. *Multi-step usage:* a mock model that makes a tool call on step 1 and answers on
     step 2, each reporting different usage; assert `GenerateResult.usage` equals the
     sum (Decision 1).
  2. *History after tools:* after that run, call `reply()` and assert the request the
     mock model receives includes the assistant tool call and the tool result
     (Decision 2).
- **`provider.ts`:** a small unit test that `getEmbeddingModel('x')` returns a model
  whose `modelId` is `x` (no network).
- **Boundary check:** a test (or a documented grep in CI) that the Bedrock package is
  imported only from `src/llm/provider.ts`.
- **Manual smoke (when AWS creds exist):** `pnpm cli` generation with a tool call
  and a semantic search; compare usage and cost output against the pre-upgrade run.
- No fixture vault changes. No snapshot tests.

---

## Out of scope / deferred

- Renaming other deprecated-but-working aliases we do not use (telemetry, `onFinish`
  and so on) because there is no usage in the codebase.
- v7 features (durable agents, tool approvals, `runtimeContext`/`toolsContext`):
  future sprints.
- Replacing `ts`/`tsx` runner or adding `"type": "module"`, unless the CLI check
  fails (see open questions).
- Dependency upgrades other than those v7 forces and `@types/node`.

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Does `pnpm cli` (tsx) load ESM-only `ai@7` and the 5.x provider? | Yes: Node 22.22 supports `require(esm)` and tsx handles ESM; verified in the first task | Task 1 spike |
| Do `MockLanguageModelV3` instances work with `ai@7`? | Probably yes via compatibility wrapping; if not, move to V4 | Task 1 spike (Decision 3) |
| Is `streamResult.responseMessages` available on the object `ToolLoopAgent.stream()` returns? | It is typed as a `StreamTextResult` member, so yes; confirmed by typecheck | Task 2 |
| Which exact 7.0.x and 5.0.x patch versions to pin? | Newest at implementation time (7.0.138 / 5.0.114 today) | Task 1 |
| Does `@ai-sdk/amazon-bedrock@5` change the `bedrock.embeddingModel()` API name? | No: the code already uses `embeddingModel`; confirmed by typecheck | Task 1 |
