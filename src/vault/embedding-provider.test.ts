import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEmbeddingProvider, BedrockEmbeddingProvider } from './embedding-provider.js';

// Mock the Vercel AI SDK embed functions to avoid real Bedrock calls
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>();
  return {
    ...original,
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    embedMany: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
  };
});

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  bedrock: {
    embeddingModel: vi.fn().mockReturnValue({ modelId: 'mock-embedding-model' }),
  },
}));

describe('getEmbeddingProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when EMBEDDING_PROVIDER is not set', () => {
    delete process.env['EMBEDDING_PROVIDER'];
    expect(getEmbeddingProvider()).toBeNull();
  });

  it('returns BedrockEmbeddingProvider when EMBEDDING_PROVIDER=bedrock', () => {
    process.env['EMBEDDING_PROVIDER'] = 'bedrock';
    const provider = getEmbeddingProvider();
    expect(provider).toBeInstanceOf(BedrockEmbeddingProvider);
  });

  it('uses EMBEDDING_MODEL_ID override when provided', () => {
    process.env['EMBEDDING_PROVIDER'] = 'bedrock';
    process.env['EMBEDDING_MODEL_ID'] = 'cohere.embed-english-v3';
    const provider = getEmbeddingProvider()!;
    expect(provider.modelId).toBe('cohere.embed-english-v3');
  });

  it('uses default model ID when EMBEDDING_MODEL_ID is not set', () => {
    process.env['EMBEDDING_PROVIDER'] = 'bedrock';
    delete process.env['EMBEDDING_MODEL_ID'];
    const provider = getEmbeddingProvider()!;
    expect(provider.modelId).toBe('amazon.titan-embed-text-v2:0');
  });

  it('throws on an unrecognised EMBEDDING_PROVIDER value', () => {
    process.env['EMBEDDING_PROVIDER'] = 'ollama';
    expect(() => getEmbeddingProvider()).toThrow('Unknown EMBEDDING_PROVIDER');
  });
});

describe('BedrockEmbeddingProvider', () => {
  it('embed() returns the vector from the AI SDK', async () => {
    const provider = new BedrockEmbeddingProvider();
    const result = await provider.embed('test text');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('embedMany() returns one vector per input', async () => {
    const provider = new BedrockEmbeddingProvider();
    const result = await provider.embedMany(['a', 'b']);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('embedMany() returns empty array for empty input', async () => {
    const provider = new BedrockEmbeddingProvider();
    const result = await provider.embedMany([]);
    expect(result).toEqual([]);
  });

  it('exposes dimensions and modelId', () => {
    const provider = new BedrockEmbeddingProvider();
    expect(provider.dimensions).toBe(1024);
    expect(provider.modelId).toBe('amazon.titan-embed-text-v2:0');
  });
});
