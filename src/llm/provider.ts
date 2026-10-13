import { bedrock } from '@ai-sdk/amazon-bedrock';
import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type EmbeddingModel,
  type LanguageModel,
} from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { getLogger } from '../utils/logger.js';
import {
  getLlmProviderName,
  getOllamaConfig,
  type EmbeddingProviderName,
  type LlmProviderName,
} from './config.js';

const DEFAULT_BEDROCK_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

function getBedrockModelId(): string {
  return process.env['MODEL_ID'] ?? DEFAULT_BEDROCK_MODEL_ID;
}

/**
 * Returns the configured language model for use with Vercel AI SDK calls.
 *
 * `LLM_PROVIDER` selects the provider (`bedrock` by default, or `ollama`).
 * - Bedrock: reads `MODEL_ID` (defaults to Claude Haiku for dev iteration speed);
 *   AWS credentials and region come from the standard credential chain.
 * - Ollama: reads `OLLAMA_BASE_URL`, `OLLAMA_MODEL` and `OLLAMA_NUM_CTX`. The context
 *   window is sent as `num_ctx` on every request via a middleware, because the
 *   adapter only reads it from per-call provider options.
 *
 * @returns A Vercel AI SDK `LanguageModel` instance for the configured provider.
 * @throws If `LLM_PROVIDER` or `OLLAMA_NUM_CTX` is invalid.
 */
export function getModel(): LanguageModel {
  if (getLlmProviderName() === 'ollama') {
    const config = getOllamaConfig();
    getLogger('llm').info(
      { model: config.model, numCtx: config.numCtx, baseURL: config.baseURL },
      'ollama model configured',
    );
    const provider = createOllama(config.baseURL ? { baseURL: config.baseURL } : {});
    return wrapLanguageModel({
      model: provider(config.model),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: { ollama: { options: { num_ctx: config.numCtx } } },
        },
      }),
    });
  }
  return bedrock(getBedrockModelId());
}

/**
 * Describes the provider and model that `getModel()` will use, for logging.
 *
 * @returns The active provider name and model ID.
 */
export function getModelInfo(): { provider: LlmProviderName; modelId: string } {
  const provider = getLlmProviderName();
  if (provider === 'ollama') {
    return { provider, modelId: getOllamaConfig().model };
  }
  return { provider, modelId: getBedrockModelId() };
}

/**
 * Context window sent to the provider, in tokens.
 *
 * @returns The Ollama `num_ctx`, or `null` when the provider manages the window itself (Bedrock).
 */
export function getContextWindow(): number | null {
  return getLlmProviderName() === 'ollama' ? getOllamaConfig().numCtx : null;
}

/**
 * Returns an embedding model for use with Vercel AI SDK `embed` / `embedMany` calls.
 * Credentials and connection settings are resolved the same way as for `getModel()`.
 *
 * @param provider - Embedding provider to use.
 * @param modelId - Provider-specific model ID (e.g. `amazon.titan-embed-text-v2:0`, `nomic-embed-text`).
 * @returns A Vercel AI SDK `EmbeddingModel` instance backed by the provider.
 */
export function getEmbeddingModel(
  provider: EmbeddingProviderName,
  modelId: string,
): EmbeddingModel {
  if (provider === 'ollama') {
    const { baseURL } = getOllamaConfig();
    return createOllama(baseURL ? { baseURL } : {}).embeddingModel(modelId);
  }
  return bedrock.embeddingModel(modelId);
}
