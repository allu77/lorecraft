---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript rules

- Strict mode: "strict": true in tsconfig — never disable
- No `any` — use `unknown` and narrow, or define a proper type
- Prefer `type` over `interface` for data shapes; use `interface`
  only for extension contracts
- File naming: kebab-case (e.g. vault-reader.ts, prompt-builder.ts)
- Exports: named exports only — no default exports except Next.js
  page and layout components
- Async: always async/await, never raw Promise chains
- Error handling: always type-narrow errors
  (if (error instanceof Error))
- Zod for all external/untrusted input validation: LLM tool call
  inputs, template frontmatter, env vars
