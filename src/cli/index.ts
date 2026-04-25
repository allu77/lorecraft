import 'dotenv/config';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { GenerationSession } from '../agent/generation-loop.js';
import type { StreamCallbacks } from '../agent/generation-loop.js';
import { VaultIndex } from '../vault/vault-index.js';
import { VaultEmbeddings } from '../vault/vault-embeddings.js';
import { getEmbeddingProvider } from '../vault/embedding-provider.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';
import { initLogger, setVerbose, isVerbose, getLogger } from '../utils/logger.js';

/** Injected dependencies for testing (replaces env vars and real model). */
export type CliDeps = {
  model?: LanguageModel;
  vaultRoot?: string;
  output?: NodeJS.WriteStream;
  /** `null` means "no index loaded yet"; `undefined` falls back to no index. */
  vaultIndex?: VaultIndex | null;
  /** `null` means "no embedding index loaded yet"; `undefined` means not configured. */
  vaultEmbeddings?: VaultEmbeddings | null;
  /** Injected embedding provider; omit when EMBEDDING_PROVIDER env var is not set. */
  embeddingProvider?: EmbeddingProvider | null;
};

type ReasoningEventKind = 'start' | 'delta' | 'end';

const EnvSchema = z.object({
  VAULT_ROOT: z.string().default(''),
});

const DELIMITER = '─'.repeat(60);

/**
 * Parses the argument string after `/generate` into a type + key:value inputs map.
 * Handles quoted values (`name:"Mira Shadowcloak"`).
 *
 * @param line - Argument string, e.g. `npc name:"Mira" role:Spy`
 * @returns `{ type, inputs }` parsed from the line.
 */
export function parseGenerateCommand(line: string): {
  type: string;
  inputs: Record<string, string>;
} {
  const trimmed = line.trim();
  const tokens: string[] = [];
  const tokenPattern = /(\S+:"[^"]*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(trimmed)) !== null) {
    tokens.push(match[1]);
  }

  const [typeToken, ...rest] = tokens;
  const type = typeToken ?? '';
  const inputs: Record<string, string> = {};

  for (const token of rest) {
    const colonIndex = token.indexOf(':');
    if (colonIndex < 1) continue;
    const key = token.slice(0, colonIndex);
    let value = token.slice(colonIndex + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    inputs[key] = value;
  }

  return { type, inputs };
}

/**
 * Stateful CLI session. Holds vault context and the active GenerationSession.
 * Call processCommand() for each line of REPL input.
 */
export class CliSession {
  private output: NodeJS.WriteStream;
  private state: GenerationSession | null = null;
  private vaultRoot: string;
  private vaultIndex: VaultIndex | null | undefined;
  private vaultEmbeddings: VaultEmbeddings | null | undefined;
  private embeddingProvider: EmbeddingProvider | null | undefined;
  private model: LanguageModel | undefined;

  constructor(deps: CliDeps = {}) {
    const env = EnvSchema.parse(process.env);
    this.output = deps.output ?? (process.stdout as NodeJS.WriteStream);
    this.vaultRoot = deps.vaultRoot ?? env.VAULT_ROOT;
    this.vaultIndex = deps.vaultIndex;
    this.vaultEmbeddings = deps.vaultEmbeddings;
    this.embeddingProvider = deps.embeddingProvider ?? null;
    this.model = deps.model;
  }

  /** The active GenerationSession, or null if no session has been started. */
  get currentState(): GenerationSession | null {
    return this.state;
  }

  private write(text: string): void {
    this.output.write(text);
  }

  private writeReasoning(event: ReasoningEventKind, text?: string): void {
    if (event === 'start') this.output.write('\n[thinking]\n');
    else if (event === 'delta' && text) this.output.write(text);
    else if (event === 'end') this.output.write('\n[/thinking]\n');
  }

  private writeToolCall(toolName: string, input: unknown): void {
    this.output.write(`\n[tool: ${toolName}] ${JSON.stringify(input)}\n`);
  }

  private buildCallbacks(): StreamCallbacks {
    const verbose = isVerbose();
    return {
      onText: (chunk) => this.output.write(chunk),
      ...(verbose && {
        onReasoningStart: () => this.writeReasoning('start'),
        onReasoningDelta: (text) => this.writeReasoning('delta', text),
        onReasoningEnd: () => this.writeReasoning('end'),
        onToolCall: (name, input) => this.writeToolCall(name, input),
      }),
    };
  }

  private async handleContinuation(line: string): Promise<GenerationSession | null> {
    if (this.state === null) {
      this.write('No active conversation. Use /generate <type> [key:value…] to start one.\n');
      return null;
    }
    const logger = getLogger('cli');
    this.write(DELIMITER + '\n');
    logger.info({}, 'continuation started');
    const result = await this.state.continue(line, this.buildCallbacks());
    this.write('\n' + DELIMITER + '\n');
    this.write(
      `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} output / ${result.usage.totalTokens} total\n`,
    );
    return this.state;
  }

