import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEmbeddingProvider,
  BedrockEmbeddingProvider,
  OllamaEmbeddingProvider,
  OLLAMA_EMBEDDING_DIMENSIONS,
} from './embedding-provider.js';
import { getEmbeddingModel } from './provider.js';

// Mock the Vercel AI SDK embed functions to avoid real Bedrock calls
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>();
  return {
    ...original,
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    embedMany: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
  };
});

vi.mock('./provider.js', () => ({
  getEmbeddingModel: vi.fn().mockReturnValue({ modelId: 'mock-embedding-model' }),
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

  it('throws on an unrecognised EMBEDDING_PROVIDER value and lists the supported ones', () => {
    process.env['EMBEDDING_PROVIDER'] = 'nope';
    expect(() => getEmbeddingProvider()).toThrow(/Unknown EMBEDDING_PROVIDER[\s\S]*bedrock[\s\S]*ollama/);
  });

  describe('ollama', () => {
    beforeEach(() => {
      process.env['EMBEDDING_PROVIDER'] = 'ollama';
      delete process.env['EMBEDDING_MODEL_ID'];
      delete process.env['EMBEDDING_DIMENSIONS'];
    });

    it('returns OllamaEmbeddingProvider with nomic-embed-text / 768 by default', () => {
      const provider = getEmbeddingProvider();
      expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
      expect(provider!.modelId).toBe('nomic-embed-text');
      expect(provider!.dimensions).toBe(768);
    });

    it.each(Object.entries(OLLAMA_EMBEDDING_DIMENSIONS))(
      'looks up the dimension of %s in the known-model table',
      (modelId, dimensions) => {
        process.env['EMBEDDING_MODEL_ID'] = modelId;
        expect(getEmbeddingProvider()!.dimensions).toBe(dimensions);
      },
    );

    it('table covers the documented models', () => {
      expect(OLLAMA_EMBEDDING_DIMENSIONS).toMatchObject({
        'nomic-embed-text': 768,
        'mxbai-embed-large': 1024,
        'all-minilm': 384,
      });
    });

    it('accepts a tagged model name by ignoring the tag for the table lookup', () => {
      process.env['EMBEDDING_MODEL_ID'] = 'nomic-embed-text:latest';
      const provider = getEmbeddingProvider()!;
      expect(provider.modelId).toBe('nomic-embed-text:latest');
      expect(provider.dimensions).toBe(768);
    });

    it('uses EMBEDDING_DIMENSIONS for models outside the table', () => {
      process.env['EMBEDDING_MODEL_ID'] = 'my-custom-embedder';
      process.env['EMBEDDING_DIMENSIONS'] = '512';
      expect(getEmbeddingProvider()!.dimensions).toBe(512);
    });

    it('lets EMBEDDING_DIMENSIONS override the table', () => {
      process.env['EMBEDDING_DIMENSIONS'] = '256';
      expect(getEmbeddingProvider()!.dimensions).toBe(256);
    });

    it('fails with the fix when the model is unknown and no override is set', () => {
      process.env['EMBEDDING_MODEL_ID'] = 'my-custom-embedder';
      expect(() => getEmbeddingProvider()).toThrow(/my-custom-embedder[\s\S]*EMBEDDING_DIMENSIONS/);
    });

    it.each(['abc', '0', '-3', '2.5'])('rejects EMBEDDING_DIMENSIONS=%s', (value) => {
      process.env['EMBEDDING_DIMENSIONS'] = value;
      expect(() => getEmbeddingProvider()).toThrow(/EMBEDDING_DIMENSIONS/);
    });
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

  it('requests the embedding model for its own modelId', async () => {
    const provider = new BedrockEmbeddingProvider('cohere.embed-english-v3');
    await provider.embed('test text');
    expect(getEmbeddingModel).toHaveBeenCalledWith('bedrock', 'cohere.embed-english-v3');
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

describe('OllamaEmbeddingProvider', () => {
  it('embed() returns the vector from the AI SDK', async () => {
    const provider = new OllamaEmbeddingProvider();
    expect(await provider.embed('test text')).toEqual([0.1, 0.2, 0.3]);
  });

  it('embedMany() returns one vector per input', async () => {
    const provider = new OllamaEmbeddingProvider();
    expect(await provider.embedMany(['a', 'b'])).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('requests the ollama embedding model for its own modelId', async () => {
    const provider = new OllamaEmbeddingProvider('mxbai-embed-large', 1024);
    await provider.embed('test text');
    await provider.embedMany(['a']);
    expect(getEmbeddingModel).toHaveBeenCalledWith('ollama', 'mxbai-embed-large');
  });

  it('embedMany() returns empty array for empty input', async () => {
    expect(await new OllamaEmbeddingProvider().embedMany([])).toEqual([]);
  });

  it('exposes dimensions and modelId', () => {
    const provider = new OllamaEmbeddingProvider('all-minilm', 384);
    expect(provider.dimensions).toBe(384);
    expect(provider.modelId).toBe('all-minilm');
  });
});
