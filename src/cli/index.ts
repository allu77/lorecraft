import 'dotenv/config';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { GenerationSession } from '../agent/generation-loop.js';
import { VaultIndex } from '../vault/vault-index.js';
import { initLogger, setVerbose, getLogger } from '../utils/logger.js';

/** Injected dependencies for testing (replaces env vars and real model). */
export type CliDeps = {
  model?: LanguageModel;
  vaultRoot?: string;
  output?: NodeJS.WriteStream;
  /** `null` means "no index loaded yet"; `undefined` falls back to no index. */
  vaultIndex?: VaultIndex | null;
};

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
  const re = /(\S+:"[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    tokens.push(m[1]);
  }

  const [typeToken, ...rest] = tokens;
  const type = typeToken ?? '';
  const inputs: Record<string, string> = {};

  for (const token of rest) {
    const colon = token.indexOf(':');
    if (colon < 1) continue;
    const key = token.slice(0, colon);
    let value = token.slice(colon + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    inputs[key] = value;
  }

  return { type, inputs };
}

/**
 * Processes a single line of CLI input against the current session state.
 * Returns updated state. Pure enough to call directly in tests.
 *
 * @param line  - Raw input line from the GM (e.g. "/generate npc name:Mira").
 * @param state - Current session (null if no active session).
 * @param deps  - Injected dependencies; omit in production to use env/defaults.
 * @returns Updated `GenerationSession | null` after processing the command.
 */
export async function processCommand(
  line: string,
  state: GenerationSession | null,
  deps?: CliDeps,
): Promise<GenerationSession | null> {
  const log = getLogger('cli');
  const out = deps?.output ?? (process.stdout as NodeJS.WriteStream);
  const write = (s: string) => out.write(s);

  const trimmed = line.trim();
  log.debug({ line: trimmed }, 'command received');

  if (!trimmed.startsWith('/')) {
    if (state === null) {
      write(
        'No active conversation. Use /generate <type> [key:value…] to start one.\n',
      );
      return null;
    }
    write(DELIMITER + '\n');
    log.info({}, 'continuation started');
    const result = await state.continue(trimmed, (chunk) => write(chunk));
    write('\n' + DELIMITER + '\n');
    write(
      `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out / ${result.usage.totalTokens} total\n`,
    );
    return state;
  }

  const spaceIdx = trimmed.indexOf(' ');
  const command = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  if (command === '/help') {
    write(
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
    return state;
  }

  if (command === '/exit') {
    log.info({}, 'session ended');
    write('Goodbye!\n');
    return state;
  }

  if (command === '/verbose') {
    const arg = args.trim();
    if (arg !== 'on' && arg !== 'off') {
      write('Usage: /verbose on|off\n');
      return state;
    }
    const enabled = arg === 'on';
    setVerbose(enabled);
    write(`Verbose logging ${enabled ? 'enabled' : 'disabled'}.\n`);
    log.info({ verbose: enabled }, 'verbose toggled');
    return state;
  }

  if (command === '/index') {
    const vaultRoot = deps?.vaultRoot ?? process.env['VAULT_ROOT'] ?? '';
    const subcommand = args.trim();
    const vaultIndex = deps?.vaultIndex ?? null;

    if (subcommand === 'rebuild') {
      log.info({}, 'rebuilding index');
      const built = await VaultIndex.build(vaultRoot);
      write(`Index built: ${built.stats.noteCount} notes indexed.\n`);
      log.info({ noteCount: built.stats.noteCount }, 'index rebuilt');
      return state;
    }

    if (vaultIndex === null) {
      write('No index loaded. Run /index rebuild first.\n');
      return state;
    }

    if (subcommand === 'status') {
      const stale = await vaultIndex.isStale(vaultRoot);
      const ts = vaultIndex.stats.indexedAt.toISOString();
      write(
        `Index: ${vaultIndex.stats.noteCount} notes, indexed at ${ts} — ${stale ? 'stale' : 'fresh'}.\n`,
      );
      return state;
    }

    if (subcommand === 'refresh') {
      log.info({}, 'refreshing index');
      const counts = await vaultIndex.update(vaultRoot);
      write(
        `Index refreshed: ${counts.added} added, ${counts.updated} updated, ${counts.removed} removed.\n`,
      );
      log.info(counts, 'index refreshed');
      return state;
    }

    write('Usage: /index status | refresh | rebuild\n');
    return state;
  }

  if (command === '/generate') {
    const { type, inputs } = parseGenerateCommand(args);
    const vaultRoot = deps?.vaultRoot ?? process.env['VAULT_ROOT'] ?? '';
    const templatePath = path.join(vaultRoot, '_templates', `${type}.md`);
    // Preserve null (no index built) vs undefined (deps not provided)
    const rawVaultIndex = deps?.vaultIndex;
    const vaultIndex = rawVaultIndex ?? undefined;

    if (vaultIndex) {
      const stale = await vaultIndex.isStale(vaultRoot);
      if (stale) {
        write(
          '[warning] Index is stale — run /index refresh to include recent vault changes.\n',
        );
      }
    } else if (rawVaultIndex === null) {
      write(
        '[info] No keyword index — run /index rebuild to enable keyword search.\n',
      );
    }

    log.info({ type, inputKeys: Object.keys(inputs) }, 'generation started');
    try {
      const session = await GenerationSession.create({
        vaultRoot,
        templatePath,
        inputs,
        model: deps?.model,
        vaultIndex,
      });
      write(DELIMITER + '\n');
      const result = await session.generate((chunk) => write(chunk));
      write('\n' + DELIMITER + '\n');
      write(
        `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out / ${result.usage.totalTokens} total\n`,
      );
      log.info(
        {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
        'generation finished',
      );
      return session;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error({ err: msg, type }, 'generation failed');
      write(`Error: ${msg}\n`);
      return null;
    }
  }

  write(`Unknown command: ${command}. Type /help for available commands.\n`);
  return state;
}

/**
 * Starts the interactive readline REPL. Reads VAULT_ROOT from env.
 * Runs until the GM types /exit or sends EOF.
 */
export async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  initLogger({ verbose });
  const log = getLogger('cli');

  const vaultRoot = process.env['VAULT_ROOT'] ?? '';
  let vaultIndex: VaultIndex | null = await VaultIndex.load(vaultRoot);
  if (vaultIndex) {
    log.info({ noteCount: vaultIndex.stats.noteCount }, 'keyword index loaded');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let state: GenerationSession | null = null;

  rl.on('line', async (line) => {
    rl.pause();

    // /index rebuild is handled here so it can update the mutable vaultIndex
    if (line.trim().startsWith('/index rebuild')) {
      try {
        vaultIndex = await VaultIndex.build(vaultRoot);
        process.stdout.write(
          `Index built: ${vaultIndex.stats.noteCount} notes indexed.\n`,
        );
        log.info({ noteCount: vaultIndex.stats.noteCount }, 'index rebuilt');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`Error: ${msg}\n`);
      }
      rl.resume();
      return;
    }

    state = await processCommand(line, state, { vaultRoot, vaultIndex });
    if (line.trim() === '/exit') {
      rl.close();
      return;
    }
    rl.resume();
  });

  await new Promise<void>((resolve) => rl.on('close', resolve));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal: ${msg}\n`);
    process.exit(1);
  });
}
