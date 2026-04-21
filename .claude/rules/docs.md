---
paths:
  - "docs/**/*"
---

# Documentation rules

## Principles

- docs/ is the single source of truth for all planning and architecture
- Never duplicate content between docs/ and CLAUDE.md
- Decisions that affect the architecture belong in
  docs/architecture/decisions.md as ADR entries

## ADR format (docs/architecture/decisions.md)

Each decision follows this structure:

### ADR-NNN: Title
- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by ADR-NNN
- **Context:** Why this decision was needed
- **Decision:** What was decided
- **Consequences:** Trade-offs and follow-on work

## Testing rules (loaded when editing test files)

- Snapshot files (*.snap) are committed and reviewed like source code
- An unexpected snapshot diff means context assembly behaviour changed —
  understand the diff before accepting it
- The fixture vault in src/__tests__/fixtures/test-vault/ is a first-class
  repo asset — update it when template format or vault conventions change
