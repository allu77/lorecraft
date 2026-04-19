# Requirements — mvp-sprint-00: Foundation & Tooling

> **Status:** Draft
> **Sprint:** mvp-sprint-00
> **Created:** 2026-04-19
> **Design doc:** [design.md](design.md)
> **Tasks:** [tasks.md](tasks.md)

---

## Goal

At the end of this sprint, a developer can clone the repository, run
`pnpm install`, and immediately execute `pnpm test` and `pnpm typecheck`
with both commands passing. All runtime and development dependencies are
installed, the Vitest test runner is configured, and package.json scripts
are wired up. There is no production logic — this sprint exists solely to
give subsequent sprints a working foundation to build on.

---

## Scope

### In scope

- Install runtime dependencies: `ai`, `@ai-sdk/amazon-bedrock`, `zod`
- Install dev dependencies: `vitest`, `@vitest/ui`, `execa`
- Create `vitest.config.ts` with globals enabled, coverage configured,
  and `@/*` path aliases resolving to `src/*`
- Add `test`, `test:watch`, `typecheck`, and `cli` scripts to
  `package.json`
- One trivial smoke test (e.g. `expect(1).toBe(1)`) to confirm Vitest
  is correctly wired

### Out of scope

- All production logic: vault reading, wikilink resolution, template
  parsing, LLM provider, agent loop, CLI entry point (Sprint 1–5)
- Any real implementation in `src/vault/`, `src/agent/`, `src/llm/`,
  or `src/cli/`
- CI pipeline configuration (GitHub Actions or similar)
- Placeholder files or stub exports for future modules

---

## Constraints

- Must use Vitest as the test framework (ADR-005)
- Must use pnpm as the package manager — never npm or yarn
- Must run on Node.js 20+
- Path alias `@/*` must resolve to `src/*` in both TypeScript and Vitest

---

## Acceptance criteria

- [ ] `pnpm install` completes without errors
- [ ] `pnpm test` runs and passes (at least one test present)
- [ ] `pnpm typecheck` runs and exits with code 0
- [ ] `pnpm test:watch` script exists and starts Vitest in watch mode
- [ ] `pnpm cli` script exists (may point to a not-yet-implemented entry
      point; the script definition itself is the deliverable)
- [ ] `vitest.config.ts` exists with globals, coverage, and `@/*` alias
      configured

---

## Open questions and assumptions

| Question | Assumption | Risk if wrong |
|---|---|---|
| Does the existing `tsconfig.json` already define `@/*` path aliases? | It does not — `vitest.config.ts` will define the alias, and `tsconfig.json` will be updated if needed | Minor rework if tsconfig already has conflicting alias config |

---

## Reference

- ADR-001: Vercel AI SDK as the agentic framework
- ADR-005: Vitest as the testing framework
- Vision doc: Tech stack section
- Sprint plan: `docs/planning/mvp-sprints.md` — Sprint 0
