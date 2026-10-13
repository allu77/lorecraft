import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { GenerationSession } from '../agent/generation-loop.js';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  contextWindow: null as number | null,
  mockModel: undefined as unknown,
}));

vi.mock('../utils/logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: mocks.info,
    warn: mocks.warn,
    error: vi.fn(),
    child: vi.fn(),
  };
  return { getLogger: () => logger, initLogger: vi.fn() };
});

vi.mock('../llm/provider.js', () => ({
  getModel: () => mocks.mockModel,
  getModelInfo: () => ({ provider: 'ollama', modelId: 'qwen3' }),
  getContextWindow: () => mocks.contextWindow,
}));

const FIXTURE_VAULT = path.resolve(import.meta.dirname, 'fixtures/test-vault');
const NPC_TEMPLATE = path.join(FIXTURE_VAULT, '_templates/npc.md');

function makeModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'ok' },
          { type: 'text-end', id: 't' },
          {
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: undefined, text: undefined, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

const OPTIONS = {
  vaultRoot: FIXTURE_VAULT,
  templatePath: NPC_TEMPLATE,
  inputs: { name: 'Mira', role: 'Spy' },
};

describe('context budget vs provider context window', () => {
  beforeEach(() => {
    mocks.warn.mockClear();
    mocks.info.mockClear();
    mocks.contextWindow = null;
    mocks.mockModel = makeModel();
  });

  it('warns when the budget does not fit the Ollama context window', async () => {
    mocks.contextWindow = 8_000;
    await GenerationSession.create({ ...OPTIONS, budgetTokens: 8_000 });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(String(mocks.warn.mock.calls[0]?.[1])).toMatch(/context window/);
    expect(mocks.warn.mock.calls[0]?.[0]).toMatchObject({ budgetTokens: 8_000, windowTokens: 8_000 });
  });

  it('does not warn when the budget fits', async () => {
    mocks.contextWindow = 32_768;
    await GenerationSession.create({ ...OPTIONS, budgetTokens: 8_000 });
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('does not warn when the provider manages its own window (null)', async () => {
    await GenerationSession.create({ ...OPTIONS, budgetTokens: 1_000_000 });
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('skips the check when a model is injected', async () => {
    mocks.contextWindow = 100;
    await GenerationSession.create({ ...OPTIONS, budgetTokens: 8_000, model: makeModel() });
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('logs the provider and model actually in use', async () => {
    await GenerationSession.create(OPTIONS);
    expect(mocks.info).toHaveBeenCalledWith(
      { provider: 'ollama', model: 'qwen3' },
      'model resolved',
    );
  });

  it('reports 0 tokens when the model returns no usage counts', async () => {
    const session = await GenerationSession.create(OPTIONS);
    const result = await session.generate({ onText: () => {} });
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});
