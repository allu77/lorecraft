import { embed, embedMany } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { getLogger } from '../utils/logger.js';

/** Abstraction over an embedding model that produces float vectors from text. */
export interface EmbeddingProvider {
  /**
   * Embed a single text string.
   * @param text - Text to embed.
   * @returns A float vector of length `dimensions`.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Batch-embed multiple texts. More efficient than calling `embed` in a loop
   * when the provider supports batching.
   * @param texts - Texts to embed.
   * @returns One vector per input, in the same order.
   */
  embedMany(texts: string[]): Promise<number[][]>;

  /** Dimensionality of the output vectors. Used for metadata / cache invalidation. */
  readonly dimensions: number;

  /** Model identifier string. Stored in index metadata; a change forces a full rebuild. */
  readonly modelId: string;
}

const DEFAULT_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const TITAN_V2_DIMENSIONS = 1024;

/**
 * Embedding provider backed by Amazon Bedrock (Titan Embed Text v2 by default).
 * AWS credentials are resolved from the environment via the standard credential
 * chain (same as the LLM provider in `src/llm/provider.ts`).
 */
export class BedrockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly modelId: string;

  /**
   * @param modelId - Bedrock embedding model ID.
   *   Defaults to `amazon.titan-embed-text-v2:0`.
   */
  constructor(modelId = DEFAULT_MODEL_ID) {
    this.modelId = modelId;
    this.dimensions = TITAN_V2_DIMENSIONS;
  }

  async embed(text: string): Promise<number[]> {
    const log = getLogger('embedding-provider');
    log.debug({ modelId: this.modelId, textLength: text.length }, 'embedding text');
    const result = await embed({
      model: bedrock.embeddingModel(this.modelId),
      value: text,
    });
    return result.embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const log = getLogger('embedding-provider');
    log.debug({ modelId: this.modelId, count: texts.length }, 'batch embedding texts');
    if (texts.length === 0) return [];
    const result = await embedMany({
      model: bedrock.embeddingModel(this.modelId),
      values: texts,
    });
    return result.embeddings;
  }
}

/**
 * Returns an `EmbeddingProvider` based on env configuration, or `null` when
 * semantic search is not configured.
 *
 * Reads:
 * - `EMBEDDING_PROVIDER` — must be `'bedrock'` to enable. Absent → returns `null`.
 * - `EMBEDDING_MODEL_ID` — optional override for the Bedrock model ID.
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const provider = process.env['EMBEDDING_PROVIDER'];
  if (!provider) return null;

  if (provider === 'bedrock') {
    const modelId = process.env['EMBEDDING_MODEL_ID'] ?? DEFAULT_MODEL_ID;
    return new BedrockEmbeddingProvider(modelId);
  }

  throw new Error(
    `Unknown EMBEDDING_PROVIDER: "${provider}". Supported values: "bedrock"`,
  );
}
