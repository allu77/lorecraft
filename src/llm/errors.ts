import { APICallError, RetryError } from 'ai';
import { DEFAULT_OLLAMA_BASE_URL } from './config.js';

const CONNECT_FAILURE = /^Cannot connect to API/;
const MISSING_MODEL_NAME = /model "([^"]+)" not found/;

function ollamaBaseURL(): string {
  return process.env['OLLAMA_BASE_URL'] || DEFAULT_OLLAMA_BASE_URL;
}

/** Extracts the `error` string from an Ollama JSON error body, falling back to the raw text. */
function ollamaErrorText(responseBody: string | undefined): string {
  if (!responseBody) return '';
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      return String((parsed as { error: unknown }).error);
    }
  } catch {
    // not JSON; use the raw text
  }
  return responseBody;
}

function unwrap(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

/**
 * Returns a GM-readable explanation for the failures a local Ollama setup most
 * often hits: the server is not running, or the model has not been pulled.
 *
 * Only errors whose request URL points at the configured Ollama server are
 * translated; everything else (other providers, unrelated failures) returns
 * `undefined` so the caller shows the original error.
 *
 * @param error - Any thrown value, typically from a generation or embedding call.
 * @returns A message naming the setting or command that fixes the problem, or `undefined`.
 */
export function describeProviderError(error: unknown): string | undefined {
  const cause = unwrap(error);
  if (!APICallError.isInstance(cause)) return undefined;

  const baseURL = ollamaBaseURL().replace(/\/+$/, '');
  if (!cause.url.startsWith(baseURL)) return undefined;

  if (CONNECT_FAILURE.test(cause.message)) {
    return `Cannot reach Ollama at ${baseURL}. Start it (ollama serve) and check OLLAMA_BASE_URL.`;
  }

  const detail = ollamaErrorText(cause.responseBody);
  if (cause.statusCode === 404 && /not found/i.test(detail)) {
    const model = MISSING_MODEL_NAME.exec(detail)?.[1];
    return model
      ? `Ollama model "${model}" is not available. Pull it with: ollama pull ${model}`
      : 'The Ollama model is not available. Pull it with: ollama pull <model>';
  }

  return undefined;
}
