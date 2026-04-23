import { describe, it, expect } from 'vitest';
import { createWikilinkTool, createKeywordSearchTool } from './tools.js';
import type { WikilinkToolResult, KeywordSearchToolResult } from './tools.js';
import type { VaultReader } from '../vault/vault-reader.js';
import type { VaultIndex, SearchResult } from '../vault/vault-index.js';
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
