import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { APICallError, RetryError } from 'ai';
import { describeProviderError } from './errors.js';

// Shapes recorded from ai 7.0.x + ollama-ai-provider-v2 4.0.1 against a closed port
// and against a server answering 404 for an unpulled model.
function connectionError(url = 'http://127.0.0.1:11434/api/chat'): APICallError {
  return new APICallError({
    message: 'Cannot connect to API: fetch failed',
    url,
    requestBodyValues: {},
    isRetryable: true,
    cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
      code: 'ECONNREFUSED',
    }),
  });
}

function missingModelError(
  model = 'llama3.1',
  url = 'http://127.0.0.1:11434/api/chat',
): APICallError {
  return new APICallError({
    message: 'Not Found',
    url,
    requestBodyValues: {},
    statusCode: 404,
    responseBody: JSON.stringify({
      error: `model "${model}" not found, try pulling it first`,
    }),
  });
}

describe('describeProviderError', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['OLLAMA_BASE_URL'];
    delete process.env['OLLAMA_BASE_URL'];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['OLLAMA_BASE_URL'];
    else process.env['OLLAMA_BASE_URL'] = saved;
  });

  it('explains an unreachable Ollama server and names OLLAMA_BASE_URL', () => {
    const message = describeProviderError(connectionError());
    expect(message).toMatch(/Cannot reach Ollama at http:\/\/127\.0\.0\.1:11434\/api/);
    expect(message).toMatch(/OLLAMA_BASE_URL/);
    expect(message).toMatch(/ollama serve/);
  });

  it('works for embedding requests too', () => {
    const message = describeProviderError(connectionError('http://127.0.0.1:11434/api/embed'));
    expect(message).toMatch(/Cannot reach Ollama/);
  });

  it('recognises a custom OLLAMA_BASE_URL', () => {
    process.env['OLLAMA_BASE_URL'] = 'http://box:9999/api';
    const message = describeProviderError(connectionError('http://box:9999/api/chat'));
    expect(message).toMatch(/Cannot reach Ollama at http:\/\/box:9999\/api/);
  });

  it('explains a model that has not been pulled and suggests ollama pull', () => {
    const message = describeProviderError(missingModelError('qwen3'));
    expect(message).toMatch(/"qwen3"/);
    expect(message).toMatch(/ollama pull qwen3/);
  });

  it('still explains a 404 whose body does not name the model', () => {
    const error = new APICallError({
      message: 'Not Found',
      url: 'http://127.0.0.1:11434/api/chat',
      requestBodyValues: {},
      statusCode: 404,
      responseBody: '{"error":"model not found, try pulling it first"}',
    });
    expect(describeProviderError(error)).toMatch(/ollama pull/);
  });

  it('unwraps a RetryError to its last error', () => {
    const error = new RetryError({
      message: 'Failed after 3 attempts',
      reason: 'maxRetriesExceeded',
      errors: [connectionError(), connectionError(), connectionError()],
    });
    expect(describeProviderError(error)).toMatch(/Cannot reach Ollama/);
  });

  it('returns undefined for errors from other providers', () => {
    expect(
      describeProviderError(connectionError('https://bedrock-runtime.us-east-1.amazonaws.com/x')),
    ).toBeUndefined();
  });

  it('returns undefined for unrelated Ollama errors', () => {
    const error = new APICallError({
      message: 'Internal Server Error',
      url: 'http://127.0.0.1:11434/api/chat',
      requestBodyValues: {},
      statusCode: 500,
      responseBody: '{"error":"boom"}',
    });
    expect(describeProviderError(error)).toBeUndefined();
  });

  it('returns undefined for non-API errors and non-errors', () => {
    expect(describeProviderError(new Error('whatever'))).toBeUndefined();
    expect(describeProviderError('string')).toBeUndefined();
    expect(describeProviderError(undefined)).toBeUndefined();
  });
});
