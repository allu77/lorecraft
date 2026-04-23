import path from 'path';
import { ToolLoopAgent, stepCountIs } from 'ai';
import type { ModelMessage, LanguageModel, ToolSet } from 'ai';
import { VaultReader } from '../vault/vault-reader.js';
import { TemplateParser } from '../vault/template-parser.js';
import { ContextBudget } from './context-budget.js';
import { buildPrompt } from './prompt-builder.js';
import type { ContextNote } from './prompt-builder.js';
import { getModel } from '../llm/provider.js';
import { getLogger } from '../utils/logger.js';
import type { VaultIndex } from '../vault/vault-index.js';
import { createWikilinkTool, createKeywordSearchTool } from './tools.js';

/** Token counts as reported by the Vercel AI SDK after a generation call. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Options for creating a generation session. */
export type GenerateOptions = {
  /** Absolute path to the vault root directory. */
  vaultRoot: string;
  /** Absolute path to the Obsidian template file (`.md`). */
  templatePath: string;
  /**
   * Caller-supplied input values, e.g. `{ name: "Mira", faction: "Thieves Guild" }`.
   * Values may be plain note names or wikilink strings (`[[Note Name]]`).
   */
  inputs: Record<string, string>;
  /**
   * Language model to use. Defaults to `getModel()` from `src/llm/provider.ts`.
   * Inject a mock here in tests to avoid real Bedrock calls.
   */
  model?: LanguageModel;
  /**
   * Token ceiling for context assembly. Defaults to `CONTEXT_BUDGET_TOKENS`
   * env var, then 8 000 tokens.
   */
  budgetTokens?: number;
  /**
   * Maximum number of tool-call steps before the LLM must produce final text.
   * Each step is one model call (text or tool call). Default: 10.
   */
  maxToolSteps?: number;
  /**
   * Loaded `VaultIndex` to enable keyword search during generation. When
   * provided, the agent can call `keyword_search` to surface notes that are
   * not reachable via wikilinks. Omit to run without keyword search.
   */
  vaultIndex?: VaultIndex;
};

/**
 * Optional callbacks for streaming events from `GenerationSession.generate()` or
 * `GenerationSession.continue()`. All fields are optional — omit any you don't need.
 */
export type StreamCallbacks = {
  /** Called with each text chunk as it arrives. */
  onText?: (chunk: string) => void;
  /** Called once when a reasoning (thinking) block begins. */
  onReasoningStart?: () => void;
  /** Called with each incremental reasoning text delta. */
  onReasoningDelta?: (delta: string) => void;
  /** Called once when a reasoning block ends. */
  onReasoningEnd?: () => void;
  /** Called once per tool invocation with the tool name and its input params. */
  onToolCall?: (toolName: string, input: unknown) => void;
};

/** Result returned by `GenerationSession.generate()` or `GenerationSession.continue()`. */
export type GenerateResult = {
  /** Full generated markdown text. */
  content: string;
  /** Token counts from the Vercel AI SDK usage report. */
  usage: TokenUsage;
};

const CAMPAIGN_STYLE_NOTE = 'Campaign Style';
const DEFAULT_BUDGET_TOKENS = 8_000;

/**
 * Encapsulates a single GM generation session: vault pipeline, ToolLoopAgent
 * instance, and accumulated message history. One session per `/generate` command.
 *
 * @example
 *   const session = await GenerationSession.create(options);
 *   const first = await session.generate(onChunk);
 *   const refined = await session.continue('make her more mysterious', onChunk);
 */
type SessionTools = {
  wikilink_resolve: ReturnType<typeof createWikilinkTool>;
  keyword_search?: ReturnType<typeof createKeywordSearchTool>;
} & ToolSet;

export class GenerationSession {
  private readonly agent: ToolLoopAgent<never, SessionTools>;
  private readonly initialPrompt: string;
  private messages: ModelMessage[] = [];

  private constructor(
    agent: ToolLoopAgent<never, SessionTools>,
    initialPrompt: string,
  ) {
    this.agent = agent;
    this.initialPrompt = initialPrompt;
  }

