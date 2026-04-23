import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VaultIndex } from './vault-index.js';

const FIXTURE_VAULT = path.resolve(
  import.meta.dirname,
  '../__tests__/fixtures/test-vault',
);

/** Creates an isolated temp vault populated with the fixture vault's .md files. */
async function makeTempVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lorecraft-test-'));
  await copyMdFiles(FIXTURE_VAULT, dir);
  return dir;
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

describe('VaultIndex', () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await makeTempVault();
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('build() indexes all .md files; stats.noteCount matches file count', async () => {
    const index = await VaultIndex.build(vaultRoot);
    const allMd = await fs
      .readdir(vaultRoot, { recursive: true })
      .then((entries) =>
        (entries as string[]).filter((e) => e.endsWith('.md')),
      );
    expect(index.stats.noteCount).toBe(allMd.length);
    expect(index.stats.indexedAt).toBeInstanceOf(Date);
  });

  it('search("guild") returns notes containing that term, ordered by score', async () => {
    const index = await VaultIndex.build(vaultRoot);
    const results = index.search('guild');

    expect(results.length).toBeGreaterThan(0);
    // Thieves Guild note should rank first (appears in title + body)
    expect(results[0].noteName).toBe('Thieves Guild');
    // scores must be in descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('search("dragonfire") returns no results for the current fixture vault', async () => {
    const index = await VaultIndex.build(vaultRoot);
    expect(index.search('dragonfire')).toHaveLength(0);
  });

  it('isStale() returns false immediately after build', async () => {
    const index = await VaultIndex.build(vaultRoot);
    await expect(index.isStale(vaultRoot)).resolves.toBe(false);
  });

  it('isStale() returns true after an .md file is touched', async () => {
    const index = await VaultIndex.build(vaultRoot);

    // Give the filesystem at least 1 ms so mtime changes
    await new Promise((r) => setTimeout(r, 10));
    const file = path.join(vaultRoot, 'Campaign Style.md');
    const content = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, content + '\n', 'utf-8');

    await expect(index.isStale(vaultRoot)).resolves.toBe(true);
  });

  it('update() re-indexes changed files; returns correct counts', async () => {
    const index = await VaultIndex.build(vaultRoot);

    // Add a new file
    await fs.mkdir(path.join(vaultRoot, 'Locations'), { recursive: true });
    await fs.writeFile(
      path.join(vaultRoot, 'Locations', 'New Place.md'),
      '# New Place\nA place with bazaars and caravans.',
    );

    const counts = await index.update(vaultRoot);
    expect(counts.added).toBe(1);
    expect(counts.updated).toBe(0);
    expect(counts.removed).toBe(0);

    expect(index.search('bazaars').length).toBeGreaterThan(0);
  });

  it('persist → load round-trip: search() results identical', async () => {
    const index = await VaultIndex.build(vaultRoot);
    const before = index.search('guild');

    const loaded = await VaultIndex.load(vaultRoot);
    expect(loaded).not.toBeNull();
    const after = loaded!.search('guild');

    expect(after.map((r) => r.noteName)).toEqual(before.map((r) => r.noteName));
    expect(after.map((r) => r.score)).toEqual(before.map((r) => r.score));
  });

  it('load() returns null when no .lorecraft/ directory exists', async () => {
    await expect(VaultIndex.load(vaultRoot)).resolves.toBeNull();
  });
});
