import { describe, it, expect } from 'vitest';
import { chunkNote } from './note-chunker.js';

describe('chunkNote', () => {
  it('short note produces a single chunk containing all content', () => {
    const content = '# The Guild\n\nA band of rogues operating in the harbor.';
    const chunks = chunkNote('The Guild', content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].noteName).toBe('The Guild');
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].chunkText).toContain('band of rogues');
  });

  it('note with H2 headings produces one chunk per section', () => {
    const content = [
      '# Campaign Overview',
      '',
      'A grim coastal city wreathed in fog, where secrets hide in every alley.',
      '',
      '## Factions',
      '',
      'The Thieves Guild controls all illicit trade flowing through the docks.',
      '',
      '## Locations',
      '',
      'The harbor district is the most dangerous part of the city after dark.',
    ].join('\n');

    const chunks = chunkNote('Campaign Overview', content);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].chunkText).toContain('grim coastal city');
    expect(chunks[1].chunkText).toContain('## Factions');
    expect(chunks[1].chunkText).toContain('Thieves Guild');
    expect(chunks[2].chunkText).toContain('## Locations');
  });

  it('H3 headings are also treated as section boundaries', () => {
    const content = [
      '# Note',
      '',
      'Intro paragraph long enough to survive the minimum character filter here.',
      '',
      '### Sub-section A',
      '',
      'Content A is here and long enough to be kept as a separate chunk easily.',
      '',
      '### Sub-section B',
      '',
      'Content B is here and long enough to be kept as a separate chunk easily.',
    ].join('\n');

    const chunks = chunkNote('Note', content, 1500);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const texts = chunks.map((c) => c.chunkText);
    expect(texts.some((t) => t.includes('### Sub-section A'))).toBe(true);
    expect(texts.some((t) => t.includes('### Sub-section B'))).toBe(true);
  });

  it('H1 headings do NOT create a section boundary', () => {
    const content = [
      '# Title Line',
      '',
      'Body paragraph that is definitely long enough to pass the minimum chunk filter threshold.',
    ].join('\n');

    const chunks = chunkNote('Note', content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkText).toContain('Title Line');
    expect(chunks[0].chunkText).toContain('Body paragraph');
  });

  it('sections shorter than 50 characters are discarded', () => {
    const content = [
      '## Short',
      '',
      'Tiny.',
      '',
      '## Long Section',
      '',
      'This section has enough content to survive the minimum length filter easily.',
    ].join('\n');

    const chunks = chunkNote('Note', content);
    expect(chunks.every((c) => c.chunkText.length >= 50)).toBe(true);
    expect(chunks.some((c) => c.chunkText.includes('Too short'))).toBe(false);
    expect(chunks.some((c) => c.chunkText.includes('Long Section'))).toBe(true);
  });

  it('long section splits on paragraph boundaries', () => {
    const para = 'A'.repeat(600);
    const content = `## Section\n\n${para}\n\n${para}\n\n${para}`;
    const chunks = chunkNote('Note', content, 1500);
    // Three 600-char paragraphs cannot all fit in one 1500-char chunk
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.chunkText.length).toBeLessThanOrEqual(1500));
  });

  it('chunkIndex values are sequential 0-based positions in the output array', () => {
    const content = [
      '# Note',
      '',
      'First section that is long enough to pass through the minimum character filter.',
      '',
      '## Section Two',
      '',
      'Second section that is long enough to pass through the minimum character filter.',
      '',
      '## Section Three',
      '',
      'Third section that is long enough to pass through the minimum character filter.',
    ].join('\n');

    const chunks = chunkNote('Note', content);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it('empty content returns no chunks', () => {
    expect(chunkNote('Note', '')).toHaveLength(0);
  });

  it('heading text is preserved at the start of its chunk', () => {
    const content = '## Thieves Guild\n\nControls all crime in the city district.';
    const chunks = chunkNote('Note', content);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkText).toMatch(/^## Thieves Guild/);
  });
});
