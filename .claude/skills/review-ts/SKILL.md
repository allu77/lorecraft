---
name: review-ts
description: >
  Reviews TypeScript files against Lorecraft project rules, fixes violations,
  runs Prettier + ESLint, and verifies the test suite passes.
  Use when you want a focused TS rules pass on changed or specific files.
  Invoke with /review-ts [file-or-glob ...] (omit for all files changed vs main).
argument-hint: "[file-or-glob ...]"
disable-model-invocation: true
allowed-tools: Glob, Grep, LS, Read, Edit, Bash(git *), Bash(pnpm *)
effort: medium
---

# TypeScript Review — Lorecraft

You are performing a TypeScript rules review and fix pass for the Lorecraft project.

## Project rules

The rules below are the single source of truth. Do not infer rules from the
codebase — use only what is stated here.

@docs/development/typescript-rules.md

@docs/development/typescript-style-guide.md

---

## Phase 1 — Determine scope

If `$ARGUMENTS` is non-empty, use those files/globs as the scope.
Otherwise collect TypeScript files changed versus `main`:

```bash
git diff --name-only main...HEAD -- '*.ts' '*.tsx'
```

If the list is empty, say "No TypeScript files in scope." and stop.

---

## Phase 2 — Review

Read each file. Check every rule against its content. Do not stop ad the most obvious. Every rule is important.

Print a review report grouped by file:

```
### src/agent/context-builder.ts

- [TR-1] line 42 (95): `payload: any` → use `unknown` or define a proper type
- [TS-2] line 17 (85): exported `buildPrompt` missing JSDoc
```

Then ask:

> "Found N violations. Apply all fixes?"

Wait for the user's reply before proceeding.

---

## Phase 3 — Fix

Apply every approved fix using Edit.

## Phase 4 — Test

```bash
pnpm test
```

If tests fail:
- Read the failure output carefully.
- Fix only if the failure is directly caused by your edits.
- If the failure is pre-existing or unrelated, say so and stop — do not
  attempt to fix unrelated test failures.

---

## Phase 5 — Final report

Print a concise summary:

```
## Review complete

Files reviewed   : N
Violations found : N
Fixes applied    : N
Tests            : N passed, 0 failed
```
