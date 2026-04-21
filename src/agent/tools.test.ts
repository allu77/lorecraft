import { describe, it, expect } from 'vitest';
import { createWikilinkTool } from './tools.js';
import type { WikilinkToolResult } from './tools.js';
import type { VaultReader } from '../vault/vault-reader.js';
import type { ContextBudget } from './context-budget.js';

const NOTE_CONTENT = '# Thieves Guild\n\nA criminal faction.';
const SECTION_CONTENT = '## Goals\n\nControl trade routes.';

function makeReader(overrides: Partial<{
  parseWikilink: VaultReader['parseWikilink'];
  resolveWikilink: VaultReader['resolveWikilink'];
  readNote: VaultReader['readNote'];
}>): VaultReader {
  return {
    parseWikilink: overrides.parseWikilink ?? (() => ({ noteName: 'Thieves Guild', section: null, altText: null })),
    resolveWikilink: overrides.resolveWikilink ?? (async () => '/vault/Thieves Guild.md'),
    readNote: overrides.readNote ?? (async () => NOTE_CONTENT),
  } as unknown as VaultReader;
}

function makeBudget(fits = true): ContextBudget {
  return {
    fits: () => fits,
    add: () => { /* no-op */ },
  } as unknown as ContextBudget;
}

async function callExecute(
  tool: ReturnType<typeof createWikilinkTool>,
  wikilink: string,
): Promise<WikilinkToolResult> {
  // execute is typed as optional but always present when tool() is called with execute.
  const exec = tool.execute!;
  return exec({ wikilink }, { messages: [], toolCallId: 'test' }) as Promise<WikilinkToolResult>;
}

describe('createWikilinkTool', () => {
  it('note found, no section: returns content', async () => {
    const reader = makeReader({});
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild]]');

    expect(result).toEqual({ found: true, noteName: 'Thieves Guild', content: NOTE_CONTENT });
  });

  it('note found, section found: returns section content', async () => {
    const reader = makeReader({
      parseWikilink: () => ({ noteName: 'Thieves Guild', section: 'Goals', altText: null }),
      readNote: async (_path, section) => {
        if (section === 'Goals') return SECTION_CONTENT;
        return NOTE_CONTENT;
      },
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild#Goals]]');

    expect(result).toEqual({ found: true, noteName: 'Thieves Guild', content: SECTION_CONTENT });
  });

  it('note found, section missing: falls back to full note', async () => {
    const reader = makeReader({
      parseWikilink: () => ({ noteName: 'Thieves Guild', section: 'Missing', altText: null }),
      readNote: async (_path, section) => {
        if (section === 'Missing') throw new Error('Section "Missing" not found');
        return NOTE_CONTENT;
      },
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Thieves Guild#Missing]]');

    expect(result).toEqual({ found: true, noteName: 'Thieves Guild', content: NOTE_CONTENT });
  });

  it('note not found: returns not_found', async () => {
    const reader = makeReader({
      resolveWikilink: async () => null,
    });
    const tool = createWikilinkTool(reader, makeBudget(true));

    const result = await callExecute(tool, '[[Unknown Note]]');

    expect(result).toEqual({ found: false, noteName: 'Thieves Guild', reason: 'not_found' });
  });

  it('note found, budget exhausted: returns budget_exceeded', async () => {
    const reader = makeReader({});
    const tool = createWikilinkTool(reader, makeBudget(false));

    const result = await callExecute(tool, '[[Thieves Guild]]');

    expect(result).toEqual({ found: false, noteName: 'Thieves Guild', reason: 'budget_exceeded' });
  });
});
