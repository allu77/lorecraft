## Code Quality rules

- [TR-01] No `any` — use `unknown` and narrow, or define a proper type
- [TR-02] Prefer `type` over `interface` for data shapes; use `interface` only for extension contracts
- [TR-03] Exports: named exports only — no default exports except Next.js page and layout components
- [TR-04] Async: always async/await, never raw Promise chains
- [TR-05] Error handling: always type-narrow errors (if (error instanceof Error))
- [TR-06] Zod for all external/untrusted input validation: LLM tool call inputs, template frontmatter, env vars
- [TR-07] If a variable of type string can have only a set of values, declare the list of possible values as the type
