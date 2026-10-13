import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { generateText, streamText } from 'ai';
import { getModel } from '../llm/provider.js';
import { getEmbeddingProvider } from '../llm/embedding-provider.js';

/**
 * Runs the real `ollama-ai-provider-v2` adapter against a stub HTTP server that
 * speaks the Ollama API, to prove what actually goes over the wire (no live Ollama).
 */
type Recorded = { path: string; body: Record<string, unknown> };

describe('Ollama wire format (stub server)', () => {
  let server: http.Server;
  let baseURL: string;
  let requests: Recorded[];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(parts).toString() || '{}') as Record<string, unknown>;
        requests.push({ path: req.url ?? '', body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url?.endsWith('/embed')) {
          const input = body['input'];
          const count = Array.isArray(input) ? input.length : 1;
          res.end(
            JSON.stringify({
              model: body['model'],
              embeddings: Array.from({ length: count }, () => [0.1, 0.2, 0.3]),
              total_duration: 1,
              load_duration: 1,
              prompt_eval_count: 3,
            }),
          );
          return;
        }
        const final = {
          model: body['model'],
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: 'Hello from stub' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 42,
          eval_count: 7,
        };
        if (body['stream'] === false) {
          res.end(JSON.stringify(final));
        } else {
          res.end(
            JSON.stringify({ ...final, message: { role: 'assistant', content: 'Hello from stub' }, done: false, done_reason: undefined }) +
              '\n' +
              JSON.stringify({ ...final, message: { role: 'assistant', content: '' } }) +
              '\n',
          );
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    requests = [];
    process.env['LLM_PROVIDER'] = 'ollama';
    process.env['OLLAMA_BASE_URL'] = baseURL;
    process.env['OLLAMA_MODEL'] = 'qwen3';
    process.env['OLLAMA_NUM_CTX'] = '24576';
    process.env['EMBEDDING_PROVIDER'] = 'ollama';
    delete process.env['EMBEDDING_MODEL_ID'];
    delete process.env['EMBEDDING_DIMENSIONS'];
  });

  afterAll(() => {
    for (const key of [
      'LLM_PROVIDER',
      'OLLAMA_BASE_URL',
      'OLLAMA_MODEL',
      'OLLAMA_NUM_CTX',
      'EMBEDDING_PROVIDER',
    ]) {
      delete process.env[key];
    }
  });

  it('chat: POSTs /api/chat with the model and options.num_ctx', async () => {
    const result = await generateText({ model: getModel(), prompt: 'hi' });
    expect(result.text).toContain('Hello from stub');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.path).toBe('/api/chat');
    expect(requests[0]!.body['model']).toBe('qwen3');
    expect(requests[0]!.body['options']).toEqual({ num_ctx: 24_576 });
  });

  it('chat: streaming requests also carry num_ctx, and usage comes from Ollama counts', async () => {
    const result = streamText({ model: getModel(), prompt: 'hi' });
    let text = '';
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toContain('Hello from stub');
    expect(requests[0]!.body['options']).toEqual({ num_ctx: 24_576 });
    const usage = await result.totalUsage;
    expect(usage.inputTokens).toBe(42);
    expect(usage.outputTokens).toBe(7);
  });

  it('embeddings: POSTs /api/embed with the model and returns vectors', async () => {
    const provider = getEmbeddingProvider()!;
    const vectors = await provider.embedMany(['a', 'b']);
    expect(vectors).toEqual([[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]);
    expect(requests[0]!.path).toBe('/api/embed');
    expect(requests[0]!.body['model']).toBe('nomic-embed-text');
    expect(provider.dimensions).toBe(768);
  });
});
