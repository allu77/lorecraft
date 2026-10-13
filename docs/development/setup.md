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
```
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

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
