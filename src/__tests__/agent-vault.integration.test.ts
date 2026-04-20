import path from 'path';
import { describe, it, expect } from 'vitest';
import { VaultReader } from '../vault/vault-reader.js';
import { TemplateParser } from '../vault/template-parser.js';
import { ContextBudget } from '../agent/context-budget.js';
import { buildPrompt } from '../agent/prompt-builder.js';
import type { ContextNote } from '../agent/prompt-builder.js';

const FIXTURE_VAULT = path.resolve(import.meta.dirname, 'fixtures/test-vault');
const TOKEN_CEILING = 8_000;

describe('agent-vault integration', () => {
  it('assembles prompt from fixture vault and matches snapshot', async () => {
    const reader = new VaultReader(FIXTURE_VAULT);
    const parser = new TemplateParser();

    const campaignStyle = await reader.readNote(
      path.join(FIXTURE_VAULT, 'Campaign Style.md'),
    );
    const templateContent = await reader.readNote(
      path.join(FIXTURE_VAULT, '_templates/npc.md'),
    );
    const thievesGuildContent = await reader.readNote(
      path.join(FIXTURE_VAULT, 'Factions/Thieves Guild.md'),
    );
    const miraContent = await reader.readNote(
      path.join(FIXTURE_VAULT, 'NPCs/Mira Shadowcloak.md'),
    );

    const { agentPrompt, bodyMarkdown } = parser.parse(templateContent);

    const budget = new ContextBudget(TOKEN_CEILING);
    const contextNotes: ContextNote[] = [];

    const candidates: ContextNote[] = [
      { name: 'Thieves Guild', content: thievesGuildContent },
      { name: 'Mira Shadowcloak', content: miraContent },
    ];

    for (const candidate of candidates) {
      if (budget.fits(candidate.content)) {
        budget.add(candidate.content);
        contextNotes.push(candidate);
      }
    }

    const result = buildPrompt({
      campaignStyle,
      templateInstructions: agentPrompt,
      templateBody: bodyMarkdown,
      contextNotes,
      userInputs: { name: 'Mira Shadowcloak', faction: 'Thieves Guild' },
    });

    expect(result).toMatchSnapshot();
  });
});
