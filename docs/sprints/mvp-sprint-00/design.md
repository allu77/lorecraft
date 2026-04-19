# Design — mvp-sprint-00: Foundation & Tooling

> **Status:** Draft
> **Sprint:** mvp-sprint-00
> **Requirements:** [requirements.md](requirements.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Overview

This sprint adds no production logic. It installs the runtime and dev
dependencies required by all subsequent sprints, wires up Vitest, and
adds the missing `package.json` scripts. The only new source file is a
trivial smoke test. Two existing files are modified: `package.json`
(scripts + dependencies) and no changes are needed to `tsconfig.json`
(the `@/*` alias is already configured there).

---

## Module map

```
lorecraft/
├── package.json                (modified) add scripts + dependencies
├── vitest.config.ts            (new) Vitest configuration
└── src/
    └── __tests__/
        └── setup.test.ts       (new) trivial smoke test
```

No files in `src/vault/`, `src/agent/`, `src/llm/`, or `src/cli/` are
touched. Existing `.gitkeep` stubs are left in place.

---

## Interfaces and data types

None. This sprint introduces no types or exported functions.

---

## Sequence / flow

This sprint has no runtime flow. The relevant sequence is the developer
workflow:

1. Developer runs `pnpm install` — new deps are resolved from the
   updated `package.json`
2. Developer runs `pnpm typecheck` — `tsc --noEmit` validates the
   project compiles cleanly
3. Developer runs `pnpm test` — Vitest discovers `setup.test.ts`,
   runs it, and exits 0
4. All subsequent sprints can add `*.test.ts` files and run `pnpm test`
   without any further configuration

---

## Design decisions

### Decision: vitest.config.ts path alias mirrors tsconfig.json

**Chosen:** Configure `resolve.alias` in `vitest.config.ts` to map
`@/` → `path.resolve(__dirname, 'src')`, matching the existing
`tsconfig.json` `paths` entry.

**Alternatives considered:**
- Use `vite-tsconfig-paths` plugin to read aliases from `tsconfig.json`
  automatically — adds a dependency for a trivial case; manual alias is
  simpler and more explicit.

**Rationale:** `tsconfig.json` already defines `"@/*": ["./src/*"]`.
Vitest's resolver is separate and does not read `tsconfig.json` paths
by default. A one-line alias in `vitest.config.ts` is the minimal
correct fix. The two definitions are intentionally kept in sync.

> **ADR candidate:** No — this is standard Vitest setup, not a
> project-level decision.

---

### Decision: Smoke test lives in src/__tests__/setup.test.ts

**Chosen:** Place the trivial smoke test at
`src/__tests__/setup.test.ts`.

**Alternatives considered:**
- Co-locate at `src/smoke.test.ts` — no module to co-locate with.
- Top-level `tests/` directory — contradicts ADR-006 layout.

**Rationale:** `src/__tests__/` is the designated home for tests that
are not co-located with a specific module (per ADR-006 test file
layout). The smoke test belongs there until a real module exists to
attach a unit test to.

> **ADR candidate:** No.

---

### Decision: cli script uses npx ts-node

**Chosen:** `"cli": "npx ts-node src/cli/index.ts"` — consistent with
CLAUDE.md documentation.

**Alternatives considered:**
- `tsx` — better native ESM support, but adds a dev dependency and
  diverges from documented CLAUDE.md behaviour.

**Rationale:** The `cli` script is a stub this sprint; `src/cli/index.ts`
does not exist yet. Using `npx ts-node` defers the ts-node vs tsx
decision to Sprint 5 when the CLI is actually implemented. Resolving
it now would be premature.

> **ADR candidate:** No — defer to Sprint 5.

---

## Test strategy

Per ADR-006:

- **Unit tests:** None this sprint (no production logic to test).
- **Integration tests:** None this sprint.
- **Smoke test:** `src/__tests__/setup.test.ts` — a single `expect(1).toBe(1)`
  assertion. Its sole purpose is to confirm Vitest discovers and runs
  test files correctly.
- **Snapshot tests:** None this sprint.

The fixture vault at `src/__tests__/fixtures/test-vault/` already
exists and is not modified by this sprint.

---

## Out of scope / deferred

- Vitest coverage thresholds — deferred until real code exists to measure
- `@vitest/coverage-v8` vs `@vitest/coverage-istanbul` choice — deferred;
  no coverage runs until Sprint 1
- `ts-node` vs `tsx` for the CLI runner — deferred to Sprint 5
- ESLint configuration for test files — not needed until tests contain
  real logic

---

## Open questions

| Question | Assumption | Flagged for |
|---|---|---|
| Should `vitest.config.ts` configure a coverage provider? | Include `coverage` config block with `provider: 'v8'` but do not install `@vitest/coverage-v8` yet — it is only needed when coverage is actually run | Sprint 1, when first unit tests are added |
