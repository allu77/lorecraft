/** Chat providers selectable through `LLM_PROVIDER`. */
export type LlmProviderName = 'bedrock' | 'ollama';

/** Embedding providers selectable through `EMBEDDING_PROVIDER`. */
export type EmbeddingProviderName = 'bedrock' | 'ollama';

/** Ollama connection and model settings resolved from the environment. */
export type OllamaConfig = {
  /** `OLLAMA_BASE_URL`, passed to the adapter verbatim (must include `/api`). Undefined → adapter default. */
  baseURL: string | undefined;
  /** `OLLAMA_MODEL`. */
  model: string;
  /** `OLLAMA_NUM_CTX`: context window sent as `num_ctx` on every request. */
  numCtx: number;
};

export const DEFAULT_OLLAMA_NUM_CTX = 16_384;
/** The adapter's own default, used when `OLLAMA_BASE_URL` is unset. */
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/api';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';
const SUPPORTED_LLM_PROVIDERS: readonly LlmProviderName[] = ['bedrock', 'ollama'];

/**
 * Resolves the chat provider from `LLM_PROVIDER` (default `bedrock`).
 *
 * @returns The selected provider name.
 * @throws If the value is `anthropic` (not implemented) or unknown.
 */
export function getLlmProviderName(): LlmProviderName {
  const value = process.env['LLM_PROVIDER'];
  if (!value) return 'bedrock';
  if (value === 'anthropic') {
    throw new Error(
      `LLM_PROVIDER "anthropic" is not implemented yet. Supported values: ${SUPPORTED_LLM_PROVIDERS.map((p) => `"${p}"`).join(', ')}`,
    );
  }
  if ((SUPPORTED_LLM_PROVIDERS as readonly string[]).includes(value)) {
    return value as LlmProviderName;
  }
  throw new Error(
    `Unknown LLM_PROVIDER: "${value}". Supported values: ${SUPPORTED_LLM_PROVIDERS.map((p) => `"${p}"`).join(', ')}`,
  );
}

/**
 * Reads and validates the Ollama settings from the environment.
 *
 * @returns The resolved Ollama configuration.
 * @throws If `OLLAMA_NUM_CTX` is not a positive integer.
 */
export function getOllamaConfig(): OllamaConfig {
  const rawNumCtx = process.env['OLLAMA_NUM_CTX'];
  let numCtx = DEFAULT_OLLAMA_NUM_CTX;
  if (rawNumCtx !== undefined && rawNumCtx !== '') {
    const parsed = Number(rawNumCtx);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `OLLAMA_NUM_CTX must be a positive integer, got "${rawNumCtx}"`,
      );
    }
    numCtx = parsed;
  }
  return {
    baseURL: process.env['OLLAMA_BASE_URL'] || undefined,
    model: process.env['OLLAMA_MODEL'] || DEFAULT_OLLAMA_MODEL,
    numCtx,
  };
}
