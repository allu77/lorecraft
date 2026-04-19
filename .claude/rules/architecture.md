---
paths:
  - "src/**/*"
  - "app/**/*"
---

# Architecture rules

## Module boundaries — enforce before the monorepo split

- `src/vault/`  has zero dependencies on `src/agent/`, `src/llm/`, `src/cli/`
- `src/agent/`  may import from `src/vault/` and `src/llm/` only
- `src/llm/`    has zero dependencies on other src/ modules
- `src/cli/`    may import from all of the above
- `src/app/api/`    route handlers are thin: receive request, call src/agent/,
                stream response. No business logic in route handlers.
- No circular imports across these modules

## Agent loop

- One agent instance handles all note types
- System prompt assembled dynamically at runtime from:
    1. Campaign style document (always injected)
    2. Template instructions (parsed from %% ... %% comments)
    3. Vault context (wikilink traversal results, budget-filtered)
- Never build separate agent classes or instances per entity type

## Vault access

- All vault reads go through `src/vault/` — no direct fs calls in
  src/agent/, src/llm/, or src/cli/
- Wikilink resolution: case-insensitive filename match, path-agnostic
- Context budget manager in src/agent/ must gate ALL vault traversal calls
- Track tokens consumed per note; truncate/summarise when budget exceeded

## Provider abstraction

- Model instantiated once in `src/llm/provider.ts`
- Import provider adapter from @ai-sdk/amazon-bedrock (or swap)
- No provider-specific types outside of provider.ts

## Writes

- Never call fs.writeFile (or equivalent) outside of an explicitly
  approval-gated code path
- Every write path must have a confirmation step visible to the GM
