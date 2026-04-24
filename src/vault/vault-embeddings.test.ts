import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VaultEmbeddings } from './vault-embeddings.js';
import type { EmbeddingProvider } from './embedding-provider.js';

const FIXTURE_VAULT = path.resolve(
  import.meta.dirname,
  '../__tests__/fixtures/test-vault',
);

/** Deterministic mock: produces a 3-dim vector seeded by text length (mod primes). */
function makeMockProvider(modelId = 'mock-v1'): EmbeddingProvider {
  return {
    modelId,
    dimensions: 3,
    embed: vi.fn(async (text: string): Promise<number[]> => {
      const seed = text.length;
      return [seed % 7 / 7, seed % 11 / 11, seed % 13 / 13];
    }),
    embedMany: vi.fn(async (texts: string[]): Promise<number[][]> => {
      return texts.map((t) => {
        const seed = t.length;
        return [seed % 7 / 7, seed % 11 / 11, seed % 13 / 13];
      });
    }),
  };
}

async function copyMdFiles(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.lorecraft') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyMdFiles(srcPath, destPath);
    } else if (entry.name.endsWith('.md')) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function makeTempVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lorecraft-emb-test-'));
  await copyMdFiles(FIXTURE_VAULT, dir);
  return dir;
}

describe('VaultEmbeddings', () => {
  let vaultRoot: string;
  let provider: EmbeddingProvider;

  beforeEach(async () => {
    vaultRoot = await makeTempVault();
    provider = makeMockProvider();
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('build() produces an index with noteCount matching .md files', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const allMd = await fs
      .readdir(vaultRoot, { recursive: true })
      .then((entries) => (entries as string[]).filter((e) => e.endsWith('.md')));
    expect(index.stats.noteCount).toBe(allMd.length);
    expect(index.stats.indexedAt).toBeInstanceOf(Date);
    expect(index.stats.modelId).toBe('mock-v1');
  });

  it('build() calls embedMany in batches according to batchSize', async () => {
    await VaultEmbeddings.build(vaultRoot, provider, 2);
    // embedMany should have been called (possibly multiple times if many chunks)
    const spy = provider.embedMany as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalled();
    // Each call should have at most 2 texts
    for (const call of spy.mock.calls) {
      expect((call[0] as string[]).length).toBeLessThanOrEqual(2);
    }
  });

  it('load() returns null when no .lorecraft/ directory exists', async () => {
    await expect(VaultEmbeddings.load(vaultRoot)).resolves.toBeNull();
  });

  it('build → load round-trip: search results are reproducible', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const queryVector = await provider.embed('thieves guild');
    const before = index.search(queryVector, 5);

    const loaded = await VaultEmbeddings.load(vaultRoot);
    expect(loaded).not.toBeNull();
    const after = loaded!.search(queryVector, 5);

    expect(after.map((r) => r.noteName)).toEqual(before.map((r) => r.noteName));
    expect(after.map((r) => r.score)).toEqual(before.map((r) => r.score));
  });

  it('search() returns results sorted by descending cosine similarity', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const queryVector = await provider.embed('test query');
    const results = index.search(queryVector);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('search() returns at most one result per note (best chunk wins)', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const queryVector = await provider.embed('test query');
    const results = index.search(queryVector);

    const noteNames = results.map((r) => r.noteName);
    const uniqueNoteNames = new Set(noteNames);
    expect(noteNames.length).toBe(uniqueNoteNames.size);
  });

  it('isStale() returns false immediately after build', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    await expect(index.isStale(vaultRoot)).resolves.toBe(false);
  });

  it('isStale() returns true after an .md file is touched', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    await new Promise((r) => setTimeout(r, 10));
    const file = path.join(vaultRoot, 'Campaign Style.md');
    const content = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, content + '\n', 'utf-8');
    await expect(index.isStale(vaultRoot)).resolves.toBe(true);
  });

  it('isStale() returns true when provider modelId differs from stored modelId', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const differentProvider = makeMockProvider('different-model-v2');
    await expect(index.isStale(vaultRoot, differentProvider)).resolves.toBe(true);
  });

  it('isStale() returns false when provider modelId matches stored modelId', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const sameProvider = makeMockProvider('mock-v1');
    await expect(index.isStale(vaultRoot, sameProvider)).resolves.toBe(false);
  });

  it('update() detects added files and re-embeds them', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);

    await fs.mkdir(path.join(vaultRoot, 'Locations'), { recursive: true });
    await fs.writeFile(
      path.join(vaultRoot, 'Locations', 'New Place.md'),
      '# New Place\n\nA mysterious location with ancient ruins and hidden treasures waiting to be found.',
    );

    const counts = await index.update(vaultRoot, provider);
    expect(counts.added).toBe(1);
    expect(counts.updated).toBe(0);
    expect(counts.removed).toBe(0);
    expect(index.stats.noteCount).toBe(index.stats.noteCount);
  });

  it('update() detects removed files and drops their chunks', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const before = index.stats.noteCount;

    await fs.unlink(path.join(vaultRoot, 'Campaign Style.md'));

    const counts = await index.update(vaultRoot, provider);
    expect(counts.removed).toBe(1);
    expect(index.stats.noteCount).toBe(before - 1);
  });

  it('getChunks() returns chunks ordered by chunkIndex for a note with multiple chunks', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    // Find a note that has chunks in the index
    const allResults = index.search(await provider.embed('test'), 100);
    const noteName = allResults[0]?.noteName;
    expect(noteName).toBeDefined();

    const chunks = index.getChunks(noteName!);
    expect(chunks).not.toBeNull();
    if (chunks && chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBeGreaterThan(chunks[i - 1].chunkIndex);
      }
    }
  });

  it('getChunks() returns null for a note not in the index', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    expect(index.getChunks('NonExistentNote')).toBeNull();
  });

  it('getChunks() does not include vector field in returned objects', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const allResults = index.search(await provider.embed('test'), 100);
    const noteName = allResults[0]?.noteName;
    expect(noteName).toBeDefined();

    const chunks = index.getChunks(noteName!);
    expect(chunks).not.toBeNull();
    for (const chunk of chunks!) {
      expect(Object.keys(chunk)).toEqual(['chunkIndex', 'chunkText']);
    }
  });

  it('chunkCount returns total chunk count across all notes', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    expect(index.chunkCount).toBeGreaterThan(0);
    // chunkCount should be >= noteCount (each note has at least one chunk)
    expect(index.chunkCount).toBeGreaterThanOrEqual(index.stats.noteCount);
  });

  it('searchByText() embeds the query then returns ranked results', async () => {
    const index = await VaultEmbeddings.build(vaultRoot, provider);
    const results = await index.searchByText('thieves guild', provider, 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
    const spy = provider.embed as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledWith('thieves guild');
  });
});
