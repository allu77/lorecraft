/** A single vault note to be included as context. */
export type ContextNote = {
  /** Note filename without extension, used as a section header. */
  name: string;
  /** Raw Markdown content. */
  content: string;
};

/** Inputs for a single generation request. */
export type BuildPromptArgs = {
  /** Full content of the Campaign Style note. */
  campaignStyle: string;
  /** agentPrompt extracted by TemplateParser. */
  templateInstructions: string;
  /** bodyMarkdown from TemplateParser — the note structure to fill in. */
  templateBody: string;
  /** Budget-filtered vault notes, in order. */
  contextNotes: ContextNote[];
  /** Resolved template inputs, e.g. { name: "Mira", faction: "Thieves Guild" }. */
  userInputs: Record<string, string>;
};

/** Ready-to-use prompt parts for Vercel AI SDK's generateText / streamText. */
export type BuiltPrompt = {
  /** Passed as the `system` parameter. */
  system: string;
  /** Passed as the `prompt` parameter. */
  prompt: string;
};

const BASE_PROSE = `
You are Lorecraft, an AI co-author for tabletop RPG Game Masters. 
Your role is to generate lore-consistent campaign content that fits the 
world the GM has already built. You read the GM's vault notes before 
writing anything. You don't need user approval to use tools. Just use them.
You never invent facts that contradict the existing lore. 

You produce output as a Markdown note using the template structure provided.`;

/**
 * Assembles a prompt from campaign context.
 * Returns { system, prompt } for direct use with generateText/streamText.
 * Pure function — no I/O, no side effects.
 *
 * @param args - All inputs needed to construct the prompt.
 * @returns A `BuiltPrompt` with `system` and `prompt` fields.
 */
export function buildPrompt(args: BuildPromptArgs): BuiltPrompt {
  const {
    campaignStyle,
    templateInstructions,
    templateBody,
    contextNotes,
    userInputs,
  } = args;

  const sections: string[] = [BASE_PROSE];

  sections.push(`---\n## Campaign Style\n\n${campaignStyle}`);

  if (templateInstructions.trim() !== '') {
    sections.push(`---\n## Your Task\n\n${templateInstructions}`);
  }

  sections.push(
    `---\n## Output Template\n\nFill in the following template. Preserve all Markdown headings and fields. Do not add sections that are not in the template. You are expected to fill the template with relevant content, rather than open-ended notes. If you fill like you are missing any piece of info in order to generate the note, ask the user.\n\n${templateBody}`,
  );

  if (contextNotes.length > 0) {
    const notesContent = contextNotes
      .map((note) => `### ${note.name}\n${note.content}`)
      .join('\n\n');
    sections.push(`---\n## Relevant Notes from the Vault\n\n${notesContent}`);
  }

  const system = sections.join('\n\n');

  const inputLines = Object.entries(userInputs)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  const prompt = `Generate the note with the following inputs:\n${inputLines}`;

  return { system, prompt };
}
