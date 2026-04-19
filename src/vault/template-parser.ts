export type TemplateInput = {
  name: string;
  required: boolean;
  description: string;
};

export type ParsedTemplate = {
  agentPrompt: string;
  inputs: TemplateInput[];
  bodyMarkdown: string;
};

const AGENT_PROMPT_OPEN = '%% == AGENT PROMPT ==';
const AGENT_PROMPT_CLOSE = '%%';
const INPUTS_HEADING = '== INPUTS ==';
const INPUT_LINE_REGEX = /^-\s+(\w+)\s+\((required|optional)\):\s+(.+)$/;

export class TemplateParser {
  parse(content: string): ParsedTemplate {
    const openIdx = content.indexOf(AGENT_PROMPT_OPEN);
    if (openIdx === -1) {
      return { agentPrompt: '', inputs: [], bodyMarkdown: content };
    }

    const afterOpen = openIdx + AGENT_PROMPT_OPEN.length;
    // Find the closing %% that terminates the block (must be on its own line)
    const closeIdx = this._findClosingMarker(content, afterOpen);

    let blockContent: string;
    let bodyMarkdown: string;

    if (closeIdx === -1) {
      // Malformed: no closing marker — treat rest of content as block
      blockContent = content.slice(afterOpen);
      bodyMarkdown = content.slice(0, openIdx).trimEnd();
    } else {
      blockContent = content.slice(afterOpen, closeIdx);
      bodyMarkdown =
        content.slice(0, openIdx).trimEnd() +
        '\n' +
        content.slice(closeIdx + AGENT_PROMPT_CLOSE.length).trimStart();
      bodyMarkdown = bodyMarkdown.trim();
      // Preserve original leading content if it existed before the block
      const before = content.slice(0, openIdx);
      const after = content.slice(closeIdx + AGENT_PROMPT_CLOSE.length);
      bodyMarkdown = (before + after).replace(/\n{3,}/g, '\n\n').trim();
      // Restore exact content outside the block
      bodyMarkdown = before + after;
    }

    const { agentPrompt, inputs } = this._parseBlockContent(blockContent);

    return { agentPrompt, inputs, bodyMarkdown };
  }

  private _findClosingMarker(content: string, fromIndex: number): number {
    // Look for a line that is exactly `%%` (with optional surrounding whitespace)
    const lines = content.slice(fromIndex).split('\n');
    let offset = fromIndex;
    for (const line of lines) {
      if (line.trim() === AGENT_PROMPT_CLOSE) {
        return offset;
      }
      offset += line.length + 1; // +1 for the \n
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
