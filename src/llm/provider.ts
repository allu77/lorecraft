import { bedrock } from '@ai-sdk/amazon-bedrock';
import type { EmbeddingModel, LanguageModel } from 'ai';

/**
 * Returns the configured Amazon Bedrock language model for use with Vercel AI SDK calls.
 * Reads `MODEL_ID` from env (defaults to Claude Haiku for dev iteration speed).
 * AWS credentials and region are resolved by the Bedrock provider from the environment
 * (AWS_REGION, AWS_PROFILE, or standard credential chain).
 *
 * @returns A Vercel AI SDK `LanguageModel` instance backed by Amazon Bedrock.
 */
export function getModel(): LanguageModel {
  const modelId =
    process.env['MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
  return bedrock(modelId);
}

/**
 * Returns an Amazon Bedrock embedding model for use with Vercel AI SDK `embed` /
 * `embedMany` calls. Credentials are resolved the same way as for `getModel()`.
 *
 * @param modelId - Bedrock embedding model ID (e.g. `amazon.titan-embed-text-v2:0`).
 * @returns A Vercel AI SDK `EmbeddingModel` instance backed by Amazon Bedrock.
 */
export function getEmbeddingModel(modelId: string): EmbeddingModel {
  return bedrock.embeddingModel(modelId);
}
