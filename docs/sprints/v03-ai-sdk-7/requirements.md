# Requirements — v03-ai-sdk-7: Upgrade Vercel AI SDK to 7.x

> **Status:** Approved
> **Sprint:** v03-ai-sdk-7
> **Created:** 2026-10-13
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

After this sprint Lorecraft runs on Vercel AI SDK 7.x (`ai`) with the matching
Amazon Bedrock provider (`@ai-sdk/amazon-bedrock` 5.x), with dependency versions
pinned so the SDK can no longer change underneath the project unnoticed. The GM sees
no change in behaviour: generation, tool use, semantic search and token/cost
reporting work exactly as before. For developers, the codebase is ready for future v7
capabilities, and every Bedrock provider import lives in `src/llm/provider.ts` as the
core invariants require.

---

## User stories

**As a** developer, **I want** `ai` and `@ai-sdk/amazon-bedrock` upgraded to the 7.x /
5.x lines **so that** the project is on the supported SDK major and ready for future
evolution.

1. `package.json` declares `ai` as `~7.0.x` and `@ai-sdk/amazon-bedrock` as `~5.0.x`
   (tilde ranges, no `latest`), and `pnpm-lock.yaml` resolves to those versions.
2. `zod` is pinned with a tilde range to the version currently resolved in the
   lockfile (4.3.6), within the `ai` peer range (`^3.25.76 || ^4.1.8`).
3. `pnpm install` from a clean checkout succeeds with no peer-dependency warnings
   attributable to the SDK.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` all pass.

---

**As a** developer, **I want** all code adapted to the v7 API changes **so that** no
deprecated or removed APIs remain in use.

1. `stepCountIs` is replaced by `isStepCount` in `src/agent/generation-loop.ts`.
2. `streamResult.fullStream` is replaced by `streamResult.stream` in
   `src/agent/generation-loop.ts` (both generation and follow-up paths).
3. A grep of `src/` finds none of the v7-removed or renamed identifiers listed in the
   migration guide (`experimental_*` options, `cachedInputTokens`, `reasoningTokens`,
   `ToolCallOptions`, `system:` prompt option, `onFinish`/`onStepFinish`, etc.).
4. `ToolLoopAgent` and `tool()` usage in `src/agent/` is reviewed against the v7
   guide; any required change is made, and any non-change is recorded in the design.

---

**As a** GM, **I want** token and cost reporting to keep working after the upgrade
**so that** I still see accurate input, output and estimated cost after every
generation.

1. After each generation and follow-up, the reported `inputTokens` and `outputTokens`
   come from the v7 `totalUsage` and equal the sum across all tool-loop steps.
2. Existing token-reporting tests pass unchanged, or are updated only for the v7
   result shape, with the reason noted in the commit.
3. A manual smoke run against real Bedrock (when AWS credentials are available) shows
   non-zero usage and a cost estimate.

---

**As a** developer, **I want** the test suite to work with the v7 mock models **so
that** the ADR-006 integration testing strategy remains valid.

1. The three integration test files using `MockLanguageModelV3` from `ai/test`
   (`cli`, `generation-loop`, `agent-vault`) pass against SDK 7, using whatever mock
   class and spec version v7 requires.
2. `src/vault/embedding-provider.test.ts` passes against the 5.x Bedrock provider.
3. No test is skipped, disabled or loosened to reach green.

---

**As a** developer, **I want** the project to declare and enforce the runtime SDK 7
requires **so that** nobody runs it on an unsupported Node version.

1. `package.json` has `"engines": { "node": ">=22" }`.
2. `docs/development/setup.md` states the Node 22+ requirement.
3. The `pnpm cli` entry point and the Vitest/Next.js toolchain work under ESM-only SDK
   packages on Node 22 (verified by running the CLI, tests and build).

---

**As a** developer, **I want** all Bedrock provider usage routed through
`src/llm/provider.ts` **so that** the core invariant "no provider-specific code
outside `src/llm/provider.ts`" holds.

1. `src/vault/embedding-provider.ts` no longer imports `@ai-sdk/amazon-bedrock`; the
   Bedrock embedding model is obtained from `src/llm/provider.ts`.
2. `grep -r "@ai-sdk/amazon-bedrock" src` matches only `src/llm/provider.ts` (and
   test mocks of it).
3. `EMBEDDING_PROVIDER=bedrock` behaviour, defaults and error messages are unchanged.
4. The `vault/` module does not gain an import from `agent/` or `cli/` (ADR-002).
5. Embedding-provider unit tests are updated to mock the new boundary and still cover
   the same cases.

---

## Out of scope

- Adopting new v7 features (durable agents, tool approvals, unified telemetry, speech
  APIs). They are candidates for later sprints.
- Changing LLM models, prompts, context budgeting or search behaviour.
- Moving from Bedrock to another provider.
- Upgrading Next.js, Vitest, TypeScript or other dependencies, except where v7 forces
  it.
- Automated dependency update tooling (Renovate/Dependabot).
- The web UI (v0.4+); no `app/` code exists yet.

---

## Constraints

- Vercel AI SDK remains the agentic framework (ADR-001); this sprint amends its
  "latest" wording to a pinned `~` range.
- No provider-specific types outside `src/llm/provider.ts`; the provider remains
  swappable via `.env`.
- Must run on Node.js 22+ (SDK 7 requirement).
- The vault is never written to without GM approval; the upgrade must not change this.
- `vault/` may not import from `agent/` or `cli/` (ADR-002).
- Version ranges use `~` for `ai`, `@ai-sdk/amazon-bedrock` and `zod`.

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Which `ai` 7.0.x patch to pin? | The newest 7.0.x at implementation time (7.0.138 today) | A later patch could contain a regression; the lockfile and tests limit exposure |
| Does `MockLanguageModelV3` still work with `ai@7`? | It may need a newer mock class; the design phase will check the package's `ai/test` exports | Test rewrites grow beyond a rename |
| Does the `ts-node`-based `pnpm cli` work with ESM-only packages? | Yes, given the project's current module config; to be verified in design | May require a runner or `tsconfig` change |
| How should `embedding-provider.ts` obtain the Bedrock embedding model? | `src/llm/provider.ts` exports an `getEmbeddingModel()` function returning the SDK's `EmbeddingModel` type | A different boundary shape may suit ADR-004 better; to be decided in design |
| Does ADR-004 explicitly allow Bedrock use in `src/vault/`? | No; it only chooses Bedrock embeddings. If it does, the ADR is amended | The import move would conflict with a recorded decision |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-002: Single package, monorepo-ready boundaries
- ADR-004: Amazon Bedrock embeddings for semantic search
- ADR-006: Integration testing strategy
- AI SDK 7.0 migration guide: shipped in the `ai` package at
  `docs/08-migration-guides/23-migration-guide-7-0.mdx` (codemods: `npx @ai-sdk/codemod v7`)
- `CLAUDE.md` core invariants (provider swappable; no provider types outside
  `src/llm/provider.ts`)
