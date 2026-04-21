import { tool } from 'ai';
import { z } from 'zod';
import type { VaultReader } from '../vault/vault-reader.js';
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
    description: 'Resolves a wikilink and returns the matching vault note content.',
    inputSchema: z.object({
      wikilink: z.string().describe('Wikilink to resolve, e.g. [[Note Name]] or [[Note Name#Section]].'),
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
