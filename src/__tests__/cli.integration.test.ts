import path from 'node:path';
import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { processCommand } from '../cli/index.js';
import type { CliDeps } from '../cli/index.js';

const FIXTURE_VAULT = path.resolve(import.meta.dirname, 'fixtures/test-vault');
const MOCK_OUTPUT = '# Mira Shadowcloak\n\n**Role:** Spy\nA shadowy figure.';

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

function makeOutput(): { stream: NodeJS.WriteStream; captured: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      chunks.push(chunk.toString());
      cb();
    },
  }) as unknown as NodeJS.WriteStream;
  return { stream, captured: () => chunks.join('') };
}

describe('processCommand', () => {
  let deps: CliDeps;
  let captured: () => string;

  beforeEach(() => {
    const out = makeOutput();
    captured = out.captured;
    deps = { model: makeMockModel(), vaultRoot: FIXTURE_VAULT, output: out.stream };
  });

  it('/generate happy path: returns non-null state, streams content, prints token report', async () => {
    const state = await processCommand('/generate npc name:Mira role:Spy', null, deps);

    expect(state).not.toBeNull();
    expect(captured()).toContain(MOCK_OUTPUT);
    expect(captured()).toContain('Tokens:');
  });

  it('continuation turn: session non-null, streams second response', async () => {
    const firstState = await processCommand('/generate npc name:Mira role:Spy', null, deps);

    const continueOut = makeOutput();
    const continueDeps: CliDeps = {
      // Session model is fixed at creation time; model in continueDeps is ignored
      vaultRoot: FIXTURE_VAULT,
      output: continueOut.stream,
    };
    const secondState = await processCommand('Give this NPC a weird habit.', firstState, continueDeps);

    expect(secondState).not.toBeNull();
    expect(secondState).toBe(firstState);
    expect(continueOut.captured()).toContain('Tokens:');
  });

  it('/generate resets state: second generate returns a fresh session', async () => {
    const firstState = await processCommand('/generate npc name:Mira role:Spy', null, deps);

    const secondOut = makeOutput();
    const secondDeps: CliDeps = {
      model: makeMockModel(),
      vaultRoot: FIXTURE_VAULT,
      output: secondOut.stream,
    };
    const secondState = await processCommand('/generate npc name:Aldric role:Guard', firstState, secondDeps);

    expect(secondState).not.toBeNull();
    expect(secondState).not.toBe(firstState);
    expect(secondOut.captured()).toContain(MOCK_OUTPUT);
  });

  it('free-form with no active conversation: state stays null, output contains hint', async () => {
    const state = await processCommand('Give this NPC a weird habit.', null, deps);

    expect(state).toBeNull();
    expect(captured()).toContain('No active conversation');
  });

  it('unknown slash command: state unchanged, output contains error hint', async () => {
    const prevState = await processCommand('/generate npc name:Mira role:Spy', null, deps);
    const state = await processCommand('/unknown', prevState, deps);

    expect(state).toBe(prevState);
    expect(captured()).toContain('Unknown command');
  });

  it('template not found: output contains error, state stays null', async () => {
    const state = await processCommand('/generate ghost name:Banshee role:Haunt', null, deps);

    expect(state).toBeNull();
    expect(captured()).toContain('Error:');
  });
});
