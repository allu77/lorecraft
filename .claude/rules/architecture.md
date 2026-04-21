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

## Vault access

- All vault reads go through `src/vault/` — no direct fs calls in
  src/agent/, src/llm/, or src/cli/
- Wikilink resolution: case-insensitive filename match, path-agnostic
- Context budget manager in src/agent/ must gate ALL vault traversal calls
- Track tokens consumed per note; truncate/summarise when budget exceeded