  private handleHelp(): void {
    this.write(
      [
        'Commands:',
        '  /generate <type> [key:value…]  Generate new content',
        '  /index status                  Show index stats (note count, freshness)',
        '  /index refresh                 Incrementally re-index changed vault files',
        '  /index rebuild                 Build a fresh index over all vault files',
        '  /verbose on|off                Toggle verbose logging to stdout',
        '  /help                           Show this help',
        '  /exit                           Quit',
        '  <free text>                     Continue the current conversation',
        '',
      ].join('\n'),
    );
  }

  private handleExit(): void {
    getLogger('cli').info({}, 'session ended');
    this.write('Goodbye!\n');
  }

  private handleVerbose(commandArgs: string): void {
    const verboseArg = commandArgs.trim();
    if (verboseArg !== 'on' && verboseArg !== 'off') {
      this.write('Usage: /verbose on|off\n');
      return;
    }
    const enabled = verboseArg === 'on';
    setVerbose(enabled);
    this.write(`Verbose logging ${enabled ? 'enabled' : 'disabled'}.\n`);
    getLogger('cli').info({ verbose: enabled }, 'verbose toggled');
  }

  private async handleIndexRebuild(): Promise<void> {
    const logger = getLogger('cli');
    logger.info({}, 'rebuilding index');
    const builtIndex = await VaultIndex.build(this.vaultRoot);
    this.vaultIndex = builtIndex;
    this.write(`BM25 index built: ${builtIndex.stats.noteCount} notes indexed.\n`);
    if (this.embeddingProvider) {
      const builtEmbeddings = await VaultEmbeddings.build(this.vaultRoot, this.embeddingProvider);
      this.vaultEmbeddings = builtEmbeddings;
      this.write(
        `Embedding index built: ${builtEmbeddings.stats.noteCount} notes embedded (${this.embeddingProvider.modelId}).\n`,
      );
    }
    logger.info({ noteCount: builtIndex.stats.noteCount }, 'index rebuilt');
  }

  private async handleIndexStatus(): Promise<void> {
    const vaultIndex = this.vaultIndex;
    if (!vaultIndex) {
      this.write('No index loaded. Run /index rebuild first.\n');
      return;
    }
    const stale = await vaultIndex.isStale(this.vaultRoot);
    const timestamp = vaultIndex.stats.indexedAt.toISOString();
    this.write(
      `BM25 index: ${vaultIndex.stats.noteCount} notes, indexed at ${timestamp} — ${stale ? 'stale' : 'fresh'}.\n`,
    );
    const vaultEmbeddings = this.vaultEmbeddings;
    if (vaultEmbeddings) {
      const embStale = await vaultEmbeddings.isStale(
        this.vaultRoot,
        this.embeddingProvider ?? undefined,
      );
      const embTimestamp = vaultEmbeddings.stats.indexedAt.toISOString();
      this.write(
        `Embedding index: ${vaultEmbeddings.stats.noteCount} notes, model ${vaultEmbeddings.stats.modelId}, indexed at ${embTimestamp} — ${embStale ? 'stale' : 'fresh'}.\n`,
      );
    } else if (this.embeddingProvider) {
      this.write('Embedding index: not built yet — run /index rebuild.\n');
    }
  }

  private async handleIndexRefresh(): Promise<void> {
    const vaultIndex = this.vaultIndex;
    if (!vaultIndex) {
      this.write('No index loaded. Run /index rebuild first.\n');
      return;
    }
    const logger = getLogger('cli');
    logger.info({}, 'refreshing index');
    const counts = await vaultIndex.update(this.vaultRoot);
    this.write(
      `BM25 index refreshed: ${counts.added} added, ${counts.updated} updated, ${counts.removed} removed.\n`,
    );
    const vaultEmbeddings = this.vaultEmbeddings;
    const embeddingProvider = this.embeddingProvider;
    if (vaultEmbeddings && embeddingProvider) {
      const embCounts = await vaultEmbeddings.update(this.vaultRoot, embeddingProvider);
      this.write(
        `Embedding index refreshed: ${embCounts.added} added, ${embCounts.updated} updated, ${embCounts.removed} removed.\n`,
      );
    }
    logger.info(counts, 'index refreshed');
  }

  private async handleIndex(commandArgs: string): Promise<void> {
    const subcommand = commandArgs.trim();
    if (subcommand === 'rebuild') {
      await this.handleIndexRebuild();
      return;
    }
    if (subcommand === 'status') {
      await this.handleIndexStatus();
      return;
    }
    if (subcommand === 'refresh') {
      await this.handleIndexRefresh();
      return;
    }
    this.write('Usage: /index status | refresh | rebuild\n');
  }

