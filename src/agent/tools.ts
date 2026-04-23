import { tool } from 'ai';
import { z } from 'zod';
import type { VaultReader } from '../vault/vault-reader.js';
import type { VaultIndex } from '../vault/vault-index.js';
import type { ContextBudget } from './context-budget.js';

/** Returned when the wikilink resolves and the note fits in budget. */
export type WikilinkToolFound = {
  found: true;
  noteName: string;
  /** Full note content, or section subtree if [[Note#Section]] syntax was used. */
  content: string;
};

/**
 * Returned when the note cannot be served.
 * `not_found` — no matching file in the vault.
 * `budget_exceeded` — file found but context budget is exhausted.
 */
export type WikilinkToolNotFound = {
  found: false;
  noteName: string;
  reason: 'not_found' | 'budget_exceeded';
};

export type WikilinkToolResult = WikilinkToolFound | WikilinkToolNotFound;

/**
 * Returned when keyword search finds budget-fitting results.
 * `found: false` means either the index returned nothing or nothing fit in budget.
 */
export type KeywordSearchToolResult =
  | { found: true; results: Array<{ noteName: string; content: string }> }
  | { found: false; reason: 'no_results' };

/**
 * Creates the Vercel AI SDK `keyword_search` tool.
 * Searches the BM25 index for notes relevant to `query`, then gates each result
 * through `budget`. Returns at most `limit` (default 3) results that fit.
 *
 * @param index  - The loaded `VaultIndex` to query.
 * @param budget - Shared `ContextBudget` instance for this generation request.
 * @returns A Vercel AI SDK Tool ready to pass to a `ToolLoopAgent`.
 */
export function createKeywordSearchTool(
  index: VaultIndex,
  budget: ContextBudget,
) {
  return tool({
    description:
      'Searches vault notes by keyword using BM25 ranking. ' +
      'Use this to find notes that are relevant to the generation request ' +
      'but not directly linked via wikilinks.',
    inputSchema: z.object({
      query: z.string().describe('Keywords to search for in the vault.'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of results to return. Default: 3.'),
    }),
    execute: async ({ query, limit = 3 }): Promise<KeywordSearchToolResult> => {
      const candidates = index.search(query);
      const included: Array<{ noteName: string; content: string }> = [];

      for (const result of candidates) {
        if (included.length >= limit) break;
        if (budget.fits(result.content)) {
          budget.add(result.content);
          included.push({ noteName: result.noteName, content: result.content });
        }
      }

      if (included.length === 0) {
        return { found: false, reason: 'no_results' };
      }
      return { found: true, results: included };
    },
  });
}

/**
 * Creates the Vercel AI SDK `wikilink_resolve` tool.
 * Closes over `reader` (for vault I/O) and `budget` (for token gating).
 * Inject mocks for both in tests.
 *
 * @param reader - VaultReader scoped to the active vault.
 * @param budget - Shared ContextBudget instance for this generation request.
 * @returns A Vercel AI SDK Tool ready to pass to a ToolLoopAgent.
 */
export function createWikilinkTool(reader: VaultReader, budget: ContextBudget) {
  return tool({
    description:
      'Resolves a wikilink and returns the matching vault note content.',
    inputSchema: z.object({
      wikilink: z
        .string()
        .describe(
          'Wikilink to resolve, e.g. [[Note Name]] or [[Note Name#Section]].',
        ),
    }),
    execute: async ({ wikilink }): Promise<WikilinkToolResult> => {
      const { noteName, section } = reader.parseWikilink(wikilink);
      const notePath = await reader.resolveWikilink(wikilink);

      if (!notePath) {
        return { found: false, noteName, reason: 'not_found' };
      }

      let content: string;
      if (section) {
        try {
          content = await reader.readNote(notePath, section);
        } catch {
          content = await reader.readNote(notePath);
        }
      } else {
        content = await reader.readNote(notePath);
      }

      if (!budget.fits(content)) {
        return { found: false, noteName, reason: 'budget_exceeded' };
      }

      budget.add(content);
      return { found: true, noteName, content };
    },
  });
}
