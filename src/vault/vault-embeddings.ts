import fs from 'fs/promises';
import path from 'path';
import { VaultReader } from './vault-reader.js';
import { chunkNote } from './note-chunker.js';
import type { EmbeddingProvider } from './embedding-provider.js';
import { getLogger } from '../utils/logger.js';

/** A single chunk as stored in the embedding index (vectors excluded). */
export type StoredChunkInfo = {
  chunkIndex: number;
  chunkText: string;
};

/** A single search result returned by `VaultEmbeddings.search()`. */
export type EmbeddingSearchResult = {
  filePath: string;
  noteName: string;
  /** The best-matching chunk text for this note. */
  content: string;
  /** Cosine similarity score in [0, 1]. */
  score: number;
};

/** Metadata about the current state of the embedding index. */
export type EmbeddingIndexStats = {
  noteCount: number;
  indexedAt: Date;
  modelId: string;
  dimensions: number;
};

type StoredChunk = {
  relPath: string;
  noteName: string;
  filePath: string;
  chunkIndex: number;
  chunkText: string;
  vector: number[];
};

type EmbeddingsMeta = {
  noteCount: number;
  indexedAt: string;
  modelId: string;
  dimensions: number;
  /** Map of vault-relative path → mtime epoch ms at index time. */
  fileMtimes: Record<string, number>;
};

const LORECRAFT_DIR = '.lorecraft';
const EMBEDDINGS_FILE = 'embeddings.json';
const EMBEDDINGS_META_FILE = 'embeddings-meta.json';
const DEFAULT_BATCH_SIZE = 20;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic vector index over all vault notes. Persists to `{vaultRoot}/.lorecraft/`.
 *
 * Notes are split into chunks via `chunkNote()` before embedding; search returns
 * the best-matching chunk per note (deduplication by file path), budget-gated by
 * the caller.
 *
 * Use `VaultEmbeddings.build()` to create a fresh index, `VaultEmbeddings.load()`
 * to restore one from disk, and `update()` to incrementally re-embed changed files.
 */
export class VaultEmbeddings {
  private chunks: StoredChunk[];
  private readonly meta: EmbeddingsMeta;

  private constructor(chunks: StoredChunk[], meta: EmbeddingsMeta) {
    this.chunks = chunks;
    this.meta = meta;
  }

  /**
   * Chunks and embeds all `.md` files in `vaultRoot`, then writes the index to
   * `{vaultRoot}/.lorecraft/`. Replaces any existing embedding index.
   *
   * @param vaultRoot  - Absolute path to the vault root directory.
   * @param provider   - Embedding provider to use for vector generation.
   * @param batchSize  - Number of chunk texts sent to `provider.embedMany()` per call.
   * @returns A ready-to-use `VaultEmbeddings`.
   */
  static async build(
    vaultRoot: string,
    provider: EmbeddingProvider,
    batchSize = DEFAULT_BATCH_SIZE,
  ): Promise<VaultEmbeddings> {
    const log = getLogger('vault-embeddings');
    const reader = new VaultReader(vaultRoot);
    const notes = await reader.listNotes();

    const pendingChunks: Omit<StoredChunk, 'vector'>[] = [];
    const fileMtimes: Record<string, number> = {};

    for (const filePath of notes) {
      const relPath = path.relative(vaultRoot, filePath);
      const noteName = path.basename(filePath, '.md');
      const content = await reader.readNote(filePath);
      const stat = await fs.stat(filePath);
      fileMtimes[relPath] = stat.mtimeMs;

      const noteChunks = chunkNote(noteName, content);
      for (const chunk of noteChunks) {
        pendingChunks.push({
          relPath,
          noteName,
          filePath,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.chunkText,
        });
      }
    }

    // Batch embed all chunks
    const allVectors = await VaultEmbeddings._batchEmbed(
      pendingChunks.map((c) => c.chunkText),
      provider,
      batchSize,
    );

    const storedChunks: StoredChunk[] = pendingChunks.map((c, i) => ({
      ...c,
      vector: allVectors[i],
    }));

    const meta: EmbeddingsMeta = {
      noteCount: notes.length,
      indexedAt: new Date().toISOString(),
      modelId: provider.modelId,
      dimensions: provider.dimensions,
      fileMtimes,
    };

    await VaultEmbeddings._persist(vaultRoot, storedChunks, meta);
    log.info({ noteCount: notes.length, chunkCount: storedChunks.length }, 'embedding index built');
    return new VaultEmbeddings(storedChunks, meta);
  }

