import { describe, it, expect, vi } from 'vitest';
import { cmdSearch, cmdNote, cmdChunks, cmdStats } from './inspect.js';
import type { VaultIndex } from '../vault/vault-index.js';
import type { VaultEmbeddings, StoredChunkInfo } from '../vault/vault-embeddings.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';

// --- Minimal stubs ---

function makeVaultIndex(results: Array<{ noteName: string; filePath: string; content: string; score: number }> = []): VaultIndex {
  return {
    search: vi.fn((_query: string, _limit?: number) => results),
    isStale: vi.fn(async () => false),
    get stats() {
      return { noteCount: results.length, indexedAt: new Date('2026-04-20T14:23:11Z') };
    },
  } as unknown as VaultIndex;
}

function makeEmbeddings(
  noteChunks: Record<string, StoredChunkInfo[]> = {},
  searchResults: Array<{ noteName: string; filePath: string; content: string; score: number }> = [],
  totalChunkCount?: number,
): VaultEmbeddings {
  const allNotes = Object.keys(noteChunks);
  return {
    getChunks: vi.fn((noteName: string) => noteChunks[noteName] ?? null),
    searchByText: vi.fn(async () => searchResults),
    isStale: vi.fn(async () => false),
    get chunkCount() {
      return totalChunkCount ?? Object.values(noteChunks).reduce((sum, c) => sum + c.length, 0);
    },
    get stats() {
      return {
        noteCount: allNotes.length,
        indexedAt: new Date('2026-04-20T14:23:45Z'),
        modelId: 'amazon.titan-embed-text-v2:0',
        dimensions: 1024,
      };
    },
  } as unknown as VaultEmbeddings;
}

function makeProvider(): EmbeddingProvider {
  return {
    modelId: 'mock-v1',
    dimensions: 3,
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    embedMany: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  };
}

// --- cmdSearch ---

describe('cmdSearch', () => {
  it('BM25-only (null embeddings) → semantic and hybrid omit notices present', async () => {
    const vaultIndex = makeVaultIndex([
      { noteName: 'Harbor District', filePath: '/vault/Harbor District.md', content: 'port', score: 12.3 },
    ]);
    const result = await cmdSearch('dockside', 10, vaultIndex, null, null);
    expect(result).toContain('Harbor District');
    expect(result).toContain('semantic: index not available');
    expect(result).toContain('hybrid: both BM25 and semantic indexes required');
  });

  it('all three indexes available → all three sections printed with correct note names', async () => {
    const bm25Results = [
      { noteName: 'Harbor District', filePath: '/v/Harbor District.md', content: 'port', score: 12.0 },
      { noteName: 'Thieves Guild', filePath: '/v/Thieves Guild.md', content: 'guild', score: 9.0 },
    ];
    const semResults = [
      { noteName: 'Sea Spirits', filePath: '/v/Sea Spirits.md', content: 'spirits', score: 0.92 },
      { noteName: 'Harbor District', filePath: '/v/Harbor District.md', content: 'port', score: 0.87 },
    ];
    const vaultIndex = makeVaultIndex(bm25Results);
    const embeddings = makeEmbeddings({}, semResults);
    const provider = makeProvider();

    const result = await cmdSearch('dockside ambush', 10, vaultIndex, embeddings, provider);
    expect(result).toContain('=== BM25 results');
    expect(result).toContain('Harbor District');
    expect(result).toContain('=== Semantic results');
    expect(result).toContain('Sea Spirits');
    expect(result).toContain('=== Hybrid results (RRF, k=60)');
  });

  it('hybrid RRF ranks note appearing in both lists above note in one list only', async () => {
    const bm25Results = [
      { noteName: 'Harbor District', filePath: '/v/HD.md', content: 'x', score: 12.0 },
      { noteName: 'Thieves Guild', filePath: '/v/TG.md', content: 'x', score: 5.0 },
    ];
    const semResults = [
      { noteName: 'Harbor District', filePath: '/v/HD.md', content: 'x', score: 0.9 },
      { noteName: 'Sea Spirits', filePath: '/v/SS.md', content: 'x', score: 0.8 },
    ];
    const vaultIndex = makeVaultIndex(bm25Results);
    const embeddings = makeEmbeddings({}, semResults);
    const provider = makeProvider();

    const result = await cmdSearch('query', 10, vaultIndex, embeddings, provider);
    // Harbor District appears in both lists → should rank first in hybrid
    const hybridSection = result.split('=== Hybrid')[1];
    const firstEntry = hybridSection.match(/1\.\s+(\S+)/)?.[1];
    expect(firstEntry).toBe('Harbor');
  });
});

