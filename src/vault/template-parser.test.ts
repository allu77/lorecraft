import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TemplateParser } from './template-parser';

const FIXTURE_VAULT_ROOT = path.resolve(
  __dirname,
  '../__tests__/fixtures/test-vault'
);

const NPC_TEMPLATE_PATH = path.join(
  FIXTURE_VAULT_ROOT,
  '_templates/npc.md'
);

function loadFixture(relativePath: string): string {
  return fs.readFileSync(path.join(FIXTURE_VAULT_ROOT, relativePath), 'utf-8');
}

describe('TemplateParser', () => {
  const parser = new TemplateParser();

  describe('parse() with npc.md fixture', () => {
    it('extracts agentPrompt prose without the == INPUTS == block', () => {
      const content = fs.readFileSync(NPC_TEMPLATE_PATH, 'utf-8');
      const result = parser.parse(content);
      expect(result.agentPrompt).toContain('Generate a new NPC');
      expect(result.agentPrompt).toContain('campaign tone');
      expect(result.agentPrompt).not.toContain('== INPUTS ==');
      expect(result.agentPrompt).not.toContain('name (required)');
    });

    it('extracts inputs array with correct name, required, and description', () => {
      const content = fs.readFileSync(NPC_TEMPLATE_PATH, 'utf-8');
      const result = parser.parse(content);
      expect(result.inputs).toHaveLength(4);

      expect(result.inputs[0]).toEqual({
        name: 'name',
        required: true,
        description: "The NPC's full name",
      });
      expect(result.inputs[1]).toEqual({
        name: 'faction',
        required: false,
        description: 'Wikilink to the faction this NPC belongs to',
      });
      expect(result.inputs[2]).toEqual({
        name: 'location',
        required: false,
        description: "Wikilink to the NPC's base location",
      });
      expect(result.inputs[3]).toEqual({
        name: 'role',
        required: true,
        description: 'Brief description of their function in the campaign',
      });
    });

    it('bodyMarkdown retains structural Markdown and AGENT PROMPT block is absent', () => {
      const content = fs.readFileSync(NPC_TEMPLATE_PATH, 'utf-8');
      const result = parser.parse(content);
      expect(result.bodyMarkdown).toContain('# {{name}}');
      expect(result.bodyMarkdown).toContain('## Description');
      expect(result.bodyMarkdown).toContain('## Personality');
      expect(result.bodyMarkdown).not.toContain('== AGENT PROMPT ==');
      expect(result.bodyMarkdown).not.toContain('Generate a new NPC');
    });
  });

  describe('parse() — other %% comments preserved in bodyMarkdown', () => {
    it('preserves non-AGENT-PROMPT obsidian comments', () => {
      const content = `# Note\n\n%% some other comment %%\n\n## Section\n\nContent\n`;
      const result = parser.parse(content);
      expect(result.bodyMarkdown).toContain('%% some other comment %%');
    });
  });

  describe('parse() — template with no AGENT PROMPT block', () => {
    it('returns empty agentPrompt, empty inputs, and full content as bodyMarkdown', () => {
      const content = `# My Note\n\n## Section\n\nSome content here.\n`;
      const result = parser.parse(content);
      expect(result.agentPrompt).toBe('');
      expect(result.inputs).toEqual([]);
      expect(result.bodyMarkdown).toBe(content);
    });
  });

  describe('parse() — AGENT PROMPT block with no == INPUTS == section', () => {
    it('returns prose agentPrompt and empty inputs', () => {
      const content = `# Note\n\n%% == AGENT PROMPT ==\nGenerate something creative.\n%%\n\n## Body\n`;
      const result = parser.parse(content);
      expect(result.agentPrompt).toContain('Generate something creative');
      expect(result.inputs).toEqual([]);
    });
  });

  describe('parse() — malformed (unclosed) AGENT PROMPT block', () => {
    it('returns partial parse and does not throw', () => {
      const content = `# Note\n\n%% == AGENT PROMPT ==\nSome prompt text without closing\n\n## Body\n`;
      expect(() => parser.parse(content)).not.toThrow();
      const result = parser.parse(content);
      expect(result.agentPrompt).toContain('Some prompt text');
      expect(result.inputs).toEqual([]);
    });
  });
});
