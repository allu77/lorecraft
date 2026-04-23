import path from 'path';
import { describe, it, expect } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { VaultReader } from '../vault/vault-reader.js';
import { TemplateParser } from '../vault/template-parser.js';
import { ContextBudget } from '../agent/context-budget.js';
import { buildPrompt } from '../agent/prompt-builder.js';
import { GenerationSession } from '../agent/generation-loop.js';
import type { ContextNote } from '../agent/prompt-builder.js';

const FIXTURE_VAULT = path.resolve(import.meta.dirname, 'fixtures/test-vault');
const NPC_TEMPLATE = path.join(FIXTURE_VAULT, '_templates/npc.md');
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

  it('GenerationSession wires wikilink_resolve tool and returns LLM content', async () => {
    const MOCK_TEXT = '# Lyra\n\n**Role:** Rogue\nA slippery operative.';
    let callCount = 0;

    const model = new MockLanguageModelV3({
      doStream: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: 'tool-call',
                  toolCallId: 'tc-1',
                  toolName: 'wikilink_resolve',
                  input: JSON.stringify({ wikilink: '[[Thieves Guild]]' }),
                },
                {
                  type: 'finish',
                  finishReason: {
                    unified: 'tool-calls' as const,
                    raw: undefined,
                  },
                  logprobs: undefined,
                  usage: {
                    inputTokens: {
                      total: 10,
                      noCache: 10,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: { total: 5, text: 5, reasoning: undefined },
                  },
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start', id: 'text-1' },
              { type: 'text-delta', id: 'text-1', delta: MOCK_TEXT },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop' as const, raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: {
                    total: 20,
                    noCache: 20,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 30, text: 30, reasoning: undefined },
                },
              },
            ],
          }),
        };
      },
    });

    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Lyra', role: 'Rogue', faction: 'Thieves Guild' },
      model,
    });
    const result = await session.generate();

    expect(result.content).toBe(MOCK_TEXT);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });
});
