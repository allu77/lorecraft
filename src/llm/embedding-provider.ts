import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from './provider.js';
import type { EmbeddingProviderName } from './config.js';
import { getLogger } from '../utils/logger.js';

const DEFAULT_BEDROCK_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const TITAN_V2_DIMENSIONS = 1024;
const DEFAULT_OLLAMA_MODEL_ID = 'nomic-embed-text';
const SUPPORTED_EMBEDDING_PROVIDERS: readonly EmbeddingProviderName[] = ['bedrock', 'ollama'];

/**
 * Output dimensions of the Ollama embedding models Lorecraft knows about.
 * Models outside this table need `EMBEDDING_DIMENSIONS`.
 */
export const OLLAMA_EMBEDDING_DIMENSIONS: Readonly<Record<string, number>> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
};

/**
 * Shared embedding implementation over the Vercel AI SDK. Subclasses fix the provider.
 *
 * Satisfies the `EmbeddingProvider` interface in `src/vault/embedding-provider.ts`
 * structurally; `src/llm/` must not import from `src/vault/`.
 */
abstract class AiSdkEmbeddingProvider {
  readonly dimensions: number;
  readonly modelId: string;
  private readonly provider: EmbeddingProviderName;

  protected constructor(provider: EmbeddingProviderName, modelId: string, dimensions: number) {
    this.provider = provider;
    this.modelId = modelId;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const log = getLogger('embedding-provider');
    log.debug({ provider: this.provider, modelId: this.modelId, textLength: text.length }, 'embedding text');
    const result = await embed({
      model: getEmbeddingModel(this.provider, this.modelId),
      value: text,
    });
    return result.embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const log = getLogger('embedding-provider');
    log.debug({ provider: this.provider, modelId: this.modelId, count: texts.length }, 'batch embedding texts');
    if (texts.length === 0) return [];
    const result = await embedMany({
      model: getEmbeddingModel(this.provider, this.modelId),
      values: texts,
    });
    return result.embeddings;
  }
}

/**
 * Embedding provider backed by Amazon Bedrock (Titan Embed Text v2 by default).
 * AWS credentials are resolved from the environment via the standard credential
 * chain (same as the LLM provider in `src/llm/provider.ts`).
 */
export class BedrockEmbeddingProvider extends AiSdkEmbeddingProvider {
  /**
   * @param modelId - Bedrock embedding model ID.
   *   Defaults to `amazon.titan-embed-text-v2:0`.
   */
  constructor(modelId = DEFAULT_BEDROCK_MODEL_ID) {
    super('bedrock', modelId, TITAN_V2_DIMENSIONS);
  }
}

/**
 * Embedding provider backed by a local Ollama server (`nomic-embed-text` by default).
 * The server location comes from `OLLAMA_BASE_URL`.
 */
export class OllamaEmbeddingProvider extends AiSdkEmbeddingProvider {
  /**
   * @param modelId - Ollama embedding model name. Defaults to `nomic-embed-text`.
   * @param dimensions - Output vector length. Defaults to the model's known dimension (768).
   */
  constructor(
    modelId = DEFAULT_OLLAMA_MODEL_ID,
    dimensions = OLLAMA_EMBEDDING_DIMENSIONS[DEFAULT_OLLAMA_MODEL_ID]!,
  ) {
    super('ollama', modelId, dimensions);
  }
}

function resolveOllamaDimensions(modelId: string): number {
  const raw = process.env['EMBEDDING_DIMENSIONS'];
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`EMBEDDING_DIMENSIONS must be a positive integer, got "${raw}"`);
    }
    return parsed;
  }
  const known = OLLAMA_EMBEDDING_DIMENSIONS[modelId.split(':')[0]!];
  if (known === undefined) {
    throw new Error(
      `Unknown Ollama embedding model "${modelId}": set EMBEDDING_DIMENSIONS to its output size, or use one of ${Object.keys(OLLAMA_EMBEDDING_DIMENSIONS).join(', ')}`,
    );
  }
  return known;
}

/**
 * Returns an embedding provider based on env configuration, or `null` when
 * semantic search is not configured.
 *
 * Reads:
 * - `EMBEDDING_PROVIDER` — `'bedrock'` or `'ollama'` to enable. Absent → returns `null`.
 * - `EMBEDDING_MODEL_ID` — optional override for the model ID.
 * - `EMBEDDING_DIMENSIONS` — Ollama only; overrides the known-model dimension table.
 *
 * @throws If the provider is unknown, or an Ollama model's dimension cannot be determined.
 */
export function getEmbeddingProvider(): BedrockEmbeddingProvider | OllamaEmbeddingProvider | null {
  const provider = process.env['EMBEDDING_PROVIDER'];
  if (!provider) return null;

  if (provider === 'bedrock') {
    return new BedrockEmbeddingProvider(
      process.env['EMBEDDING_MODEL_ID'] ?? DEFAULT_BEDROCK_MODEL_ID,
    );
  }

  if (provider === 'ollama') {
    const modelId = process.env['EMBEDDING_MODEL_ID'] ?? DEFAULT_OLLAMA_MODEL_ID;
    return new OllamaEmbeddingProvider(modelId, resolveOllamaDimensions(modelId));
  }

  throw new Error(
    `Unknown EMBEDDING_PROVIDER: "${provider}". Supported values: ${SUPPORTED_EMBEDDING_PROVIDERS.map((p) => `"${p}"`).join(', ')}`,
  );
}
