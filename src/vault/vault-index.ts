import fs from 'fs/promises';
import path from 'path';
import MiniSearch from 'minisearch';
import { VaultReader } from './vault-reader.js';
import { getLogger } from '../utils/logger.js';

/** A single search result returned by `VaultIndex.search()`. */
export type SearchResult = {
  filePath: string;
  noteName: string;
  content: string;
  score: number;
};

/** Metadata about the current state of the index. */
export type IndexStats = {
  noteCount: number;
  indexedAt: Date;
};

type IndexedDoc = {
  id: string;
  filePath: string;
  noteName: string;
  content: string;
};

type IndexMeta = {
  noteCount: number;
  indexedAt: string;
  /** Map of vault-relative path → mtime epoch ms at index time. */
  fileMtimes: Record<string, number>;
};

const LORECRAFT_DIR = '.lorecraft';
const INDEX_FILE = 'index.json';
const META_FILE = 'index-meta.json';

const MS_OPTIONS = {
  fields: ['noteName', 'content'],
  storeFields: ['filePath', 'noteName', 'content'],
  idField: 'id',
};

/**
 * BM25 keyword index over all vault notes. Persists to `{vaultRoot}/.lorecraft/`.
 * Use `VaultIndex.build()` to create a fresh index, `VaultIndex.load()` to
 * restore one from disk, and `update()` to incrementally re-index changed files.
 */
export class VaultIndex {
  private readonly ms: MiniSearch<IndexedDoc>;
  private readonly meta: IndexMeta;

  private constructor(ms: MiniSearch<IndexedDoc>, meta: IndexMeta) {
    this.ms = ms;
    this.meta = meta;
  }

  /**
   * Indexes all `.md` files in `vaultRoot` and writes the result to
   * `{vaultRoot}/.lorecraft/`. Replaces any existing index.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @returns A ready-to-use `VaultIndex`.
   */
  static async build(vaultRoot: string): Promise<VaultIndex> {
    const log = getLogger('vault-index');
    const reader = new VaultReader(vaultRoot);
    const notes = await reader.listNotes();

    const ms = new MiniSearch<IndexedDoc>(MS_OPTIONS);
    const fileMtimes: Record<string, number> = {};
    const docs: IndexedDoc[] = [];

    for (const filePath of notes) {
      const relPath = path.relative(vaultRoot, filePath);
      const noteName = path.basename(filePath, '.md');
      const content = await reader.readNote(filePath);
      const stat = await fs.stat(filePath);
      fileMtimes[relPath] = stat.mtimeMs;
      docs.push({ id: relPath, filePath, noteName, content });
    }

    ms.addAll(docs);

    const meta: IndexMeta = {
      noteCount: notes.length,
      indexedAt: new Date().toISOString(),
      fileMtimes,
    };

    await VaultIndex._persist(vaultRoot, ms, meta);
    log.info({ noteCount: notes.length }, 'index built');
    return new VaultIndex(ms, meta);
  }

  /**
   * Restores an index from `{vaultRoot}/.lorecraft/`. Returns `null` when no
   * persisted index exists yet.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @returns The loaded `VaultIndex`, or `null` if no index exists.
   */
  static async load(vaultRoot: string): Promise<VaultIndex | null> {
    const log = getLogger('vault-index');
    const dir = path.join(vaultRoot, LORECRAFT_DIR);
    const indexPath = path.join(dir, INDEX_FILE);
    const metaPath = path.join(dir, META_FILE);

    try {
      const [indexRaw, metaRaw] = await Promise.all([
        fs.readFile(indexPath, 'utf-8'),
        fs.readFile(metaPath, 'utf-8'),
      ]);
      const ms = MiniSearch.loadJSON<IndexedDoc>(indexRaw, MS_OPTIONS);
      const meta = JSON.parse(metaRaw) as IndexMeta;
      log.info({ noteCount: meta.noteCount }, 'index loaded');
      return new VaultIndex(ms, meta);
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        log.debug({}, 'no persisted index found');
        return null;
      }
      throw err;
    }
  }

  /**
   * Incrementally re-indexes changed files, adds new ones, and removes deleted
   * ones, then persists the result.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   * @returns Counts of added, updated, and removed documents.
   */
  async update(
    vaultRoot: string,
  ): Promise<{ added: number; updated: number; removed: number }> {
    const log = getLogger('vault-index');
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

      if (storedMtime === undefined) {
        const noteName = path.basename(filePath, '.md');
        const content = await reader.readNote(filePath);
        this.ms.add({ id: relPath, filePath, noteName, content });
        this.meta.fileMtimes[relPath] = stat.mtimeMs;
        added++;
      } else if (storedMtime !== stat.mtimeMs) {
        const noteName = path.basename(filePath, '.md');
        const content = await reader.readNote(filePath);
        this.ms.replace({ id: relPath, filePath, noteName, content });
        this.meta.fileMtimes[relPath] = stat.mtimeMs;
        updated++;
      }
    }

    let removed = 0;
    for (const relPath of Object.keys(this.meta.fileMtimes)) {
      if (!currentRelPaths.has(relPath)) {
        this.ms.discard(relPath);
        delete this.meta.fileMtimes[relPath];
        removed++;
      }
    }

    this.meta.noteCount = currentNotes.length;
    this.meta.indexedAt = new Date().toISOString();

    await VaultIndex._persist(vaultRoot, this.ms, this.meta);
    log.info({ added, updated, removed }, 'index updated');
    return { added, updated, removed };
  }

  /**
   * Returns `true` if any vault `.md` file has been added, removed, or modified
   * since the index was last built or updated.
   *
   * @param vaultRoot - Absolute path to the vault root directory.
   */
  async isStale(vaultRoot: string): Promise<boolean> {
    const reader = new VaultReader(vaultRoot);
    const currentNotes = await reader.listNotes();

    if (currentNotes.length !== Object.keys(this.meta.fileMtimes).length) {
      return true;
    }

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
   * Queries the index with BM25 scoring and returns ranked results.
   *
   * @param query - Search query string.
   * @param limit - Maximum number of results to return. Default: 10.
   * @returns Results sorted by descending BM25 score.
   */
  search(query: string, limit = 10): SearchResult[] {
    const raw = this.ms.search(query).slice(0, limit);
    return raw.map((r) => ({
      filePath: r['filePath'] as string,
      noteName: r['noteName'] as string,
      content: r['content'] as string,
      score: r.score,
    }));
  }

  /** Summary statistics for the current index state. */
  get stats(): IndexStats {
    return {
      noteCount: this.meta.noteCount,
      indexedAt: new Date(this.meta.indexedAt),
    };
  }

  private static async _persist(
    vaultRoot: string,
    ms: MiniSearch<IndexedDoc>,
    meta: IndexMeta,
  ): Promise<void> {
    const dir = path.join(vaultRoot, LORECRAFT_DIR);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(dir, INDEX_FILE),
        JSON.stringify(ms.toJSON()),
        'utf-8',
      ),
      fs.writeFile(path.join(dir, META_FILE), JSON.stringify(meta), 'utf-8'),
    ]);
  }
}
