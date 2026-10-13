/** Tokens kept free in the window for the system prompt, template and generated output. */
export const RESERVED_TOKENS = 4_096;

/**
 * Checks that the vault context budget leaves room in the provider's context window.
 * A budget that does not fit makes the provider silently truncate the prompt.
 *
 * @param budgetTokens - Context budget ceiling for vault content.
 * @param windowTokens - Context window sent to the provider.
 * @returns A warning message when `budgetTokens + RESERVED_TOKENS` exceeds the window, otherwise `undefined`.
 */
export function budgetWindowWarning(
  budgetTokens: number,
  windowTokens: number,
): string | undefined {
  if (budgetTokens + RESERVED_TOKENS <= windowTokens) return undefined;
  return `Context budget (${budgetTokens} tokens) plus ${RESERVED_TOKENS} reserved tokens exceeds the model context window (${windowTokens}); the prompt may be truncated. Raise OLLAMA_NUM_CTX or lower CONTEXT_BUDGET_TOKENS.`;
}