  /**
   * Restores an embedding index from `{vaultRoot}/.lorecraft/`. Returns `null` when
   * no persisted index exists.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @returns The loaded `VaultEmbeddings`, or `null` if no index exists.
   */
  static async load(vaultRoot: string): Promise<VaultEmbeddings | null> {
    const log = getLogger('vault-embeddings');
    const dir = path.join(vaultRoot, LORECRAFT_DIR);
    const embeddingsPath = path.join(dir, EMBEDDINGS_FILE);
    const metaPath = path.join(dir, EMBEDDINGS_META_FILE);

    try {
      const [chunksRaw, metaRaw] = await Promise.all([
        fs.readFile(embeddingsPath, 'utf-8'),
        fs.readFile(metaPath, 'utf-8'),
      ]);
      const chunks = JSON.parse(chunksRaw) as StoredChunk[];
      const meta = JSON.parse(metaRaw) as EmbeddingsMeta;
      log.info({ noteCount: meta.noteCount, modelId: meta.modelId }, 'embedding index loaded');
      return new VaultEmbeddings(chunks, meta);
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        log.debug({}, 'no persisted embedding index found');
        return null;
      }
      throw err;
    }
  }

  /**
   * Incrementally re-embeds changed files, adds new ones, and removes deleted ones,
   * then persists the result.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @param provider  - Embedding provider (must use same model as the loaded index).
   * @returns Counts of added, updated, and removed notes.
   */
  async update(
    vaultRoot: string,
    provider: EmbeddingProvider,
  ): Promise<{ added: number; updated: number; removed: number }> {
    const log = getLogger('vault-embeddings');
    const reader = new VaultReader(vaultRoot);
    const currentNotes = await reader.listNotes();
    const currentRelPaths = new Set<string>();

    let added = 0;
    let updated = 0;

    for (const filePath of currentNotes) {
      const relPath = path.relative(vaultRoot, filePath);
      currentRelPaths.add(relPath);
      const stat = await fs.stat(filePath);
      const storedMtime = this.meta.fileMtimes[relPath];

      if (storedMtime === undefined || storedMtime !== stat.mtimeMs) {
        const noteName = path.basename(filePath, '.md');
        const content = await reader.readNote(filePath);
        const noteChunks = chunkNote(noteName, content);

        // Remove old chunks for this note
        this.chunks = this.chunks.filter((c) => c.relPath !== relPath);

        if (noteChunks.length > 0) {
          const vectors = await VaultEmbeddings._batchEmbed(
            noteChunks.map((c) => c.chunkText),
            provider,
            DEFAULT_BATCH_SIZE,
          );
          for (const chunk of noteChunks) {
            this.chunks.push({
              relPath,
              noteName,
              filePath,
              chunkIndex: chunk.chunkIndex,
              chunkText: chunk.chunkText,
              vector: vectors[chunk.chunkIndex],
            });
          }
        }

        this.meta.fileMtimes[relPath] = stat.mtimeMs;
        if (storedMtime === undefined) {
          added++;
        } else {
          updated++;
        }
      }
    }

    let removed = 0;
    for (const relPath of Object.keys(this.meta.fileMtimes)) {
      if (!currentRelPaths.has(relPath)) {
        this.chunks = this.chunks.filter((c) => c.relPath !== relPath);
        delete this.meta.fileMtimes[relPath];
        removed++;
      }
    }

    this.meta.noteCount = currentNotes.length;
    this.meta.indexedAt = new Date().toISOString();

    await VaultEmbeddings._persist(vaultRoot, this.chunks, this.meta);
    log.info({ added, updated, removed }, 'embedding index updated');
    return { added, updated, removed };
  }

  /**
   * Returns `true` if the embedding index is out of date with the vault or if
   * the provider model has changed (requiring a full rebuild).
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @param provider  - Current embedding provider (model change forces staleness).
   */
  async isStale(vaultRoot: string, provider?: EmbeddingProvider): Promise<boolean> {
    if (provider && provider.modelId !== this.meta.modelId) return true;

    const reader = new VaultReader(vaultRoot);
    const currentNotes = await reader.listNotes();

    if (currentNotes.length !== Object.keys(this.meta.fileMtimes).length) return true;

    for (const filePath of currentNotes) {
      const relPath = path.relative(vaultRoot, filePath);
      const storedMtime = this.meta.fileMtimes[relPath];
      if (storedMtime === undefined) return true;
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs !== storedMtime) return true;
    }

    return false;
  }

  /**
   * Searches the index by cosine similarity and returns the best-matching chunk
   * per note, sorted by descending score.
   *
   * @param queryVector - Pre-computed query embedding.
   * @param limit       - Maximum number of notes to return. Default: 10.
   * @returns Results with the highest-scoring chunk per vault note.
   */
  search(queryVector: number[], limit = 10): EmbeddingSearchResult[] {
    // Score every chunk, then keep best chunk per note (dedup by relPath)
    const bestByNote = new Map<
      string,
      { chunk: StoredChunk; score: number }
    >();

    for (const chunk of this.chunks) {
      const score = cosineSimilarity(queryVector, chunk.vector);
      const existing = bestByNote.get(chunk.relPath);
      if (!existing || score > existing.score) {
        bestByNote.set(chunk.relPath, { chunk, score });
      }
    }

    return [...bestByNote.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk, score }) => ({
        filePath: chunk.filePath,
        noteName: chunk.noteName,
        content: chunk.chunkText,
        score,
      }));
  }

  /**
   * Embeds the query text, then searches by cosine similarity.
   *
   * @param query    - Plain-text query string.
   * @param provider - Provider used to embed the query.
   * @param limit    - Maximum number of notes to return. Default: 10.
   * @returns Results sorted by descending cosine similarity.
   */
  async searchByText(
    query: string,
    provider: EmbeddingProvider,
    limit = 10,
  ): Promise<EmbeddingSearchResult[]> {
    const queryVector = await provider.embed(query);
    return this.search(queryVector, limit);
  }

  /**
   * Returns all stored chunks for a note, ordered by chunk index.
   * Returns `null` if the note has no chunks in the index.
   *
   * @param noteName - The note's base filename without extension.
   */
  getChunks(noteName: string): StoredChunkInfo[] | null {
    const chunks = this.chunks
      .filter((c) => c.noteName === noteName)
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(({ chunkIndex, chunkText }) => ({ chunkIndex, chunkText }));
    return chunks.length === 0 ? null : chunks;
  }

  /** Total number of chunks stored across all notes. */
  get chunkCount(): number {
    return this.chunks.length;
  }

  /** Summary statistics for the current index state. */
  get stats(): EmbeddingIndexStats {
    return {
      noteCount: this.meta.noteCount,
      indexedAt: new Date(this.meta.indexedAt),
      modelId: this.meta.modelId,
      dimensions: this.meta.dimensions,
    };
  }

  private static async _batchEmbed(
    texts: string[],
    provider: EmbeddingProvider,
    batchSize: number,
  ): Promise<number[][]> {
    const result: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const vectors = await provider.embedMany(batch);
      result.push(...vectors);
    }
    return result;
  }

  private static async _persist(
    vaultRoot: string,
    chunks: StoredChunk[],
    meta: EmbeddingsMeta,
  ): Promise<void> {
    const dir = path.join(vaultRoot, LORECRAFT_DIR);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(dir, EMBEDDINGS_FILE),
        JSON.stringify(chunks),
        'utf-8',
      ),
      fs.writeFile(
        path.join(dir, EMBEDDINGS_META_FILE),
        JSON.stringify(meta),
        'utf-8',
      ),
    ]);
  }
}
