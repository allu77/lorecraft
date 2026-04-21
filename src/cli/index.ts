import 'dotenv/config';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { generateContent, continueContent } from '../agent/generation-loop.js';
import type { ConversationContext } from '../agent/generation-loop.js';
import { initLogger, setVerbose, getLogger } from '../utils/logger.js';

/** Injected dependencies for testing (replaces env vars and real model). */
export type CliDeps = {
  model?: LanguageModel;
  vaultRoot?: string;
  output?: NodeJS.WriteStream;
};

const DELIMITER = '─'.repeat(60);

/**
 * Parses the argument string after `/generate` into a type + key:value inputs map.
 * Handles quoted values (`name:"Mira Shadowcloak"`).
 *
 * @param line - Argument string, e.g. `npc name:"Mira" role:Spy`
 * @returns `{ type, inputs }` parsed from the line.
 */
export function parseGenerateCommand(line: string): { type: string; inputs: Record<string, string> } {
  const trimmed = line.trim();
  // Tokenise: split on whitespace but preserve quoted values
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
 * Processes a single line of CLI input against the current state.
 * Returns updated state. Pure enough to call directly in tests.
 *
 * @param line  - Raw input line from the GM (e.g. "/generate npc name:Mira").
 * @param state - Current conversation state (null if no active conversation).
 * @param deps  - Injected dependencies; omit in production to use env/defaults.
 * @returns Updated `ConversationContext | null` after processing the command.
 */
export async function processCommand(
  line: string,
  state: ConversationContext | null,
  deps?: CliDeps,
): Promise<ConversationContext | null> {
  const log = getLogger('cli');
  const out = deps?.output ?? (process.stdout as NodeJS.WriteStream);
  const write = (s: string) => out.write(s);

  const trimmed = line.trim();
  log.debug({ line: trimmed }, 'command received');

  if (!trimmed.startsWith('/')) {
    // Free-form continuation
    if (state === null) {
      write('No active conversation. Use /generate <type> [key:value…] to start one.\n');
      return null;
    }
    write(DELIMITER + '\n');
    log.info({}, 'continuation started');
    const result = await continueContent({
      conversation: state,
      userMessage: trimmed,
      onChunk: (chunk) => write(chunk),
      model: deps?.model,
    });
    write('\n' + DELIMITER + '\n');
    write(
      `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out / ${result.usage.totalTokens} total\n`,
    );
    return result.conversation;
  }

  const spaceIdx = trimmed.indexOf(' ');
  const command = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  if (command === '/help') {
    write(
      [
        'Commands:',
        '  /generate <type> [key:value…]  Generate new content',
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

  if (command === '/generate') {
    const { type, inputs } = parseGenerateCommand(args);
    const vaultRoot = deps?.vaultRoot ?? process.env['VAULT_ROOT'] ?? '';
    const templatePath = path.join(vaultRoot, '_templates', `${type}.md`);

    log.info({ type, inputKeys: Object.keys(inputs) }, 'generation started');
    try {
      write(DELIMITER + '\n');
      const result = await generateContent({
        vaultRoot,
        templatePath,
        inputs,
        onChunk: (chunk) => write(chunk),
        model: deps?.model,
      });
      write('\n' + DELIMITER + '\n');
      write(
        `Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out / ${result.usage.totalTokens} total\n`,
      );
      log.info(
        { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
        'generation finished',
      );
      return result.conversation;
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

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let state: ConversationContext | null = null;

  rl.on('line', async (line) => {
    rl.pause();
    state = await processCommand(line, state);
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
