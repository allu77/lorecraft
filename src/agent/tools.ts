import { tool } from 'ai';
import { z } from 'zod';
import type { VaultReader } from '../vault/vault-reader.js';
import type { VaultIndex, SearchResult } from '../vault/vault-index.js';
import type { VaultEmbeddings, EmbeddingSearchResult } from '../vault/vault-embeddings.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';
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
 * Returned when semantic search finds budget-fitting results.
 * `found: false` means either nothing matched or nothing fit in budget.
 */
export type SemanticSearchToolResult =
  | { found: true; results: Array<{ noteName: string; content: string }> }
  | { found: false; reason: 'no_results' };

/**
 * Creates the Vercel AI SDK `semantic_search` tool.
 * Embeds `query` and searches the vector index by cosine similarity, gating
 * each result through `budget`. Returns at most `limit` (default 3) results.
 *
 * @param embeddings - The loaded `VaultEmbeddings` to search.
 * @param provider   - Embedding provider used to embed the query string.
 * @param budget     - Shared `ContextBudget` instance for this generation request.
 * @returns A Vercel AI SDK Tool ready to pass to a `ToolLoopAgent`.
 */
export function createSemanticSearchTool(
  embeddings: VaultEmbeddings,
  provider: EmbeddingProvider,
  budget: ContextBudget,
) {
  return tool({
    description:
      'Searches vault notes by semantic similarity. ' +
      'Use this to find notes that are thematically related to the generation request ' +
      'even when they share no keywords.',
    inputSchema: z.object({
      query: z.string().describe('A natural-language description of what to find.'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of results to return. Default: 3.'),
    }),
    execute: async ({ query, limit = 3 }): Promise<SemanticSearchToolResult> => {
      const candidates = await embeddings.searchByText(query, provider);
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
 * Returned when hybrid search finds budget-fitting results.
 * `found: false` means either nothing matched or nothing fit in budget.
 */
export type HybridSearchToolResult =
  | { found: true; results: Array<{ noteName: string; content: string }> }
  | { found: false; reason: 'no_results' };

/**
 * Combines BM25 and cosine similarity results via Reciprocal Rank Fusion (k=60).
 * Notes appearing in both lists score higher than notes in only one.
 */
function reciprocalRankFusion(
  bm25Results: SearchResult[],
  semanticResults: EmbeddingSearchResult[],
  k = 60,
): Array<{ filePath: string; noteName: string; content: string }> {
  const scores = new Map<string, number>();
  const noteMap = new Map<string, { noteName: string; content: string }>();

  bm25Results.forEach((r, rank) => {
    scores.set(r.filePath, (scores.get(r.filePath) ?? 0) + 1 / (k + rank + 1));
    noteMap.set(r.filePath, { noteName: r.noteName, content: r.content });
  });

  semanticResults.forEach((r, rank) => {
    scores.set(r.filePath, (scores.get(r.filePath) ?? 0) + 1 / (k + rank + 1));
    // Semantic result gives the best-matching chunk; keep it if we don't have a BM25 entry
    if (!noteMap.has(r.filePath)) {
      noteMap.set(r.filePath, { noteName: r.noteName, content: r.content });
    }
  });

  return [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([filePath]) => ({ filePath, ...noteMap.get(filePath)! }));
}

/**
 * Creates the Vercel AI SDK `hybrid_search` tool.
 * Runs BM25 keyword search and semantic vector search in parallel, then merges
 * the results via Reciprocal Rank Fusion before budget-gating and returning.
 *
 * @param index      - The loaded `VaultIndex` for BM25 search.
 * @param embeddings - The loaded `VaultEmbeddings` for semantic search.
 * @param provider   - Embedding provider used to embed the query string.
 * @param budget     - Shared `ContextBudget` instance for this generation request.
 * @returns A Vercel AI SDK Tool ready to pass to a `ToolLoopAgent`.
 */
export function createHybridSearchTool(
  index: VaultIndex,
  embeddings: VaultEmbeddings,
  provider: EmbeddingProvider,
  budget: ContextBudget,
) {
  return tool({
    description:
      'Searches vault notes using both keyword matching (BM25) and semantic similarity, ' +
      'then merges the results. Use this as the primary search tool — it surfaces notes ' +
      'whether they share keywords or are only thematically related.',
    inputSchema: z.object({
      query: z.string().describe('Search query combining keywords and intent.'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of results to return. Default: 3.'),
    }),
    execute: async ({ query, limit = 3 }): Promise<HybridSearchToolResult> => {
      const [bm25Results, semanticResults] = await Promise.all([
        Promise.resolve(index.search(query)),
        embeddings.searchByText(query, provider),
      ]);

      const merged = reciprocalRankFusion(bm25Results, semanticResults);
      const included: Array<{ noteName: string; content: string }> = [];

      for (const result of merged) {
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
