# Tasks — v03-ai-sdk-7: Upgrade Vercel AI SDK to 7.x

> **Status:** Not started
> **Sprint:** v03-ai-sdk-7
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/v03-ai-sdk-7/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "v03-ai-sdk-7-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [x] 001 — Verify the CI baseline on the current AI SDK 6 setup
  - Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; fix any pre-existing failures before proceeding
  - Record the resolved versions (`ai` 6.0.168, zod 4.3.6) for rollback reference in the commit message
- [x] 002 — Upgrade dependencies, pin with `~`, and run the compatibility spike
  (`package.json`, `pnpm-lock.yaml`)
  - Set `ai` and `@ai-sdk/amazon-bedrock` to `~` ranges of the newest 7.0.x / 5.0.x; pin `zod` with `~4.3.6`
  - Add `"engines": { "node": ">=22" }`; raise `@types/node` to `^22`
  - Run `pnpm install` and confirm there are no SDK-related peer warnings
  - Spike, results written into the commit message: (a) does `pnpm cli` start under ESM-only packages (tsx)? (b) do `MockLanguageModelV3` instances still run, or must tests move to `MockLanguageModelV4`? (c) full list of typecheck errors
  - Expected: typecheck and tests may be red after this task. The next tasks fix them.

### Core implementation

- [x] 003 — Migrate the test mock models (`src/__tests__/cli.integration.test.ts`,
  `src/__tests__/generation-loop.integration.test.ts`,
  `src/__tests__/agent-vault.integration.test.ts`)
  - Apply the decision from task 002 (design Decision 3); change nothing if V3 still works
  - Do not skip, disable or loosen any test
- [x] 004 — Adapt the generation loop to the v7 API (`src/agent/generation-loop.ts`)
  - `stepCountIs` → `isStepCount`
  - `streamResult.fullStream` → `streamResult.stream` (generate and reply paths)
  - `await streamResult.totalUsage` → `await streamResult.usage` (Decision 1)
  - `(await streamResult.response).messages` → `await streamResult.responseMessages` (Decision 2)
  - Review `tools.ts` and `ToolLoopAgent` options against the v7 guide; record non-changes in the commit message
- [x] 005 — Add `getEmbeddingModel(modelId)` (`src/llm/provider.ts`)
  - Returns `bedrock.embeddingModel(modelId)` typed as the SDK's `EmbeddingModel`
- [x] 006 — Move the Bedrock embedding implementation into `src/llm/`
  (`src/llm/embedding-provider.ts`, `src/vault/embedding-provider.ts`,
  `src/cli/index.ts`, `src/cli/inspect.ts`)
  - Move `BedrockEmbeddingProvider` and `getEmbeddingProvider()` to `src/llm/embedding-provider.ts`; call `getEmbeddingModel` from `./provider.js`; no import from `src/vault/` (structural typing)
  - `src/vault/embedding-provider.ts` keeps only the `EmbeddingProvider` interface
  - Point `cli/index.ts` and `cli/inspect.ts` at the new location of `getEmbeddingProvider`
  - Behaviour, env vars and error messages unchanged (design Decision 4)

### Tests

- [x] 007 — [test] Multi-step usage and history tests for task 004
  (`src/__tests__/generation-loop.integration.test.ts`)
  - Mock model: tool call on step 1, answer on step 2, with different usage per step; assert `GenerateResult.usage` is the sum
  - Then call `continue()` and assert the request the mock receives contains the assistant tool call and the tool result
  - Confirm the history test fails against the old `response.messages` code, if feasible
- [x] 008 — [test] `getEmbeddingModel` unit test for task 005 (`src/llm/provider.test.ts`)
  - `getEmbeddingModel('x')` returns a model with `modelId` `'x'`; no network
- [x] 009 — [test] Move and update embedding provider tests for task 006
  (`src/llm/embedding-provider.test.ts`, from `src/vault/embedding-provider.test.ts`)
  - Replace the Bedrock package mock with a mock of `./provider.js`; keep all existing cases
  - Add a case asserting `getEmbeddingModel` is called with `EMBEDDING_MODEL_ID` when set

### Integration

- [x] 010 — [test] Provider boundary check (`src/__tests__/provider-boundary.test.ts`)
  - Scan `src/**/*.ts` (excluding test files); assert that `@ai-sdk/amazon-bedrock` is imported only from `src/llm/provider.ts`
  - Assert that `src/vault/` has no imports from `src/agent/` or `src/cli/` (ADR-002)
- [ ] 011 — Sweep for removed or renamed v7 identifiers
  - `grep` `src/` for `stepCountIs`, `fullStream`, `totalUsage`, `cachedInputTokens`, `reasoningTokens`, `ToolCallOptions`, `experimental_`, `onFinish`, `onStepFinish`; fix or justify each hit
  - Optionally cross-check with `npx @ai-sdk/codemod v7` as a dry run, and do not apply its changes wholesale
- [ ] 012 — Full verification and manual smoke test
  - `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  - `pnpm cli` starts; with AWS credentials: run a generation that uses a tool and a semantic search, and compare usage and cost output with the pre-upgrade run; without credentials, say so in the commit message

### Documentation and wrap-up

- [ ] 013 — Document the Node 22+ requirement (`docs/development/setup.md`)
- [ ] 014 — Amend ADRs (`docs/architecture/decisions.md`)
  - ADR-001: replace "(latest)" with pinned `~` ranges; upgrades happen as explicit sprints
  - ADR-004: the `EmbeddingProvider` interface lives in `src/vault/`; the Bedrock implementation lives in `src/llm/` and reaches the adapter only via `src/llm/provider.ts`
- [ ] 015 — Fixture vault: no change expected; confirm and tick
  (`src/__tests__/fixtures/test-vault/`)
- [ ] 016 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

| Task | Blocked by | Since |
|---|---|---|
| | | |

---

## Discovered during sprint

<!-- Log bugs, scope changes, and new tasks here, not as ad-hoc checkboxes above.

- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->

- [x] 017 — Fix `tools.test.ts` type errors: v7 `ToolExecutionOptions` requires `context`; 4 call sites pass `{ messages, toolCallId }` (`src/agent/tools.test.ts`) (discovered: 2026-10-13)
- [x] 018 — Review and update the prompt snapshot in `generation-loop.integration.test.ts`: v7 adds `headers: { user-agent: 'ai-sdk-agent/tool-loop' }`, `reasoning: undefined`, and drops `providerOptions` on the tool entry; prompt content is unchanged (discovered: 2026-10-13)
