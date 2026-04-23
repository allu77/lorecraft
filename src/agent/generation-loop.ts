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
import type { VaultEmbeddings } from '../vault/vault-embeddings.js';
import type { EmbeddingProvider } from '../vault/embedding-provider.js';
import {
  createWikilinkTool,
  createKeywordSearchTool,
  createSemanticSearchTool,
  createHybridSearchTool,
} from './tools.js';

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
   * provided alongside `vaultEmbeddings`, the agent uses hybrid search instead.
   */
  vaultIndex?: VaultIndex;
  /**
   * Loaded `VaultEmbeddings` to enable semantic search during generation.
   * Requires `embeddingProvider`. When both `vaultIndex` and `vaultEmbeddings`
   * are provided, the agent uses `hybrid_search` (BM25 + semantic via RRF).
   */
  vaultEmbeddings?: VaultEmbeddings;
  /**
   * Embedding provider used to embed query strings for semantic / hybrid search.
   * Required when `vaultEmbeddings` is provided.
   */
  embeddingProvider?: EmbeddingProvider;
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
  semantic_search?: ReturnType<typeof createSemanticSearchTool>;
  hybrid_search?: ReturnType<typeof createHybridSearchTool>;
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
      ...buildSearchTools(options, budget, reader),
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
   * @param onChunk - Optional callback called with each text chunk as it arrives.
   * @returns `GenerateResult` with the full content and cumulative token usage.
   */
  async generate(onChunk?: (chunk: string) => void): Promise<GenerateResult> {
    const log = getLogger('agent');
    log.debug({ prompt: this.initialPrompt }, 'prompt sent');
    log.info({}, 'stream started');

    const streamResult = await this.agent.stream({
      prompt: this.initialPrompt,
    });
    const chunks: string[] = [];
    for await (const chunk of streamResult.textStream) {
      chunks.push(chunk);
      onChunk?.(chunk);
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
   * @param onChunk - Optional callback called with each text chunk as it arrives.
   * @returns `GenerateResult` with the new content and cumulative token usage.
   */
  async continue(
    userMessage: string,
    onChunk?: (chunk: string) => void,
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
    for await (const chunk of streamResult.textStream) {
      chunks.push(chunk);
      onChunk?.(chunk);
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

/**
 * Selects the appropriate search tool(s) based on what indexes are available.
 *
 * Selection rules (auto-detected from options):
 * - vaultIndex + vaultEmbeddings + embeddingProvider → hybrid_search only
 * - vaultEmbeddings + embeddingProvider only           → semantic_search
 * - vaultIndex only                                   → keyword_search
 * - neither                                           → no search tool (wikilinks only)
 */
function buildSearchTools(
  options: GenerateOptions,
  budget: ContextBudget,
  _reader: VaultReader,
): Partial<SessionTools> {
  const { vaultIndex, vaultEmbeddings, embeddingProvider } = options;

  if (vaultIndex && vaultEmbeddings && embeddingProvider) {
    return {
      hybrid_search: createHybridSearchTool(
        vaultIndex,
        vaultEmbeddings,
        embeddingProvider,
        budget,
      ),
    };
  }

  if (vaultEmbeddings && embeddingProvider) {
    return {
      semantic_search: createSemanticSearchTool(vaultEmbeddings, embeddingProvider, budget),
    };
  }

  if (vaultIndex) {
    return { keyword_search: createKeywordSearchTool(vaultIndex, budget) };
  }

  return {};
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
