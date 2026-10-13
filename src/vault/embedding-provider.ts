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
