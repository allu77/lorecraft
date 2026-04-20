import path from 'path';
import { describe, it, expect } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { generateContent } from '../agent/generation-loop.js';

const FIXTURE_VAULT = path.resolve(import.meta.dirname, 'fixtures/test-vault');
const NPC_TEMPLATE = path.join(FIXTURE_VAULT, '_templates/npc.md');
const MOCK_OUTPUT = '# Mira Shadowcloak\n\n**Role:** Spy\n\nA shadowy figure.';

function makeMockModel(text = MOCK_OUTPUT) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: text },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

describe('generateContent integration', () => {
  it('happy path: returns content and usage, calls onChunk', async () => {
    const chunks: string[] = [];
    const result = await generateContent({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
      onChunk: (c) => chunks.push(c),
      model: makeMockModel(),
    });

    expect(result.content).toBe(MOCK_OUTPUT);
    expect(result.usage.inputTokens).toBeTypeOf('number');
    expect(result.usage.outputTokens).toBeTypeOf('number');
    expect(result.usage.totalTokens).toBeTypeOf('number');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(MOCK_OUTPUT);
  });

  it('gathers context note when faction input matches a vault note', async () => {
    const model = makeMockModel();
    await generateContent({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy', faction: 'Thieves Guild' },
      model,
    });

    const systemContent = JSON.stringify(model.doStreamCalls[0]);
    expect(systemContent).toContain('Thieves Guild');
  });

  it('assembled prompt matches snapshot', async () => {
    const model = makeMockModel();
    await generateContent({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy', faction: 'Thieves Guild' },
      model,
    });

    expect(model.doStreamCalls[0]).toMatchSnapshot();
  });

  it('throws when a required input is missing', async () => {
    await expect(
      generateContent({
        vaultRoot: FIXTURE_VAULT,
        templatePath: NPC_TEMPLATE,
        inputs: { role: 'Spy' }, // missing required 'name'
        model: makeMockModel(),
      }),
    ).rejects.toThrow('Missing required inputs: name');
  });

  it('succeeds with tiny budget: skips oversized context notes without crashing', async () => {
    const result = await generateContent({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy', faction: 'Thieves Guild' },
      budgetTokens: 10,
      model: makeMockModel(),
    });

    expect(result.content).toBeTruthy();
  });
});
