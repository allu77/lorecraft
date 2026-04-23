/** A single text chunk produced from a vault note. */
export type NoteChunk = {
  noteName: string;
  chunkIndex: number;
  chunkText: string;
};

const MIN_CHUNK_CHARS = 50;

/**
 * Splits a note into semantic chunks for embedding.
 *
 * Strategy: split at H2/H3 heading boundaries first; if a resulting section
 * exceeds `maxChunkChars`, split further on paragraph boundaries (`\n\n`).
 * Chunks shorter than 50 characters are discarded (empty sections, stray
 * frontmatter lines, etc.).
 *
 * @param noteName - Display name for the note (used in returned chunks).
 * @param content - Raw markdown content of the note.
 * @param maxChunkChars - Soft ceiling per chunk in characters. Default: 1500.
 * @returns Ordered array of chunks with `chunkIndex` matching position in output.
 */
export function chunkNote(
  noteName: string,
  content: string,
  maxChunkChars = 1500,
): NoteChunk[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) && currentLines.length > 0) {
      sections.push(currentLines.join('\n'));
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push(currentLines.join('\n'));
  }

  const rawChunks: string[] = [];

  for (const section of sections) {
    if (section.length <= maxChunkChars) {
      rawChunks.push(section);
    } else {
      // Split long section on paragraph boundaries
      const paras = section.split(/\n{2,}/);
      let current = '';
      for (const para of paras) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        if (!current) {
          current = trimmed;
        } else if (`${current}\n\n${trimmed}`.length <= maxChunkChars) {
          current = `${current}\n\n${trimmed}`;
        } else {
          rawChunks.push(current);
          current = trimmed;
        }
      }
      if (current) rawChunks.push(current);
    }
  }

  return rawChunks
    .filter((c) => c.trim().length >= MIN_CHUNK_CHARS)
    .map((chunkText, chunkIndex) => ({
      noteName,
      chunkIndex,
      chunkText: chunkText.trim(),
    }));
}
