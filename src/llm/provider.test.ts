import { describe, it, expect } from 'vitest';
import { getEmbeddingModel } from './provider.js';

describe('getEmbeddingModel', () => {
  it('returns an embedding model for the given model ID without network access', () => {
    const model = getEmbeddingModel('amazon.titan-embed-text-v2:0');
    expect(model).toMatchObject({ modelId: 'amazon.titan-embed-text-v2:0' });
  });
});
