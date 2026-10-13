import path from 'path';
import { describe, it, expect } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { GenerationSession } from '../agent/generation-loop.js';

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
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

const usageOf = (input: number, output: number) => ({
  inputTokens: {
    total: input,
    noCache: input,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

/** Mock model: call 0 requests a wikilink_resolve tool call, later calls answer with text. */
function makeToolCallingMockModel() {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      if (call++ === 0) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: 'wikilink_resolve',
                input: JSON.stringify({ wikilink: 'Thieves Guild' }),
              },
              {
                type: 'finish' as const,
                finishReason: { unified: 'tool-calls' as const, raw: undefined },
                logprobs: undefined,
                usage: usageOf(100, 5),
              },
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 'text-1' },
            { type: 'text-delta' as const, id: 'text-1', delta: MOCK_OUTPUT },
            { type: 'text-end' as const, id: 'text-1' },
            {
              type: 'finish' as const,
              finishReason: { unified: 'stop' as const, raw: undefined },
              logprobs: undefined,
              usage: usageOf(200, 20),
            },
          ],
        }),
      };
    },
  });
}

describe('GenerationSession integration', () => {
  it('happy path: returns content and usage, calls onText', async () => {
    const chunks: string[] = [];
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
      model: makeMockModel(),
    });
    const result = await session.generate({ onText: (c) => chunks.push(c) });

    expect(result.content).toBe(MOCK_OUTPUT);
    expect(result.usage.inputTokens).toBeTypeOf('number');
    expect(result.usage.outputTokens).toBeTypeOf('number');
    expect(result.usage.totalTokens).toBeTypeOf('number');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(MOCK_OUTPUT);
  });

  it('gathers context note when faction input matches a vault note', async () => {
    const model = makeMockModel();
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: {
        name: 'Mira Shadowcloak',
        role: 'Spy',
        faction: 'Thieves Guild',
      },
      model,
    });
    await session.generate();

    const systemContent = JSON.stringify(model.doStreamCalls[0]);
    expect(systemContent).toContain('Thieves Guild');
  });

  it('assembled prompt matches snapshot', async () => {
    const model = makeMockModel();
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: {
        name: 'Mira Shadowcloak',
        role: 'Spy',
        faction: 'Thieves Guild',
      },
      model,
    });
    await session.generate();

    expect(model.doStreamCalls[0]).toMatchSnapshot();
  });

  it('throws when a required input is missing', async () => {
    await expect(
      GenerationSession.create({
        vaultRoot: FIXTURE_VAULT,
        templatePath: NPC_TEMPLATE,
        inputs: { role: 'Spy' }, // missing required 'name'
        model: makeMockModel(),
      }),
    ).rejects.toThrow('Missing required inputs: name');
  });

  it('succeeds with tiny budget: skips oversized context notes without crashing', async () => {
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: {
        name: 'Mira Shadowcloak',
        role: 'Spy',
        faction: 'Thieves Guild',
      },
      budgetTokens: 10,
      model: makeMockModel(),
    });
    const result = await session.generate();

    expect(result.content).toBeTruthy();
  });

  it('continue() streams second response from same session', async () => {
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
      model: makeMockModel(),
    });
    await session.generate();

    const second = await session.continue(
      'Give this NPC a weird habit.',
      undefined,
    );

    expect(second.content).toBe(MOCK_OUTPUT);
    expect(second.usage.totalTokens).toBeGreaterThan(0);
  });

  it('reports usage summed across all tool-loop steps', async () => {
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
      model: makeToolCallingMockModel(),
    });
    const result = await session.generate();

    expect(result.content).toBe(MOCK_OUTPUT);
    expect(result.usage.inputTokens).toBe(300); // 100 (tool step) + 200 (answer step)
    expect(result.usage.outputTokens).toBe(25); // 5 + 20
    expect(result.usage.totalTokens).toBe(325);
  });

  it('continue() keeps tool calls and results from earlier steps in the history', async () => {
    const model = makeToolCallingMockModel();
    const session = await GenerationSession.create({
      vaultRoot: FIXTURE_VAULT,
      templatePath: NPC_TEMPLATE,
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
      model,
    });
    await session.generate();
    await session.continue('Give this NPC a weird habit.');

    // doStreamCalls: [0] tool step, [1] answer step, [2] the continue() request
    const prompt = model.doStreamCalls[2]!.prompt;
    const partTypes = prompt.flatMap((m) =>
      typeof m.content === 'string' ? [] : m.content.map((part) => part.type),
    );
    expect(partTypes).toContain('tool-call');
    expect(partTypes).toContain('tool-result');
  });
});
