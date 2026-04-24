import { describe, it, expect, vi } from 'vitest';
import {
  createWikilinkTool,
  createKeywordSearchTool,
  createSemanticSearchTool,
  createHybridSearchTool,
} from './tools.js';
import type { WikilinkToolResult, KeywordSearchToolResult, SemanticSearchToolResult, HybridSearchToolResult } from './tools.js';
import type { VaultReader } from '../vault/vault-reader.js';
import type { VaultIndex, SearchResult } from '../vault/vault-index.js';
import type { VaultEmbeddings, EmbeddingSearchResult } from '../vault/vault-embeddings.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';
import type { ContextBudget } from './context-budget.js';

const NOTE_CONTENT = '# Thieves Guild\n\nA criminal faction.';
const SECTION_CONTENT = '## Goals\n\nControl trade routes.';

function makeReader(
  overrides: Partial<{
    parseWikilink: VaultReader['parseWikilink'];
    resolveWikilink: VaultReader['resolveWikilink'];
    readNote: VaultReader['readNote'];
  }>,
): VaultReader {
  return {
    parseWikilink:
      overrides.parseWikilink ??
      (() => ({ noteName: 'Thieves Guild', section: null, altText: null })),
    resolveWikilink:
      overrides.resolveWikilink ?? (async () => '/vault/Thieves Guild.md'),
    readNote: overrides.readNote ?? (async () => NOTE_CONTENT),
  } as unknown as VaultReader;
}

function makeBudget(fits = true): ContextBudget {
  return {
    fits: () => fits,
    add: () => {
      /* no-op */
    },
  } as unknown as ContextBudget;
}

async function callExecute(
  tool: ReturnType<typeof createWikilinkTool>,
  wikilink: string,
): Promise<WikilinkToolResult> {
  // execute is typed as optional but always present when tool() is called with execute.
  const exec = tool.execute!;
  return exec(
    { wikilink },
    { messages: [], toolCallId: 'test' },
  ) as Promise<WikilinkToolResult>;
}

function makeIndex(results: SearchResult[]): VaultIndex {
  return {
    search: () => results,
  } as unknown as VaultIndex;
}

function makeBudgetSequence(fitsSeq: boolean[]): ContextBudget {
  let i = 0;
  return {
    fits: () => fitsSeq[i] ?? false,
    add: () => {
      i++;
    },
  } as unknown as ContextBudget;
}

async function callKeywordExecute(
  tool: ReturnType<typeof createKeywordSearchTool>,
  args: { query: string; limit?: number },
): Promise<KeywordSearchToolResult> {
  const exec = tool.execute!;
  return exec(args, {
    messages: [],
    toolCallId: 'test',
  }) as Promise<KeywordSearchToolResult>;
}

describe('createKeywordSearchTool', () => {
  const note1: SearchResult = {
    filePath: '/vault/Note One.md',
    noteName: 'Note One',
    content: 'Content of note one.',
    score: 5,
  };
  const note2: SearchResult = {
    filePath: '/vault/Note Two.md',
    noteName: 'Note Two',
    content: 'Content of note two.',
    score: 3,
  };

  it('results returned and budget consumed for each included note', async () => {
    const tool = createKeywordSearchTool(
      makeIndex([note1, note2]),
      makeBudget(true),
    );

    const result = await callKeywordExecute(tool, { query: 'test', limit: 3 });

    expect(result).toEqual({
      found: true,
      results: [
        { noteName: 'Note One', content: note1.content },
        { noteName: 'Note Two', content: note2.content },
      ],
    });
  });

  it('all results skipped by budget → { found: false, reason: "no_results" }', async () => {
    const tool = createKeywordSearchTool(
      makeIndex([note1, note2]),
      makeBudgetSequence([false, false]),
    );

    const result = await callKeywordExecute(tool, { query: 'test' });

    expect(result).toEqual({ found: false, reason: 'no_results' });
  });

  it('first result fits, second does not → only first returned', async () => {
    const tool = createKeywordSearchTool(
      makeIndex([note1, note2]),
      makeBudgetSequence([true, false]),
    );

    const result = await callKeywordExecute(tool, { query: 'test', limit: 3 });

    expect(result).toEqual({
      found: true,
      results: [{ noteName: 'Note One', content: note1.content }],
    });
  });

  it('empty search results → { found: false, reason: "no_results" }', async () => {
    const tool = createKeywordSearchTool(makeIndex([]), makeBudget(true));

    const result = await callKeywordExecute(tool, { query: 'nothing' });

    expect(result).toEqual({ found: false, reason: 'no_results' });
  });
});

