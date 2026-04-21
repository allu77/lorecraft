---
paths:
  - "src/**/*.ts"
---

# Logging rules

- Import `getLogger` from `src/utils/logger.ts` only — never import pino directly; never use `console.*`
- Call `getLogger(module)` inside functions or constructors, not at module top level (runs before `initLogger`)
- Always log with `(obj, msg)` — `obj` carries structured fields, `msg` is a short static string
- Levels: `debug` for per-op detail, `info` for key milestones, `warn`/`error` for problems
- `initLogger()` is called once in `main()` only — tests are silenced via `vitest.setup.ts` automatically
