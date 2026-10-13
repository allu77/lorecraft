import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_OLLAMA_NUM_CTX,
  getLlmProviderName,
  getOllamaConfig,
} from './config.js';

const ENV_KEYS = [
  'LLM_PROVIDER',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_CTX',
] as const;

describe('llm config', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('getLlmProviderName', () => {
    it('defaults to bedrock when LLM_PROVIDER is unset or empty', () => {
      expect(getLlmProviderName()).toBe('bedrock');
      process.env['LLM_PROVIDER'] = '';
      expect(getLlmProviderName()).toBe('bedrock');
    });

    it.each(['bedrock', 'ollama'] as const)('accepts %s', (name) => {
      process.env['LLM_PROVIDER'] = name;
      expect(getLlmProviderName()).toBe(name);
    });

    it('reports anthropic as not implemented', () => {
      process.env['LLM_PROVIDER'] = 'anthropic';
      expect(() => getLlmProviderName()).toThrow(/not implemented/i);
    });

    it('rejects unknown providers and lists the supported values', () => {
      process.env['LLM_PROVIDER'] = 'openai';
      expect(() => getLlmProviderName()).toThrow(/"openai"[\s\S]*bedrock[\s\S]*ollama/);
    });
  });

  describe('getOllamaConfig', () => {
    it('uses defaults when nothing is set', () => {
      expect(getOllamaConfig()).toEqual({
        baseURL: undefined,
        model: 'llama3.1',
        numCtx: DEFAULT_OLLAMA_NUM_CTX,
      });
      expect(DEFAULT_OLLAMA_NUM_CTX).toBe(16_384);
    });

    it('passes OLLAMA_BASE_URL through unchanged', () => {
      process.env['OLLAMA_BASE_URL'] = 'http://box:11434/api/';
      expect(getOllamaConfig().baseURL).toBe('http://box:11434/api/');
    });

    it('reads OLLAMA_MODEL and OLLAMA_NUM_CTX', () => {
      process.env['OLLAMA_MODEL'] = 'qwen3';
      process.env['OLLAMA_NUM_CTX'] = '32768';
      expect(getOllamaConfig()).toMatchObject({ model: 'qwen3', numCtx: 32_768 });
    });

    it.each(['abc', '0', '-5', '1.5'])('rejects OLLAMA_NUM_CTX=%s', (value) => {
      process.env['OLLAMA_NUM_CTX'] = value;
      expect(() => getOllamaConfig()).toThrow(/OLLAMA_NUM_CTX/);
    });
  });
});
