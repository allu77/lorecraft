import { describe, it, expect } from 'vitest';
import path from 'path';
import { VaultReader } from './vault-reader';

const FIXTURE_VAULT_ROOT = path.resolve(
  __dirname,
  '../__tests__/fixtures/test-vault'
);

describe('VaultReader', () => {
  const reader = new VaultReader(FIXTURE_VAULT_ROOT);

  describe('listNotes()', () => {
    it('returns exactly 4 .md files', async () => {
      const notes = await reader.listNotes();
      expect(notes).toHaveLength(4);
    });

    it('returns only .md files', async () => {
      const notes = await reader.listNotes();
      for (const note of notes) {
        expect(note).toMatch(/\.md$/);
      }
    });

    it('returns absolute paths', async () => {
      const notes = await reader.listNotes();
      for (const note of notes) {
        expect(path.isAbsolute(note)).toBe(true);
      }
    });

    it('includes all expected fixture files', async () => {
      const notes = await reader.listNotes();
      const basenames = notes.map((n) => path.basename(n));
      expect(basenames).toContain('Campaign Style.md');
      expect(basenames).toContain('Thieves Guild.md');
      expect(basenames).toContain('Mira Shadowcloak.md');
      expect(basenames).toContain('npc.md');
    });
  });

  describe('findNote()', () => {
    it('finds a note by exact name (without extension)', async () => {
      const result = await reader.findNote('Thieves Guild');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
    });

    it('finds a note by exact name (with extension)', async () => {
      const result = await reader.findNote('Thieves Guild.md');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
    });

    it('finds a note with case-insensitive match', async () => {
      const result = await reader.findNote('thieves guild');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
    });

    it('returns null for a nonexistent note', async () => {
      const result = await reader.findNote('Nonexistent Note');
      expect(result).toBeNull();
    });
  });

  describe('readNote()', () => {
    it('returns full content of a note', async () => {
      const filePath = path.join(FIXTURE_VAULT_ROOT, 'Campaign Style.md');
      const content = await reader.readNote(filePath);
      expect(content).toContain('# Campaign Style — The Shattered Coast');
      expect(content).toContain('Gritty and grounded');
    });

    it('extracts a section subtree by heading name', async () => {
      const filePath = path.join(
        FIXTURE_VAULT_ROOT,
        'Factions/Thieves Guild.md'
      );
      const content = await reader.readNote(filePath, 'Goals');
      expect(content).toContain('## Goals');
      expect(content).toContain('Control the black market');
      expect(content).not.toContain('## Allies');
    });

    it('throws when the requested section is not found', async () => {
      const filePath = path.join(
        FIXTURE_VAULT_ROOT,
        'Factions/Thieves Guild.md'
      );
      await expect(reader.readNote(filePath, 'Nonexistent Section')).rejects.toThrow();
    });

    it('throws on a bad file path', async () => {
      await expect(
        reader.readNote('/does/not/exist.md')
      ).rejects.toThrow();
    });
  });

  describe('parseWikilink()', () => {
    it('parses a plain wikilink', () => {
      const result = reader.parseWikilink('[[Thieves Guild]]');
      expect(result).toEqual({
        noteName: 'Thieves Guild',
        section: null,
        altText: null,
      });
    });

    it('parses a wikilink with a section', () => {
      const result = reader.parseWikilink('[[Thieves Guild#Goals]]');
      expect(result).toEqual({
        noteName: 'Thieves Guild',
        section: 'Goals',
        altText: null,
      });
    });

    it('parses a wikilink with alt text', () => {
      const result = reader.parseWikilink('[[Thieves Guild|the Guild]]');
      expect(result).toEqual({
        noteName: 'Thieves Guild',
        section: null,
        altText: 'the Guild',
      });
    });

    it('parses a wikilink with section and alt text', () => {
      const result = reader.parseWikilink('[[Thieves Guild#Goals|the Guild goals]]');
      expect(result).toEqual({
        noteName: 'Thieves Guild',
        section: 'Goals',
        altText: 'the Guild goals',
      });
    });

    it('parses input without brackets', () => {
      const result = reader.parseWikilink('Thieves Guild');
      expect(result).toEqual({
        noteName: 'Thieves Guild',
        section: null,
        altText: null,
      });
    });
  });

  describe('resolveWikilink()', () => {
    it('resolves a wikilink to the correct absolute path', async () => {
      const result = await reader.resolveWikilink('[[Thieves Guild]]');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
      expect(path.isAbsolute(result!)).toBe(true);
    });

    it('resolves case-insensitively', async () => {
      const result = await reader.resolveWikilink('[[thieves guild]]');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
    });

    it('returns null for a nonexistent note', async () => {
      const result = await reader.resolveWikilink('[[Nonexistent Note]]');
      expect(result).toBeNull();
    });

    it('resolves a wikilink with section (uses only noteName)', async () => {
      const result = await reader.resolveWikilink('[[Thieves Guild#Goals]]');
      expect(result).not.toBeNull();
      expect(result).toMatch(/Thieves Guild\.md$/);
    });
  });
});
