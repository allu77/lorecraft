import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from './provider.js';
import { getLogger } from '../utils/logger.js';

const DEFAULT_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const TITAN_V2_DIMENSIONS = 1024;

/**
 * Embedding provider backed by Amazon Bedrock (Titan Embed Text v2 by default).
 * AWS credentials are resolved from the environment via the standard credential
 * chain (same as the LLM provider in `src/llm/provider.ts`).
 *
 * Satisfies the `EmbeddingProvider` interface in `src/vault/embedding-provider.ts`
 * structurally; `src/llm/` must not import from `src/vault/`.
 */
export class BedrockEmbeddingProvider {
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
      model: getEmbeddingModel(this.modelId),
      value: text,
    });
    return result.embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const log = getLogger('embedding-provider');
    log.debug({ modelId: this.modelId, count: texts.length }, 'batch embedding texts');
    if (texts.length === 0) return [];
    const result = await embedMany({
      model: getEmbeddingModel(this.modelId),
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
export function getEmbeddingProvider(): BedrockEmbeddingProvider | null {
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
