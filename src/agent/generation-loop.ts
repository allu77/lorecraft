import path from 'path';
import { streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { VaultReader } from '../vault/vault-reader.js';
import { TemplateParser } from '../vault/template-parser.js';
import { ContextBudget } from './context-budget.js';
import { buildPrompt } from './prompt-builder.js';
import type { ContextNote } from './prompt-builder.js';
import { getModel } from '../llm/provider.js';

/** Token counts as reported by the Vercel AI SDK after a streamText call. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Options for a single content generation request. */
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
   * Optional streaming callback. Called with each text chunk as it arrives
   * from the LLM. The CLI uses this for incremental display.
   */
  onChunk?: (chunk: string) => void;
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
};

/** Result returned by `generateContent` after a successful generation. */
export type GenerateResult = {
  /** Full generated markdown text. */
  content: string;
  /** Token counts from the Vercel AI SDK usage report. */
  usage: TokenUsage;
};

const CAMPAIGN_STYLE_NOTE = 'Campaign Style';
const DEFAULT_BUDGET_TOKENS = 8_000;

/**
 * Runs the full generation pipeline for a single vault note.
 * Resolves vault context, assembles a budget-bounded prompt, streams the LLM
 * response, and returns the complete text with token usage.
 *
 * Throws if any required template input is missing from `options.inputs`.
 *
 * @param options - Generation request parameters.
 * @returns Resolved `GenerateResult` with `content` and `usage`.
 */
export async function generateContent(options: GenerateOptions): Promise<GenerateResult> {
  const { vaultRoot, templatePath, inputs, onChunk } = options;
  const model = options.model ?? getModel();

  const reader = new VaultReader(vaultRoot);
  const parser = new TemplateParser();

  // 1. Read and parse template
  const templateContent = await reader.readNote(templatePath);
  const { agentPrompt, inputs: templateInputs, bodyMarkdown } = parser.parse(templateContent);

  // 2. Validate required inputs
  const missing = templateInputs
    .filter((i) => i.required && !(i.name in inputs))
    .map((i) => i.name);
  if (missing.length > 0) {
    throw new Error(`Missing required inputs: ${missing.join(', ')}`);
  }

  // 3. Find and read Campaign Style note (soft fail if absent)
  const campaignStylePath = await reader.findNote(CAMPAIGN_STYLE_NOTE);
  const campaignStyle = campaignStylePath
    ? await reader.readNote(campaignStylePath)
    : '';

  // 4. Initialise context budget
  const ceiling =
    options.budgetTokens ??
    (process.env['CONTEXT_BUDGET_TOKENS']
      ? Number(process.env['CONTEXT_BUDGET_TOKENS'])
      : DEFAULT_BUDGET_TOKENS);
  const budget = new ContextBudget(ceiling);
  if (campaignStyle && budget.fits(campaignStyle)) {
    budget.add(campaignStyle);
  }

  // 5. Gather context notes from template wikilinks and input values
  const contextNotes: ContextNote[] = [];
  const seen = new Set<string>();

  const candidates = [...extractWikilinks(bodyMarkdown), ...Object.values(inputs)];

  for (const candidate of candidates) {
    const notePath =
      (await reader.resolveWikilink(candidate)) ?? (await reader.findNote(candidate));
    if (!notePath || seen.has(notePath)) continue;
    seen.add(notePath);

    const content = await reader.readNote(notePath);
    if (budget.fits(content)) {
      budget.add(content);
      contextNotes.push({ name: path.basename(notePath, '.md'), content });
    }
  }

  // 6. Assemble prompt and stream generation
  const { system, prompt } = buildPrompt({
    campaignStyle,
    templateInstructions: agentPrompt,
    templateBody: bodyMarkdown,
    contextNotes,
    userInputs: inputs,
  });

  const streamResult = streamText({ model, system, prompt });
  const chunks: string[] = [];
  for await (const chunk of streamResult.textStream) {
    chunks.push(chunk);
    onChunk?.(chunk);
  }

  const content = chunks.join('');
  const usage = await streamResult.usage;

  return {
    content,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
  };
}

function extractWikilinks(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
}