  private async warnIfStaleIndexes(): Promise<void> {
    const vaultIndex = this.vaultIndex;
    if (vaultIndex) {
      const stale = await vaultIndex.isStale(this.vaultRoot);
      if (stale)
        this.write(
          '[warning] BM25 index is stale — run /index refresh to include recent vault changes.\n',
        );
    } else if (this.vaultIndex === null) {
      this.write('[info] No keyword index — run /index rebuild to enable keyword search.\n');
    }
    const embeddingProvider = this.embeddingProvider;
    if (embeddingProvider) {
      const vaultEmbeddings = this.vaultEmbeddings;
      if (!vaultEmbeddings) {
        this.write('[info] No embedding index — run /index rebuild to enable semantic search.\n');
      } else {
        const embStale = await vaultEmbeddings.isStale(this.vaultRoot, embeddingProvider);
        if (embStale)
          this.write(
            '[warning] Embedding index is stale — run /index refresh to include recent vault changes.\n',
          );
      }
    }
  }

  private async executeGenerate(
    type: string,
    inputs: Record<string, string>,
  ): Promise<GenerationSession> {
    const templatePath = path.join(this.vaultRoot, '_templates', `${type}.md`);
    const session = await GenerationSession.create({
      vaultRoot: this.vaultRoot,
      templatePath,
      inputs,
      model: this.model,
      vaultIndex: this.vaultIndex ?? undefined,
      vaultEmbeddings: this.vaultEmbeddings ?? undefined,
      embeddingProvider: this.embeddingProvider ?? undefined,
    });
    this.write(DELIMITER + '\n');
    const result = await session.generate(this.buildCallbacks());
    this.write('\n' + DELIMITER + '\n');
    this.write(
      `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} output / ${result.usage.totalTokens} total\n`,
    );
    getLogger('cli').info(
      { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      'generation finished',
    );
    return session;
  }

  private async handleGenerate(commandArgs: string): Promise<GenerationSession | null> {
    const logger = getLogger('cli');
    const { type, inputs } = parseGenerateCommand(commandArgs);
    logger.info({ type, inputKeys: Object.keys(inputs) }, 'generation started');
    await this.warnIfStaleIndexes();
    try {
      return await this.executeGenerate(type, inputs);
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ err: error.message, type }, 'generation failed');
        this.write(`Error: ${error.message}\n`);
      } else {
        this.write(`Error: ${String(error)}\n`);
      }
      return null;
    }
  }

  /**
   * Processes a single line of REPL input, updating session state as needed.
   *
   * @param line - Raw input line from the GM (e.g. "/generate npc name:Mira").
   * @returns The active `GenerationSession`, or null if none is running.
   */
  async processCommand(line: string): Promise<GenerationSession | null> {
    const logger = getLogger('cli');
    const trimmed = line.trim();
    logger.debug({ line: trimmed }, 'command received');
    if (!trimmed.startsWith('/')) {
      this.state = await this.handleContinuation(trimmed);
      return this.state;
    }
    const spaceIndex = trimmed.indexOf(' ');
    const command = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    const commandArgs = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1);
    if (command === '/help') {
      this.handleHelp();
      return this.state;
    }
    if (command === '/exit') {
      this.handleExit();
      return this.state;
    }
    if (command === '/verbose') {
      this.handleVerbose(commandArgs);
      return this.state;
    }
    if (command === '/index') {
      await this.handleIndex(commandArgs);
      return this.state;
    }
    if (command === '/generate') {
      this.state = await this.handleGenerate(commandArgs);
      return this.state;
    }
    this.write(`Unknown command: ${command}. Type /help for available commands.\n`);
    return this.state;
  }
}

/**
 * Starts the interactive readline REPL. Reads VAULT_ROOT from env.
 * Runs until the GM types /exit or sends EOF.
 */
export async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  initLogger({ verbose });
  const logger = getLogger('cli');

  const env = EnvSchema.parse(process.env);
  const vaultRoot = env.VAULT_ROOT;
  const vaultIndex: VaultIndex | null = await VaultIndex.load(vaultRoot);
  if (vaultIndex) logger.info({ noteCount: vaultIndex.stats.noteCount }, 'keyword index loaded');

  const embeddingProvider: EmbeddingProvider | null = getEmbeddingProvider();
  const vaultEmbeddings: VaultEmbeddings | null = embeddingProvider
    ? await VaultEmbeddings.load(vaultRoot)
    : null;
  if (vaultEmbeddings) {
    logger.info(
      { noteCount: vaultEmbeddings.stats.noteCount, modelId: vaultEmbeddings.stats.modelId },
      'embedding index loaded',
    );
  }

  const session = new CliSession({ vaultRoot, vaultIndex, vaultEmbeddings, embeddingProvider });
  const readlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  readlineInterface.prompt();

  readlineInterface.on('line', async (line) => {
    readlineInterface.pause();
    await session.processCommand(line);
    if (line.trim() === '/exit') {
      readlineInterface.close();
      return;
    }
    readlineInterface.prompt();
    readlineInterface.resume();
  });

  await new Promise<void>((resolve) => readlineInterface.on('close', resolve));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal: ${message}\n`);
    process.exit(1);
  });
}