  /**
   * Runs the vault pipeline (template parse, context pre-fetch, prompt assembly)
   * and creates the ToolLoopAgent. Does not call the LLM.
   *
   * @param options - Session configuration including vault root and template path.
   * @returns A ready-to-use `GenerationSession`.
   * @throws If any required template input is missing from `options.inputs`.
   */
  static async create(options: GenerateOptions): Promise<GenerationSession> {
    const log = getLogger('agent');
    const { vaultRoot, templatePath, inputs } = options;
    const model = options.model ?? getModel();

    log.info({ model: process.env['MODEL_ID'] ?? 'default' }, 'model resolved');

    const reader = new VaultReader(vaultRoot);
    const parser = new TemplateParser();

    const templateContent = await reader.readNote(templatePath);
    const {
      agentPrompt,
      inputs: templateInputs,
      bodyMarkdown,
    } = parser.parse(templateContent);
    log.debug(
      { templatePath, inputCount: templateInputs.length },
      'template loaded',
    );

    const missing = templateInputs
      .filter((i) => i.required && !(i.name in inputs))
      .map((i) => i.name);
    if (missing.length > 0) {
      throw new Error(`Missing required inputs: ${missing.join(', ')}`);
    }

    const campaignStylePath = await reader.findNote(CAMPAIGN_STYLE_NOTE);
    const campaignStyle = campaignStylePath
      ? await reader.readNote(campaignStylePath)
      : '';

    const ceiling =
      options.budgetTokens ??
      (process.env['CONTEXT_BUDGET_TOKENS']
        ? Number(process.env['CONTEXT_BUDGET_TOKENS'])
        : DEFAULT_BUDGET_TOKENS);
    const budget = new ContextBudget(ceiling);
    const campaignStyleIncluded = !!(
      campaignStyle && budget.fits(campaignStyle)
    );
    if (campaignStyleIncluded) {
      budget.add(campaignStyle);
    }
    log.debug({ ceiling, campaignStyleIncluded }, 'context budget initialised');

    const contextNotes: ContextNote[] = [];
    const seen = new Set<string>();
    const candidates = [
      ...extractWikilinks(bodyMarkdown),
      ...Object.values(inputs),
    ];

    for (const candidate of candidates) {
      const notePath =
        (await reader.resolveWikilink(candidate)) ??
        (await reader.findNote(candidate));
      if (!notePath || seen.has(notePath)) continue;
      seen.add(notePath);

      const content = await reader.readNote(notePath);
      const noteName = path.basename(notePath, '.md');
      if (budget.fits(content)) {
        budget.add(content);
        contextNotes.push({ name: noteName, content });
        log.debug(
          {
            note: noteName,
            used: budget.tokensUsed,
            remaining: budget.remaining,
          },
          'note included',
        );
      } else {
        log.debug(
          { note: noteName, reason: 'budget exceeded' },
          'note skipped',
        );
      }
    }

    const { system, prompt } = buildPrompt({
      campaignStyle,
      templateInstructions: agentPrompt,
      templateBody: bodyMarkdown,
      contextNotes,
      userInputs: inputs,
    });
    log.info({ contextNoteCount: contextNotes.length }, 'prompt assembled');

    const tools: SessionTools = {
      wikilink_resolve: createWikilinkTool(reader, budget),
      ...(options.vaultIndex
        ? {
            keyword_search: createKeywordSearchTool(options.vaultIndex, budget),
          }
        : {}),
    };

    const agent = new ToolLoopAgent({
      model,
      instructions: system,
      tools,
      stopWhen: stepCountIs(options.maxToolSteps ?? 10),
    });

    return new GenerationSession(agent, prompt);
  }

  /**
   * Sends the assembled prompt as the first user message and streams the response.
   * Call once per session after `create()`.
   *
   * @param callbacks - Optional stream event callbacks (text, reasoning, tool calls).
   * @returns `GenerateResult` with the full content and cumulative token usage.
   */
  async generate(callbacks?: StreamCallbacks): Promise<GenerateResult> {
    const log = getLogger('agent');
    log.debug({ prompt: this.initialPrompt }, 'prompt sent');
    log.info({}, 'stream started');

    const streamResult = await this.agent.stream({
      prompt: this.initialPrompt,
    });
    const chunks: string[] = [];
    for await (const part of streamResult.fullStream) {
      switch (part.type) {
        case 'text-delta':
          chunks.push(part.text);
          callbacks?.onText?.(part.text);
          break;
        case 'reasoning-start':
          callbacks?.onReasoningStart?.();
          break;
        case 'reasoning-delta':
          callbacks?.onReasoningDelta?.(part.text);
          break;
        case 'reasoning-end':
          callbacks?.onReasoningEnd?.();
          break;
        case 'tool-call':
          callbacks?.onToolCall?.(part.toolName, part.input);
          break;
      }
    }

    const content = chunks.join('');
    const usage = await streamResult.totalUsage;
    const response = await streamResult.response;
    log.debug({ content }, 'response received');
    log.info(
      { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      'stream ended',
    );

    this.messages = [
      { role: 'user', content: this.initialPrompt },
      ...response.messages,
    ];

    return {
      content,
      usage: normalizeUsage(usage),
    };
  }

  /**
   * Sends a follow-up user message to the same ToolLoopAgent and streams the
   * response. Accumulates message history across calls.
   *
   * @param userMessage - The GM's free-form follow-up message.
   * @param callbacks - Optional stream event callbacks (text, reasoning, tool calls).
   * @returns `GenerateResult` with the new content and cumulative token usage.
   */
  async continue(
    userMessage: string,
    callbacks?: StreamCallbacks,
  ): Promise<GenerateResult> {
    const log = getLogger('agent');

    this.messages.push({ role: 'user', content: userMessage });

    log.debug(
      { userMessage, messageCount: this.messages.length },
      'continuation prompt sent',
    );
    log.info({}, 'continuation stream started');

    const streamResult = await this.agent.stream({ messages: this.messages });
    const chunks: string[] = [];
    for await (const part of streamResult.fullStream) {
      switch (part.type) {
        case 'text-delta':
          chunks.push(part.text);
          callbacks?.onText?.(part.text);
          break;
        case 'reasoning-start':
          callbacks?.onReasoningStart?.();
          break;
        case 'reasoning-delta':
          callbacks?.onReasoningDelta?.(part.text);
          break;
        case 'reasoning-end':
          callbacks?.onReasoningEnd?.();
          break;
        case 'tool-call':
          callbacks?.onToolCall?.(part.toolName, part.input);
          break;
      }
    }

    const content = chunks.join('');
    const usage = await streamResult.totalUsage;
    const response = await streamResult.response;
    log.debug({ content }, 'response received');
    log.info(
      { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      'continuation stream ended',
    );

    this.messages.push(...response.messages);

    return {
      content,
      usage: normalizeUsage(usage),
    };
  }
}

function normalizeUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
}): TokenUsage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  };
}

function extractWikilinks(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
}
