import fs from 'fs/promises';
import path from 'path';

/** Constituent parts of an Obsidian wikilink. */
export type WikilinkParts = {
  /** The note name, e.g. `"Thieves Guild"` from `[[Thieves Guild#Goals|the Guild]]`. */
  noteName: string;
  /** The section fragment, e.g. `"Goals"` from `[[Thieves Guild#Goals]]`, or `null`. */
  section: string | null;
  /** The display alias, e.g. `"the Guild"` from `[[Thieves Guild|the Guild]]`, or `null`. */
  altText: string | null;
};

/**
 * Provides all read access to a single Obsidian vault, including wikilink
 * resolution. All methods are scoped to the `vaultRoot` provided at
 * construction time.
 */
export class VaultReader {
  constructor(private readonly vaultRoot: string) {}

  /**
   * Returns the absolute paths of all `.md` files under `vaultRoot`, recursively.
   */
  async listNotes(): Promise<string[]> {
    return this._listMdFiles(this.vaultRoot);
  }

  private async _listMdFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this._listMdFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * Finds the first `.md` file whose base name matches `name`
   * (case-insensitive, path-agnostic).
   *
   * @param name - Note name with or without the `.md` extension.
   * @returns Absolute path of the matching file, or `null` if not found.
   * @throws On filesystem errors.
   */
  async findNote(name: string): Promise<string | null> {
    const baseName = name.endsWith('.md') ? name : `${name}.md`;
    const notes = await this.listNotes();
    const lower = baseName.toLowerCase();
    return notes.find((n) => path.basename(n).toLowerCase() === lower) ?? null;
  }

  /**
   * Reads a note's content. When `section` is provided, returns only the text
   * under that heading and all deeper headings (the section subtree), with the
   * heading line itself included.
   *
   * @param filePath - Absolute path to the note file.
   * @param section - Optional heading name to extract (case-insensitive).
   * @returns Full note text, or the section subtree when `section` is given.
   * @throws If the file cannot be read, or if `section` is specified but not found.
   */
  async readNote(filePath: string, section?: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!section) return content;
    return this._extractSection(content, section, filePath);
  }

  private _extractSection(content: string, section: string, filePath: string): string {
    const lines = content.split('\n');
    const headingRegex = /^(#{1,6})\s+(.+)$/;
    let startIndex = -1;
    let startDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(headingRegex);
      if (match && match[2].trim().toLowerCase() === section.toLowerCase()) {
        startIndex = i;
        startDepth = match[1].length;
        break;
      }
    }

    if (startIndex === -1) {
      throw new Error(
        `Section "${section}" not found in "${filePath}"`
      );
    }

    const sectionLines = [lines[startIndex]];
    for (let i = startIndex + 1; i < lines.length; i++) {
      const match = lines[i].match(headingRegex);
      if (match && match[1].length <= startDepth) break;
      sectionLines.push(lines[i]);
    }

    return sectionLines.join('\n');
  }

  /**
   * Parses a raw wikilink string into its constituent parts.
   * Accepts input with or without `[[ ]]` brackets. Pure string operation — no I/O.
   *
   * @param raw - Raw wikilink, e.g. `"[[Thieves Guild#Goals|the Guild]]"` or `"Thieves Guild"`.
   * @returns Parsed `WikilinkParts` with `noteName`, `section`, and `altText`.
   */
  parseWikilink(raw: string): WikilinkParts {
    let inner = raw.trim();
    if (inner.startsWith('[[') && inner.endsWith(']]')) {
      inner = inner.slice(2, -2);
    }

    let altText: string | null = null;
    const pipeIdx = inner.indexOf('|');
    if (pipeIdx !== -1) {
      altText = inner.slice(pipeIdx + 1);
      inner = inner.slice(0, pipeIdx);
    }

    let section: string | null = null;
    const hashIdx = inner.indexOf('#');
    if (hashIdx !== -1) {
      section = inner.slice(hashIdx + 1);
      inner = inner.slice(0, hashIdx);
    }

    return { noteName: inner, section, altText };
  }

  /**
   * Resolves a wikilink to the absolute path of the matching note.
   * Only `noteName` is used for resolution; `section` and `altText` are ignored.
   *
   * @param wikilink - Raw wikilink string, e.g. `"[[Thieves Guild#Goals]]"`.
   * @returns Absolute path of the matching note, or `null` if no match exists.
   * @throws On filesystem errors.
   */
  async resolveWikilink(wikilink: string): Promise<string | null> {
    const { noteName } = this.parseWikilink(wikilink);
    return this.findNote(noteName);
  }
}
