# Lorecraft

AI co-author for tabletop RPG Game Masters.

Lorecraft reads your Obsidian vault and generates lore-consistent campaign
content — NPCs, locations, factions, monsters, session notes — via a CLI
(MVP) and a locally hosted web UI (v0.4+).

## Quick start

```bash
pnpm install
pnpm cli
```

## Documentation

- [Vision](docs/vision/lorecraft-prfaq.md)
- [PR/FAQ](docs/vision/lorecraft-vision.md)
- [Architecture decisions](docs/architecture/decisions.md)
- [Local dev setup](docs/development/setup.md)

## Roadmap

| Phase | Milestone |
|---|---|
| MVP | CLI: wikilink traversal, template-driven generation |
| v0.1 | Keyword search |
| v0.2 | Semantic search (embeddings) |
| v0.3 | Multi-agent orchestration, generic campaign chat |
| v0.4 | Locally hosted web UI |
| v0.5 | Edit existing notes |
