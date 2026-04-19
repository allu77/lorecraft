# Tasks — mvp-sprint-00: Foundation & Tooling

> **Status:** Not started
> **Sprint:** mvp-sprint-00
> **Requirements:** [requirements.md](requirements.md)
> **Design:** [design.md](design.md)

---

## How to work through these tasks

1. Open a new Claude Code session for each task (keeps context clean)
2. Reference the design doc at the start of each session:
   `read @docs/sprints/mvp-sprint-00/design.md`
3. Use plan mode: describe the task, approve the plan, let it execute
4. Run `pnpm typecheck && pnpm test` before marking a task done
5. Commit after each completed task with the task ID in the message:
   `git commit -m "mvp-sprint-00-NNN: <description>"`
6. Check the box in this file after the commit

---

## Tasks

### Setup

- [ ] 001 — Add runtime deps, dev deps, and missing scripts to `package.json`
  - Runtime deps to add: `ai`, `@ai-sdk/amazon-bedrock`, `zod`
  - Dev deps to add: `vitest`, `@vitest/ui`, `execa`
  - Scripts to add: `test` (`vitest run`), `test:watch` (`vitest`),
    `typecheck` (`tsc --noEmit`), `cli` (`npx ts-node src/cli/index.ts`)
  - Run `pnpm install` after editing (`package.json`)

### Core implementation

- [ ] 002 — Create `vitest.config.ts` with globals, coverage block, and `@/*` alias
  - `globals: true`
  - `coverage.provider: 'v8'` (config block only — do not install
    `@vitest/coverage-v8` yet)
  - `resolve.alias`: `@/` → `path.resolve(__dirname, 'src')`
  - (`vitest.config.ts`)

### Tests

- [ ] 003 — [test] Create smoke test to confirm Vitest is wired
  - Single assertion: `expect(1).toBe(1)`
  - (`src/__tests__/setup.test.ts`)

### Integration

- [ ] 004 — Verify full exit criteria
  - `pnpm install` completes without errors
  - `pnpm typecheck` exits 0
  - `pnpm test` passes (smoke test green)
  - `pnpm test:watch` script launches Vitest in watch mode
  - No task except confirming all pass and committing

### Documentation and wrap-up

- [ ] 005 — Update `docs/sprints/overview.md` to mark sprint complete
  (`docs/sprints/overview.md`)

---

## Blocked tasks

| Task | Blocked by | Since |
|---|---|---|
| — | — | — |

---

## Discovered during sprint

<!-- Bugs found, scope changes, or new tasks that emerged during
coding that were not in the original plan. Log them here rather
than adding ad-hoc checkboxes above, so the original plan stays
readable.

- [ ] NNN — Description (discovered: YYYY-MM-DD)
-->
