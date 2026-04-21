import pino, { type Logger as PinoLogger } from 'pino';
import PinoPretty from 'pino-pretty';
import { Writable } from 'node:stream';
import path from 'node:path';
import { z } from 'zod';

/** Structured-logger interface; a subset of pino.Logger. */
export type Logger = Pick<PinoLogger, 'debug' | 'info' | 'warn' | 'error' | 'child'>;

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']);
type LogLevel = z.infer<typeof LogLevelSchema>;

/** Options for {@link initLogger}. */
export type InitLoggerOptions = {
  /** Minimum log level. Defaults to `LOG_LEVEL` env var, then `'info'`. */
  level?: LogLevel;
  /** When `true`, also write pretty-formatted logs to stdout. */
  verbose?: boolean;
  /** JSON log file path. Defaults to `LOG_FILE` env var, then `lorecraft.log` in cwd. */
  logFile?: string;
  /** Suppress all output. Pass `true` in Vitest setup files. */
  silent?: boolean;
};

/** Forwards bytes to process.stdout only when enabled. Used to toggle verbose logging at runtime. */
class GatedWritable extends Writable {
  private enabled: boolean;

  constructor(initiallyEnabled: boolean) {
    super();
    this.enabled = initiallyEnabled;
  }

  /** Enable or disable stdout forwarding. */
  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (err?: Error | null) => void,
  ): void {
    if (this.enabled) process.stdout.write(chunk as Buffer | string);
    callback();
  }
}

let _logger: PinoLogger = pino({ level: 'silent' });
let _gate: GatedWritable | null = null;
let _exitHandlerRegistered = false;

/**
 * Initialises the root logger. Call once at process startup (in `main()`) before any
 * module calls {@link getLogger}. Calling it again replaces the active logger in place.
 *
 * @param opts - Logger configuration.
 */
export function initLogger(opts: InitLoggerOptions = {}): void {
  if (opts.silent) {
    _logger = pino({ level: 'silent' });
    _gate = null;
    return;
  }

  const envLevel = process.env['LOG_LEVEL'];
  const parsed = LogLevelSchema.safeParse(envLevel);
  const level: LogLevel = opts.level ?? (parsed.success ? parsed.data : 'info');
  const logFile =
    opts.logFile ?? process.env['LOG_FILE'] ?? path.join(process.cwd(), 'lorecraft.log');

  _gate = new GatedWritable(opts.verbose ?? false);

  const prettyStream = PinoPretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname',
    destination: _gate,
  });

  _logger = pino(
    { level },
    pino.multistream([
      { stream: pino.destination(logFile), level },
      { stream: prettyStream, level },
    ]),
  );

  if (!_exitHandlerRegistered) {
    process.once('exit', () => {
      _logger.flush();
    });
    _exitHandlerRegistered = true;
  }
}

/**
 * Enables or disables stdout pretty-printing at runtime.
 * Invoked by the `/verbose on|off` slash command.
 *
 * @param enabled - `true` to show logs on stdout.
 */
export function setVerbose(enabled: boolean): void {
  _gate?.setEnabled(enabled);
}

/**
 * Returns a child logger bound to the given module name.
 * Every log entry includes `{ "module": "<name>" }`.
 * Call inside functions or constructors — not at module top level — to ensure
 * {@link initLogger} has already run.
 *
 * @param module - Module identifier, e.g. `'vault'`, `'agent'`, `'cli'`.
 * @returns A {@link Logger} for the named module.
 */
export function getLogger(module: string): Logger {
  return _logger.child({ module });
}
