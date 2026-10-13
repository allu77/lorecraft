import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { DEFAULT_OLLAMA_NUM_CTX } from './config.js';
import {
  getContextWindow,
  getEmbeddingModel,
  getModel,
  getModelInfo,
} from './provider.js';

const ollama = vi.hoisted(() => ({
  createOllama: vi.fn(),
  inner: undefined as unknown,
  modelFactory: vi.fn(),
}));

vi.mock('ollama-ai-provider-v2', () => ({
  createOllama: ollama.createOllama,
}));

const ENV_KEYS = [
  'LLM_PROVIDER',
  'MODEL_ID',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_CTX',
] as const;

function makeInnerModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: 'inner',
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

/** `LanguageModel` also allows a plain model-ID string; the factories here never return one. */
function asModel(model: ReturnType<typeof getModel>): MockLanguageModelV4 {
  return model as unknown as MockLanguageModelV4;
}

const PROMPT = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] },
];

describe('llm provider', () => {
  const saved: Record<string, string | undefined> = {};
  let inner: MockLanguageModelV4;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    inner = makeInnerModel();
    ollama.modelFactory.mockReset().mockReturnValue(inner);
    ollama.createOllama.mockReset().mockReturnValue(ollama.modelFactory);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('bedrock (default)', () => {
    it('does not touch the Ollama adapter when LLM_PROVIDER is unset', () => {
      const model = getModel();
      expect(model).toMatchObject({
        modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      });
      expect(ollama.createOllama).not.toHaveBeenCalled();
    });

    it('honours MODEL_ID', () => {
      process.env['MODEL_ID'] = 'us.anthropic.claude-sonnet-x';
      expect(getModel()).toMatchObject({ modelId: 'us.anthropic.claude-sonnet-x' });
    });

    it('reports provider info and no managed context window', () => {
      expect(getModelInfo()).toEqual({
        provider: 'bedrock',
        modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      });
      expect(getContextWindow()).toBeNull();
    });
  });

  describe('ollama', () => {
    beforeEach(() => {
      process.env['LLM_PROVIDER'] = 'ollama';
    });

    it('creates the adapter with the base URL verbatim and the configured model', () => {
      process.env['OLLAMA_BASE_URL'] = 'http://box:11434/api';
      process.env['OLLAMA_MODEL'] = 'qwen3';
      getModel();
      expect(ollama.createOllama).toHaveBeenCalledWith({
        baseURL: 'http://box:11434/api',
      });
      expect(ollama.modelFactory).toHaveBeenCalledWith('qwen3');
    });

    it('omits baseURL when OLLAMA_BASE_URL is unset so the adapter default applies', () => {
      getModel();
      expect(ollama.createOllama).toHaveBeenCalledWith({});
      expect(ollama.modelFactory).toHaveBeenCalledWith('llama3.1');
    });

    it('sends the default num_ctx on every request', async () => {
      await asModel(getModel()).doGenerate({ prompt: PROMPT });
      expect(inner.doGenerateCalls[0]?.providerOptions).toEqual({
        ollama: { options: { num_ctx: DEFAULT_OLLAMA_NUM_CTX } },
      });
    });

    it('sends OLLAMA_NUM_CTX when set', async () => {
      process.env['OLLAMA_NUM_CTX'] = '32768';
      await asModel(getModel()).doGenerate({ prompt: PROMPT });
      expect(inner.doGenerateCalls[0]?.providerOptions?.['ollama']).toEqual({
        options: { num_ctx: 32_768 },
      });
    });

    it('preserves call-level Ollama provider options alongside num_ctx', async () => {
      await asModel(getModel()).doGenerate({
        prompt: PROMPT,
        providerOptions: { ollama: { think: true, options: { temperature: 0.2 } } },
      });
      expect(inner.doGenerateCalls[0]?.providerOptions?.['ollama']).toEqual({
        think: true,
        options: { temperature: 0.2, num_ctx: DEFAULT_OLLAMA_NUM_CTX },
      });
    });

    it('fails fast on an invalid OLLAMA_NUM_CTX', () => {
      process.env['OLLAMA_NUM_CTX'] = 'abc';
      expect(() => getModel()).toThrow(/OLLAMA_NUM_CTX/);
    });

    it('reports provider info and the context window', () => {
      process.env['OLLAMA_MODEL'] = 'qwen3';
      process.env['OLLAMA_NUM_CTX'] = '8192';
      expect(getModelInfo()).toEqual({ provider: 'ollama', modelId: 'qwen3' });
      expect(getContextWindow()).toBe(8192);
    });
  });

  it('rejects an unknown LLM_PROVIDER', () => {
    process.env['LLM_PROVIDER'] = 'nope';
    expect(() => getModel()).toThrow(/Unknown LLM_PROVIDER/);
  });
});

describe('getEmbeddingModel', () => {
  it('returns an embedding model for the given model ID without network access', () => {
    const model = getEmbeddingModel('amazon.titan-embed-text-v2:0');
    expect(model).toMatchObject({ modelId: 'amazon.titan-embed-text-v2:0' });
  });
});