// --- cmdNote ---

describe('cmdNote', () => {
  it('note found in BM25 → filePath and content excerpt in output', () => {
    const vaultIndex = makeVaultIndex([
      {
        noteName: 'Sea Spirits',
        filePath: 'Locations/Sea Spirits.md',
        content: 'Spectral sailors are said to haunt the waters.',
        score: 10,
      },
    ]);
    const result = cmdNote('Sea Spirits', vaultIndex, null);
    expect(result).toContain('Locations/Sea Spirits.md');
    expect(result).toContain('Spectral sailors');
  });

  it('note not in BM25 → "not found" message in BM25 section', () => {
    const vaultIndex = makeVaultIndex([]);
    const result = cmdNote('Missing Note', vaultIndex, null);
    expect(result).toContain('not found in BM25 index');
  });

  it('note found in embeddings → chunk count and truncated texts in output', () => {
    const chunks: StoredChunkInfo[] = [
      { chunkIndex: 0, chunkText: 'First chunk of text that is longer than a hundred and twenty characters total so it must be truncated in the note view.' },
      { chunkIndex: 1, chunkText: 'Second chunk.' },
    ];
    const embeddings = makeEmbeddings({ 'Sea Spirits': chunks });
    const result = cmdNote('Sea Spirits', null, embeddings);
    expect(result).toContain('Chunks: 2');
    expect(result).toContain('[0]');
    expect(result).toContain('[1]');
  });

  it('null indexes → both sections show "index not available"', () => {
    const result = cmdNote('Any Note', null, null);
    const occurrences = (result.match(/index not available/g) ?? []).length;
    expect(occurrences).toBe(2);
  });
});

// --- cmdChunks ---

describe('cmdChunks', () => {
  it('note with chunks → all chunks printed with full text', () => {
    const chunks: StoredChunkInfo[] = [
      { chunkIndex: 0, chunkText: 'Full text of chunk zero.' },
      { chunkIndex: 1, chunkText: 'Full text of chunk one.' },
    ];
    const embeddings = makeEmbeddings({ 'Sea Spirits': chunks });
    const result = cmdChunks('Sea Spirits', embeddings);
    expect(result).toContain('[chunk 0]');
    expect(result).toContain('Full text of chunk zero.');
    expect(result).toContain('[chunk 1]');
    expect(result).toContain('Full text of chunk one.');
  });

  it('note not in index → appropriate message', () => {
    const embeddings = makeEmbeddings({});
    const result = cmdChunks('Missing Note', embeddings);
    expect(result).toContain('not found in embedding index');
  });

  it('null embeddings → "index not available" message', () => {
    const result = cmdChunks('Any Note', null);
    expect(result).toContain('index not available');
  });
});

// --- cmdStats ---

describe('cmdStats', () => {
  it('null indexes → "not found" for both sections', async () => {
    const result = await cmdStats('/fake/vault', null, null);
    expect(result).toContain('=== BM25 index ===');
    expect(result).toContain('not found');
    expect(result).toContain('=== Embedding index ===');
    // Both sections should mention not found
    const notFoundCount = (result.match(/not found/g) ?? []).length;
    expect(notFoundCount).toBeGreaterThanOrEqual(2);
  });

  it('loaded indexes → noteCount, chunkCount, modelId present in output', async () => {
    const vaultIndex = makeVaultIndex([
      { noteName: 'A', filePath: '/v/A.md', content: 'a', score: 1 },
      { noteName: 'B', filePath: '/v/B.md', content: 'b', score: 1 },
    ]);
    const chunks: StoredChunkInfo[] = [
      { chunkIndex: 0, chunkText: 'chunk' },
      { chunkIndex: 1, chunkText: 'chunk2' },
      { chunkIndex: 2, chunkText: 'chunk3' },
    ];
    const embeddings = makeEmbeddings({ 'Note': chunks }, [], 3);
    const result = await cmdStats('/fake/vault', vaultIndex, embeddings);
    expect(result).toContain('Notes:');
    expect(result).toContain('Chunks:    3');
    expect(result).toContain('amazon.titan-embed-text-v2:0');
  });
});
