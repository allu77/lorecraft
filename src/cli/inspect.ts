import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { VaultIndex } from '../vault/vault-index.js';
import { VaultEmbeddings } from '../vault/vault-embeddings.js';
import { getEmbeddingProvider } from '../vault/embedding-provider.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';
import { initLogger } from '../utils/logger.js';

const LORECRAFT_DIR = '.lorecraft';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function statSize(filePath: string): Promise<string> {
  try {
    const s = await fs.stat(filePath);
    return formatBytes(s.size);
  } catch {
    return '—';
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/**
 * Runs BM25, semantic, and hybrid searches and formats results as plain text.
 * Semantic and hybrid are omitted (with a notice) if indexes or provider are absent.
 *
 * @param query      - Raw query string.
 * @param limit      - Maximum results per list.
 * @param vaultIndex - Loaded BM25 index, or null if unavailable.
 * @param embeddings - Loaded embedding index, or null if unavailable.
 * @param provider   - Embedding provider for query embedding, or null.
 */
export async function cmdSearch(
  query: string,
  limit: number,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
  provider: EmbeddingProvider | null,
): Promise<string> {
  const sections: string[] = [];

  // BM25
  const bm25Lines: string[] = [`=== BM25 results for "${query}" ===`];
  let bm25Results: Array<{ noteName: string; score: number }> | null = null;
  if (vaultIndex) {
    const results = vaultIndex.search(query, limit);
    bm25Results = results;
    if (results.length === 0) {
      bm25Lines.push('  (no results)');
    } else {
      for (let i = 0; i < results.length; i++) {
        bm25Lines.push(
          ` ${String(i + 1).padStart(2)}. ${results[i].noteName.padEnd(30)} ${results[i].score.toFixed(3)}`,
        );
      }
    }
  } else {
    bm25Lines.push('  index not available — run /index build to enable');
  }
  sections.push(bm25Lines.join('\n'));

  // Semantic
  const semLines: string[] = [`=== Semantic results for "${query}" ===`];
  let semResults: Array<{ noteName: string; score: number }> | null = null;
  if (embeddings && provider) {
    const results = await embeddings.searchByText(query, provider, limit);
    semResults = results;
    if (results.length === 0) {
      semLines.push('  (no results)');
    } else {
      for (let i = 0; i < results.length; i++) {
        semLines.push(
          ` ${String(i + 1).padStart(2)}. ${results[i].noteName.padEnd(30)} ${results[i].score.toFixed(3)}`,
        );
      }
    }
  } else {
    semLines.push('  semantic: index not available — run /index rebuild to enable');
  }
  sections.push(semLines.join('\n'));

  // Hybrid RRF (k=60)
  const hybridLines: string[] = [`=== Hybrid results (RRF, k=60) for "${query}" ===`];
  if (bm25Results && semResults) {
    const k = 60;
    const scores = new Map<string, number>();
    for (let i = 0; i < bm25Results.length; i++) {
      const n = bm25Results[i].noteName;
      scores.set(n, (scores.get(n) ?? 0) + 1 / (k + i + 1));
    }
    for (let i = 0; i < semResults.length; i++) {
      const n = semResults[i].noteName;
      scores.set(n, (scores.get(n) ?? 0) + 1 / (k + i + 1));
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    for (let i = 0; i < ranked.length; i++) {
      hybridLines.push(
        ` ${String(i + 1).padStart(2)}. ${ranked[i][0].padEnd(30)} ${ranked[i][1].toFixed(4)}`,
      );
    }
  } else {
    hybridLines.push('  hybrid: both BM25 and semantic indexes required');
  }
  sections.push(hybridLines.join('\n'));

  return sections.join('\n\n') + '\n';
}

/**
 * Shows how a note is represented in both the BM25 and embedding indexes.
 *
 * @param noteName   - Exact note name (base filename without extension).
 * @param vaultIndex - Loaded BM25 index, or null.
 * @param embeddings - Loaded embedding index, or null.
 */
export function cmdNote(
  noteName: string,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
): string {
  const lines: string[] = [];

  lines.push(`=== BM25: "${noteName}" ===`);
  if (vaultIndex) {
    const result = vaultIndex.search(noteName, 50).find((r) => r.noteName === noteName);
    if (result) {
      lines.push(`File:    ${result.filePath}`);
      lines.push(`Content: ${result.content.slice(0, 300)}`);
    } else {
      lines.push('  not found in BM25 index');
    }
  } else {
    lines.push('  index not available');
  }
  lines.push('');

  lines.push(`=== Semantic: "${noteName}" ===`);
  if (embeddings) {
    const chunks = embeddings.getChunks(noteName);
    if (chunks) {
      lines.push(`Chunks: ${chunks.length}`);
      for (const chunk of chunks) {
        lines.push(`[${chunk.chunkIndex}] ${chunk.chunkText.length} chars  ${chunk.chunkText.slice(0, 120)}`);
      }
    } else {
      lines.push('  not found in embedding index');
    }
  } else {
    lines.push('  index not available');
  }

  return lines.join('\n') + '\n';
}

/**
 * Lists all stored chunks for a note with full text (no truncation).
 *
 * @param noteName   - Exact note name.
 * @param embeddings - Loaded embedding index, or null.
 */
export function cmdChunks(noteName: string, embeddings: VaultEmbeddings | null): string {
  if (!embeddings) {
    return 'index not available\n';
  }

  const chunks = embeddings.getChunks(noteName);
  if (!chunks) {
    return `Note "${noteName}" not found in embedding index\n`;
  }

  const lines: string[] = [`Note: "${noteName}" — ${chunks.length} chunks`];
  for (const chunk of chunks) {
    lines.push('');
    lines.push(`[chunk ${chunk.chunkIndex}] ${chunk.chunkText.length} chars`);
    lines.push(chunk.chunkText);
  }

  return lines.join('\n') + '\n';
}

/**
 * Shows file sizes, note/chunk counts, model metadata, and staleness for both indexes.
 *
 * @param vaultRoot  - Absolute path to the vault root.
 * @param vaultIndex - Loaded BM25 index, or null.
 * @param embeddings - Loaded embedding index, or null.
 */
export async function cmdStats(
  vaultRoot: string,
  vaultIndex: VaultIndex | null,
  embeddings: VaultEmbeddings | null,
): Promise<string> {
  const dir = path.join(vaultRoot, LORECRAFT_DIR);
  const lines: string[] = [];

  lines.push('=== BM25 index ===');
  if (vaultIndex) {
    const s = vaultIndex.stats;
    const [idxSize, metaSize] = await Promise.all([
      statSize(path.join(dir, 'index.json')),
      statSize(path.join(dir, 'index-meta.json')),
    ]);
    const stale = await vaultIndex.isStale(vaultRoot);
    lines.push(`Notes:     ${s.noteCount}`);
    lines.push(`Indexed:   ${fmtDate(s.indexedAt)}`);
    lines.push(`Files:     .lorecraft/index.json (${idxSize})`);
    lines.push(`           .lorecraft/index-meta.json (${metaSize})`);
    lines.push(`Staleness: ${stale ? 'stale' : 'up to date'}`);
  } else {
    lines.push('  not found — run /index build to create');
  }

  lines.push('');
  lines.push('=== Embedding index ===');
  if (embeddings) {
    const s = embeddings.stats;
    const [embSize, metaSize] = await Promise.all([
      statSize(path.join(dir, 'embeddings.json')),
      statSize(path.join(dir, 'embeddings-meta.json')),
    ]);
    const stale = await embeddings.isStale(vaultRoot);
    lines.push(`Notes:     ${s.noteCount}`);
    lines.push(`Chunks:    ${embeddings.chunkCount}`);
    lines.push(`Model:     ${s.modelId}`);
    lines.push(`Dims:      ${s.dimensions}`);
    lines.push(`Indexed:   ${fmtDate(s.indexedAt)}`);
    lines.push(`Files:     .lorecraft/embeddings.json (${embSize})`);
    lines.push(`           .lorecraft/embeddings-meta.json (${metaSize})`);
    lines.push(`Staleness: ${stale ? 'stale' : 'up to date'}`);
  } else {
    lines.push('  not found — run /index rebuild to create');
  }

  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  initLogger();

  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(
      'Usage: inspect <subcommand> [args]\n  subcommands: search, note, chunks, stats\n',
    );
    process.exit(1);
  }

  const subcommand = argv[0];

  const vaultRoot = process.env['VAULT_ROOT'];
  if (!vaultRoot) {
    process.stderr.write('VAULT_ROOT environment variable is required\n');
    process.exit(1);
  }

  let limit = 10;
  const positional: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      const val = parseInt(argv[i + 1] ?? '', 10);
      if (isNaN(val)) {
        process.stderr.write('--limit must be a number\n');
        process.exit(1);
      }
      limit = val;
      i++;
    } else {
      positional.push(argv[i]);
    }
  }

  try {
    if (subcommand === 'search') {
      const query = positional.join(' ');
      if (!query.trim()) {
        process.stderr.write('Usage: inspect search <query> [--limit N]\n');
        process.exit(1);
      }
      const [vaultIndex, embeddings] = await Promise.all([
        VaultIndex.load(vaultRoot),
        VaultEmbeddings.load(vaultRoot),
      ]);
      const provider = getEmbeddingProvider();
      process.stdout.write(await cmdSearch(query, limit, vaultIndex, embeddings, provider));
    } else if (subcommand === 'note') {
      const noteName = positional.join(' ');
      if (!noteName.trim()) {
        process.stderr.write('Usage: inspect note <note-name>\n');
        process.exit(1);
      }
      const [vaultIndex, embeddings] = await Promise.all([
        VaultIndex.load(vaultRoot),
        VaultEmbeddings.load(vaultRoot),
      ]);
      process.stdout.write(cmdNote(noteName, vaultIndex, embeddings));
    } else if (subcommand === 'chunks') {
      const noteName = positional.join(' ');
      if (!noteName.trim()) {
        process.stderr.write('Usage: inspect chunks <note-name>\n');
        process.exit(1);
      }
      const embeddings = await VaultEmbeddings.load(vaultRoot);
      process.stdout.write(cmdChunks(noteName, embeddings));
    } else if (subcommand === 'stats') {
      const [vaultIndex, embeddings] = await Promise.all([
        VaultIndex.load(vaultRoot),
        VaultEmbeddings.load(vaultRoot),
      ]);
      process.stdout.write(await cmdStats(vaultRoot, vaultIndex, embeddings));
    } else {
      process.stderr.write(
        `Unknown subcommand: "${subcommand}"\nUsage: inspect <subcommand> [args]\n  subcommands: search, note, chunks, stats\n`,
      );
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
