# Local Development Setup

## Prerequisites

- Node.js 22+ (required by AI SDK 7; Node 24 LTS recommended)
- pnpm (`npm install -g pnpm`)
- AWS credentials configured (for Bedrock) **or** an Anthropic API key
  **or** Ollama installed locally

## Install

```bash
git clone <repo>
cd lorecraft
pnpm install
```

## Environment

Copy `.env.example` to `.env` and fill in your provider credentials:

```bash
cp .env.example .env
```

### Amazon Bedrock (default)
```
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_PROFILE=default
```

Set `MODEL_ID` to choose the generation model (a Bedrock model or inference-profile ID
enabled for your account). If unset it defaults to
`us.anthropic.claude-haiku-4-5-20251001-v1:0`. Embeddings use `EMBEDDING_MODEL_ID`
(default `amazon.titan-embed-text-v2:0`) when `EMBEDDING_PROVIDER=bedrock`.

### Anthropic direct
```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Ollama (local, no account required)

Install [Ollama](https://ollama.com), then pull a chat model that supports tool
calling and (optionally) an embedding model:

```bash
ollama pull llama3.1          # or qwen3
ollama pull nomic-embed-text  # for semantic search
```

```
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/api
OLLAMA_MODEL=llama3.1
OLLAMA_NUM_CTX=16384

# Optional: local semantic search
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL_ID=nomic-embed-text
```

- `OLLAMA_BASE_URL` is passed to the adapter as written, so it **must end in `/api`**.
  When unset the adapter uses `http://127.0.0.1:11434/api`.
- `OLLAMA_NUM_CTX` is sent as `num_ctx` on every request. Ollama's own default
  (2k to 4k tokens) silently truncates the vault context Lorecraft assembles, which is
  why Lorecraft defaults to 16384. Keep it at least `CONTEXT_BUDGET_TOKENS + 4096`; the
  session logs a warning when it is too small. Larger windows use more RAM/VRAM.
- Known embedding models are `nomic-embed-text` (768 dimensions), `mxbai-embed-large`
  (1024) and `all-minilm` (384). For any other model set `EMBEDDING_DIMENSIONS`.
- Switching `EMBEDDING_PROVIDER` or `EMBEDDING_MODEL_ID` marks the existing embedding
  index stale; run `/index rebuild`.
- Not every local model handles tool calls reliably. If wikilink or search tools are
  never called, try a different model.
- Errors: "Cannot reach Ollama" means the server is not running or `OLLAMA_BASE_URL` is
  wrong; "model ... is not available" means run `ollama pull <model>`.

#### Smoke test

1. `ollama serve` (or the desktop app), pull the two models above.
2. Set the variables above and `VAULT_ROOT`, then `pnpm cli`.
3. `/index rebuild` — expect "Embedding index built ... (nomic-embed-text)".
4. `/generate npc name:"Mira" role:Spy` — expect streamed text, tool calls (if the
   template uses them) and a `Tokens:` line, and no context-window warning in the log
   (`/verbose on` shows it).

## Run the CLI

```bash
pnpm cli
```

Point Lorecraft at your vault when prompted, or set:
```
VAULT_ROOT=/path/to/your/obsidian/vault
```

## Run tests

```bash
pnpm test           # run all tests once
pnpm test:watch     # watch mode
pnpm test:coverage  # with coverage report
```

## Type check

```bash
pnpm typecheck
```

Always run before committing. CI will fail on type errors.

## Web UI (v0.4+)

```bash
pnpm dev    # starts Next.js on http://localhost:3000
```

Not functional until v0.4. The app/ directory is scaffolded but empty.
