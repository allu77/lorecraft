import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt-builder.js';
import type { BuildPromptArgs } from './prompt-builder.js';

const BASE_ARGS: BuildPromptArgs = {
  campaignStyle: 'A dark coastal world.',
  templateInstructions: 'Generate an NPC consistent with the faction.',
  templateBody: '# {{name}}\n**Role:**\n**Status:** Alive',
  contextNotes: [{ name: 'Thieves Guild', content: 'A criminal faction.' }],
  userInputs: { name: 'Mira', faction: 'Thieves Guild' },
};

describe('buildPrompt', () => {
  it('returns an object with system and prompt fields', () => {
    const result = buildPrompt(BASE_ARGS);
    expect(result).toHaveProperty('system');
    expect(result).toHaveProperty('prompt');
    expect(typeof result.system).toBe('string');
    expect(typeof result.prompt).toBe('string');
  });

  it('produces correct section order in system: base prose → Campaign Style → Your Task → Output Template → Relevant Notes', () => {
    const { system } = buildPrompt(BASE_ARGS);
    const csIdx = system.indexOf('## Campaign Style');
    const taskIdx = system.indexOf('## Your Task');
    const templateIdx = system.indexOf('## Output Template');
    const notesIdx = system.indexOf('## Relevant Notes');
    expect(csIdx).toBeGreaterThan(0);
    expect(taskIdx).toBeGreaterThan(csIdx);
    expect(templateIdx).toBeGreaterThan(taskIdx);
    expect(notesIdx).toBeGreaterThan(templateIdx);
  });

  it('contains campaignStyle in system', () => {
    const { system } = buildPrompt(BASE_ARGS);
    expect(system).toContain(BASE_ARGS.campaignStyle);
  });

  it('omits "Your Task" section when templateInstructions is empty', () => {
    const { system } = buildPrompt({ ...BASE_ARGS, templateInstructions: '' });
    expect(system).not.toContain('## Your Task');
  });

  it('omits "Your Task" section when templateInstructions is whitespace-only', () => {
    const { system } = buildPrompt({ ...BASE_ARGS, templateInstructions: '   \n  ' });
    expect(system).not.toContain('## Your Task');
  });

  it('always includes templateBody in system', () => {
    const noInstructions = buildPrompt({ ...BASE_ARGS, templateInstructions: '' });
    const noNotes = buildPrompt({ ...BASE_ARGS, contextNotes: [] });
    expect(noInstructions.system).toContain(BASE_ARGS.templateBody);
    expect(noNotes.system).toContain(BASE_ARGS.templateBody);
  });

  it('omits "Relevant Notes" section when contextNotes is empty', () => {
    const { system } = buildPrompt({ ...BASE_ARGS, contextNotes: [] });
    expect(system).not.toContain('## Relevant Notes');
  });

  it('renders multiple notes each with ### header', () => {
    const { system } = buildPrompt({
      ...BASE_ARGS,
      contextNotes: [
        { name: 'Note Alpha', content: 'Alpha content.' },
        { name: 'Note Beta', content: 'Beta content.' },
      ],
    });
    expect(system).toContain('### Note Alpha');
    expect(system).toContain('Alpha content.');
    expect(system).toContain('### Note Beta');
    expect(system).toContain('Beta content.');
  });

  it('includes userInputs as key: value lines in prompt', () => {
    const { prompt } = buildPrompt(BASE_ARGS);
    expect(prompt).toContain('- name: Mira');
    expect(prompt).toContain('- faction: Thieves Guild');
  });

  it('prompt starts with the generation instruction', () => {
    const { prompt } = buildPrompt(BASE_ARGS);
    expect(prompt).toMatch(/^Generate the note with the following inputs:/);
  });
});
