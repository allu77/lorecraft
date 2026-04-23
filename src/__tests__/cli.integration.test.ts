import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { processCommand } from '../cli/index.js';
import type { CliDeps } from '../cli/index.js';
import { VaultIndex } from '../vault/vault-index.js';

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
    deps = {
      model: makeMockModel(),
      vaultRoot: FIXTURE_VAULT,
      output: out.stream,
    };
  });

  it('/generate happy path: returns non-null state, streams content, prints token report', async () => {
    const state = await processCommand(
      '/generate npc name:Mira role:Spy',
      null,
      deps,
    );

    expect(state).not.toBeNull();
    expect(captured()).toContain(MOCK_OUTPUT);
    expect(captured()).toContain('Tokens:');
  });

  it('continuation turn: session non-null, streams second response', async () => {
    const firstState = await processCommand(
      '/generate npc name:Mira role:Spy',
      null,
      deps,
    );

    const continueOut = makeOutput();
    const continueDeps: CliDeps = {
      // Session model is fixed at creation time; model in continueDeps is ignored
      vaultRoot: FIXTURE_VAULT,
      output: continueOut.stream,
    };
    const secondState = await processCommand(
      'Give this NPC a weird habit.',
      firstState,
      continueDeps,
    );

    expect(secondState).not.toBeNull();
    expect(secondState).toBe(firstState);
    expect(continueOut.captured()).toContain('Tokens:');
  });

  it('/generate resets state: second generate returns a fresh session', async () => {
    const firstState = await processCommand(
      '/generate npc name:Mira role:Spy',
      null,
      deps,
    );

    const secondOut = makeOutput();
    const secondDeps: CliDeps = {
      model: makeMockModel(),
      vaultRoot: FIXTURE_VAULT,
      output: secondOut.stream,
    };
    const secondState = await processCommand(
      '/generate npc name:Aldric role:Guard',
      firstState,
      secondDeps,
    );

    expect(secondState).not.toBeNull();
    expect(secondState).not.toBe(firstState);
    expect(secondOut.captured()).toContain(MOCK_OUTPUT);
  });

  it('free-form with no active conversation: state stays null, output contains hint', async () => {
    const state = await processCommand(
      'Give this NPC a weird habit.',
      null,
      deps,
    );

    expect(state).toBeNull();
    expect(captured()).toContain('No active conversation');
  });

  it('unknown slash command: state unchanged, output contains error hint', async () => {
    const prevState = await processCommand(
      '/generate npc name:Mira role:Spy',
      null,
      deps,
    );
    const state = await processCommand('/unknown', prevState, deps);

    expect(state).toBe(prevState);
    expect(captured()).toContain('Unknown command');
  });

  it('template not found: output contains error, state stays null', async () => {
    const state = await processCommand(
      '/generate ghost name:Banshee role:Haunt',
      null,
      deps,
    );

    expect(state).toBeNull();
    expect(captured()).toContain('Error:');
  });
});

describe('/index commands', () => {
  let captured: () => string;
  let baseDeps: Omit<CliDeps, 'vaultIndex'>;
  const LORECRAFT_DIR = path.join(FIXTURE_VAULT, '.lorecraft');

  beforeEach(() => {
    const out = makeOutput();
    captured = out.captured;
    baseDeps = {
      vaultRoot: FIXTURE_VAULT,
      output: out.stream,
    };
  });

  afterEach(async () => {
    await fs.rm(LORECRAFT_DIR, { recursive: true, force: true });
  });

  it('/index rebuild: prints note count', async () => {
    await processCommand('/index rebuild', null, {
      ...baseDeps,
      vaultIndex: null,
    });
    expect(captured()).toMatch(/Index built: \d+ notes indexed/);
  });

  it('/index status when fresh: prints note count and "fresh"', async () => {
    const index = await VaultIndex.build(FIXTURE_VAULT);
    await processCommand('/index status', null, {
      ...baseDeps,
      vaultIndex: index,
    });
    expect(captured()).toContain('notes');
    expect(captured()).toContain('fresh');
  });

  it('/index status when stale: prints "stale"', async () => {
    // Build against a slightly different note count by wrapping with a mock isStale
    const index = await VaultIndex.build(FIXTURE_VAULT);
    // Patch isStale to simulate a stale index without touching the filesystem
    const staleIndex = Object.create(index) as VaultIndex;
    Object.defineProperty(staleIndex, 'isStale', { value: async () => true });

    await processCommand('/index status', null, {
      ...baseDeps,
      vaultIndex: staleIndex,
    });
    expect(captured()).toContain('stale');
  });

  it('/index refresh: prints added/updated/removed counts', async () => {
    const index = await VaultIndex.build(FIXTURE_VAULT);
    await processCommand('/index refresh', null, {
      ...baseDeps,
      vaultIndex: index,
    });
    expect(captured()).toMatch(/\d+ added, \d+ updated, \d+ removed/);
  });

  it('/index status with no index: prints error pointing to /index rebuild', async () => {
    await processCommand('/index status', null, {
      ...baseDeps,
      vaultIndex: null,
    });
    expect(captured()).toContain('No index loaded');
  });

  it('/index refresh with no index: prints error pointing to /index rebuild', async () => {
    await processCommand('/index refresh', null, {
      ...baseDeps,
      vaultIndex: null,
    });
    expect(captured()).toContain('No index loaded');
  });

  it('/generate with stale index: output contains stale warning', async () => {
    const model = makeMockModel();
    const index = await VaultIndex.build(FIXTURE_VAULT);
    const staleIndex = Object.create(index) as VaultIndex;
    Object.defineProperty(staleIndex, 'isStale', { value: async () => true });

    const out = makeOutput();
    await processCommand('/generate npc name:Mira role:Spy', null, {
      ...baseDeps,
      model,
      output: out.stream,
      vaultIndex: staleIndex,
    });
    expect(out.captured()).toContain('[warning] Index is stale');
  });

  it('/generate with no index (null): output contains info message', async () => {
    const model = makeMockModel();
    const out = makeOutput();
    await processCommand('/generate npc name:Mira role:Spy', null, {
      ...baseDeps,
      model,
      output: out.stream,
      vaultIndex: null,
    });
    expect(out.captured()).toContain('[info] No keyword index');
  });
});