describe('createWikilinkTool', () => {
  it('note found, no section: returns content', async () => {
    const reader = makeReader({});
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild]]');

    expect(result).toEqual({
      found: true,
      noteName: 'Thieves Guild',
      content: NOTE_CONTENT,
    });
  });

  it('note found, section found: returns section content', async () => {
    const reader = makeReader({
      parseWikilink: () => ({
        noteName: 'Thieves Guild',
        section: 'Goals',
        altText: null,
      }),
      readNote: async (_path, section) => {
        if (section === 'Goals') return SECTION_CONTENT;
        return NOTE_CONTENT;
      },
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild#Goals]]');

    expect(result).toEqual({
      found: true,
      noteName: 'Thieves Guild',
      content: SECTION_CONTENT,
    });
  });

  it('note found, section missing: falls back to full note', async () => {
    const reader = makeReader({
      parseWikilink: () => ({
        noteName: 'Thieves Guild',
        section: 'Missing',
        altText: null,
      }),
      readNote: async (_path, section) => {
        if (section === 'Missing')
          throw new Error('Section "Missing" not found');
        return NOTE_CONTENT;
      },
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild#Missing]]');

    expect(result).toEqual({
      found: true,
      noteName: 'Thieves Guild',
      content: NOTE_CONTENT,
    });
  });

  it('note not found: returns not_found', async () => {
    const reader = makeReader({
      resolveWikilink: async () => null,
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Unknown Note]]');

    expect(result).toEqual({
      found: false,
      noteName: 'Thieves Guild',
      reason: 'not_found',
    });
  });

  it('note found, budget exhausted: returns budget_exceeded', async () => {
    const reader = makeReader({});
    const tool = createWikilinkTool(reader, makeBudget(false));

    const result = await callExecute(tool, '[[Thieves Guild]]');

    expect(result).toEqual({
      found: false,
      noteName: 'Thieves Guild',
      reason: 'budget_exceeded',
    });
  });
});

// ── Helpers for semantic / hybrid tools ──────────────────────────────────────

function makeEmbeddings(
  results: EmbeddingSearchResult[],
): VaultEmbeddings {
  return {
    searchByText: vi.fn(async () => results),
    search: vi.fn(() => results),
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

async function callSemanticExecute(
  tool: ReturnType<typeof createSemanticSearchTool>,
  args: { query: string; limit?: number },
): Promise<SemanticSearchToolResult> {
  const exec = tool.execute!;
  return exec(args, { messages: [], toolCallId: 'test' }) as Promise<SemanticSearchToolResult>;
}

async function callHybridExecute(
  tool: ReturnType<typeof createHybridSearchTool>,
  args: { query: string; limit?: number },
): Promise<HybridSearchToolResult> {
  const exec = tool.execute!;
  return exec(args, { messages: [], toolCallId: 'test' }) as Promise<HybridSearchToolResult>;
}

const embResult1: EmbeddingSearchResult = {
  filePath: '/vault/Note One.md',
  noteName: 'Note One',
  chunkIndex: 0,
  content: 'Semantic content of note one.',
  score: 0.9,
};
const embResult2: EmbeddingSearchResult = {
  filePath: '/vault/Note Two.md',
  noteName: 'Note Two',
  chunkIndex: 0,
  content: 'Semantic content of note two.',
  score: 0.7,
};

describe('createSemanticSearchTool', () => {
  it('returns results that fit the budget', async () => {
    const tool = createSemanticSearchTool(
      makeEmbeddings([embResult1, embResult2]),
      makeProvider(),
      makeBudget(true),
    );

    const result = await callSemanticExecute(tool, { query: 'harbor spirits' });

    expect(result).toEqual({
      found: true,
      results: [
        { noteName: 'Note One', content: embResult1.content },
        { noteName: 'Note Two', content: embResult2.content },
      ],
    });
  });

  it('returns { found: false } when all results are blocked by budget', async () => {
    const tool = createSemanticSearchTool(
      makeEmbeddings([embResult1, embResult2]),
      makeProvider(),
      makeBudgetSequence([false, false]),
    );

    const result = await callSemanticExecute(tool, { query: 'query' });
    expect(result).toEqual({ found: false, reason: 'no_results' });
  });

  it('respects the limit parameter', async () => {
    const tool = createSemanticSearchTool(
      makeEmbeddings([embResult1, embResult2]),
      makeProvider(),
      makeBudget(true),
    );

    const result = await callSemanticExecute(tool, { query: 'query', limit: 1 });
    expect(result).toEqual({
      found: true,
      results: [{ noteName: 'Note One', content: embResult1.content }],
    });
  });

  it('returns { found: false } when there are no search results', async () => {
    const tool = createSemanticSearchTool(
      makeEmbeddings([]),
      makeProvider(),
      makeBudget(true),
    );

    const result = await callSemanticExecute(tool, { query: 'nothing' });
    expect(result).toEqual({ found: false, reason: 'no_results' });
  });
});

describe('createHybridSearchTool', () => {
  const bm25Note1: SearchResult = {
    filePath: '/vault/BM25 Note.md',
    noteName: 'BM25 Note',
    content: 'BM25-only content.',
    score: 5,
  };

  it('returns merged results from BM25 and semantic lists', async () => {
    const tool = createHybridSearchTool(
      makeIndex([bm25Note1]),
      makeEmbeddings([embResult1]),
      makeProvider(),
      makeBudget(true),
    );

    const result = await callHybridExecute(tool, { query: 'harbor' });
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.results.length).toBeGreaterThan(0);
    }
  });

  it('a note appearing in both lists ranks above notes in only one list (RRF)', async () => {
    // embResult1 appears in semantic list; bm25Note1 appears in BM25 list only.
    // Create a note that appears in BOTH lists — it should rank first.
    const sharedFilePath = '/vault/Shared.md';
    const bm25Shared: SearchResult = {
      filePath: sharedFilePath,
      noteName: 'Shared',
      content: 'Content of the shared note.',
      score: 3,
    };
    const semShared: EmbeddingSearchResult = {
      filePath: sharedFilePath,
      noteName: 'Shared',
      chunkIndex: 0,
      content: 'Content of the shared note.',
      score: 0.8,
    };

    const tool = createHybridSearchTool(
      makeIndex([bm25Shared, bm25Note1]),
      makeEmbeddings([semShared, embResult1]),
      makeProvider(),
      makeBudget(true),
    );

    const result = await callHybridExecute(tool, { query: 'query', limit: 3 });
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.results[0].noteName).toBe('Shared');
    }
  });

  it('returns { found: false } when budget blocks all merged results', async () => {
    const tool = createHybridSearchTool(
      makeIndex([bm25Note1]),
      makeEmbeddings([embResult1]),
      makeProvider(),
      makeBudgetSequence([false, false]),
    );

    const result = await callHybridExecute(tool, { query: 'query' });
    expect(result).toEqual({ found: false, reason: 'no_results' });
  });
});
