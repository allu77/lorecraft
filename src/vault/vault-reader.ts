import fs from 'fs/promises';
import path from 'path';

export type WikilinkParts = {
  noteName: string;
  section: string | null;
  altText: string | null;
};

export class VaultReader {
  constructor(private readonly vaultRoot: string) {}

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

  async findNote(name: string): Promise<string | null> {
    const baseName = name.endsWith('.md') ? name : `${name}.md`;
    const notes = await this.listNotes();
    const lower = baseName.toLowerCase();
    return notes.find((n) => path.basename(n).toLowerCase() === lower) ?? null;
  }

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

  async resolveWikilink(wikilink: string): Promise<string | null> {
    const { noteName } = this.parseWikilink(wikilink);
    return this.findNote(noteName);
  }
}
