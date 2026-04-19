/** A single input declared in a template's `== INPUTS ==` block. */
export type TemplateInput = {
  /** Input name, e.g. `"faction"`. */
  name: string;
  /** `true` for `(required)`, `false` for `(optional)`. */
  required: boolean;
  /** Human-readable description, e.g. `"Wikilink to the faction this NPC belongs to"`. */
  description: string;
};

/** Result of parsing an Obsidian template file. */
export type ParsedTemplate = {
  /**
   * Prose instructions extracted from the `%% == AGENT PROMPT == ... %%` block,
   * with the `== INPUTS ==` sub-block removed.
   */
  agentPrompt: string;
  /** Inputs parsed from the `== INPUTS ==` sub-block. */
  inputs: TemplateInput[];
  /**
   * Template content with the `%% == AGENT PROMPT == ... %%` block removed.
   * All other `%% ... %%` comments are preserved.
   */
  bodyMarkdown: string;
};

const AGENT_PROMPT_OPEN = '%% == AGENT PROMPT ==';
const AGENT_PROMPT_CLOSE = '%%';
const INPUTS_HEADING = '== INPUTS ==';
const INPUT_LINE_REGEX = /^-\s+(\w+)\s+\((required|optional)\):\s+(.+)$/;

/**
 * Parses Obsidian template files, extracting the agent prompt block and
 * declared inputs. Stateless — instantiate once and reuse.
 */
export class TemplateParser {
  /**
   * Parses a template's content into its agent prompt, input declarations,
   * and body markdown. Tolerates malformed or absent `AGENT PROMPT` blocks.
   *
   * @param content - Raw file content of an Obsidian template.
   * @returns `ParsedTemplate` with `agentPrompt`, `inputs`, and `bodyMarkdown`.
   */
  parse(content: string): ParsedTemplate {
    const openIdx = content.indexOf(AGENT_PROMPT_OPEN);
    if (openIdx === -1) {
      return { agentPrompt: '', inputs: [], bodyMarkdown: content };
    }

    const afterOpen = openIdx + AGENT_PROMPT_OPEN.length;
    const closeIdx = this._findClosingMarker(content, afterOpen);

    let blockContent: string;
    let bodyMarkdown: string;

    if (closeIdx === -1) {
      // Malformed: no closing marker — treat rest of content as block
      blockContent = content.slice(afterOpen);
      bodyMarkdown = content.slice(0, openIdx).trimEnd();
    } else {
      blockContent = content.slice(afterOpen, closeIdx);
      const before = content.slice(0, openIdx);
      const after = content.slice(closeIdx + AGENT_PROMPT_CLOSE.length);
      bodyMarkdown = before + after;
    }

    const { agentPrompt, inputs } = this._parseBlockContent(blockContent);

    return { agentPrompt, inputs, bodyMarkdown };
  }

  private _findClosingMarker(content: string, fromIndex: number): number {
    const lines = content.slice(fromIndex).split('\n');
    let offset = fromIndex;
    for (const line of lines) {
      if (line.trim() === AGENT_PROMPT_CLOSE) {
        return offset;
      }
      offset += line.length + 1;
    }
    return -1;
  }

  private _parseBlockContent(blockContent: string): {
    agentPrompt: string;
    inputs: TemplateInput[];
  } {
    const inputsIdx = blockContent.indexOf(INPUTS_HEADING);

    let prosePart: string;
    let inputsPart: string;

    if (inputsIdx === -1) {
      prosePart = blockContent;
      inputsPart = '';
    } else {
      prosePart = blockContent.slice(0, inputsIdx);
      inputsPart = blockContent.slice(inputsIdx + INPUTS_HEADING.length);
    }

    const agentPrompt = prosePart.trim();
    const inputs = this._parseInputs(inputsPart);

    return { agentPrompt, inputs };
  }

  private _parseInputs(inputsSection: string): TemplateInput[] {
    const inputs: TemplateInput[] = [];
    for (const line of inputsSection.split('\n')) {
      const match = line.match(INPUT_LINE_REGEX);
      if (match) {
        inputs.push({
          name: match[1],
          required: match[2] === 'required',
          description: match[3].trim(),
        });
      }
    }
    return inputs;
  }
}
