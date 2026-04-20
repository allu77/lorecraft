/** Tracks token usage against a ceiling and reports remaining capacity. */
export class ContextBudget {
  private readonly ceiling: number;
  private used = 0;

  /**
   * Creates a budget with the given ceiling.
   * When maxTokens is omitted, reads CONTEXT_BUDGET_TOKENS from env.
   * Throws if no ceiling can be determined.
   *
   * @param maxTokens - Optional explicit token ceiling.
   */
  constructor(maxTokens?: number) {
    if (maxTokens !== undefined) {
      this.ceiling = maxTokens;
      return;
    }
    const envVal = process.env['CONTEXT_BUDGET_TOKENS'];
    if (envVal === undefined || envVal === '') {
      throw new Error(
        'ContextBudget: no token ceiling provided and CONTEXT_BUDGET_TOKENS env var is not set',
      );
    }
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `ContextBudget: CONTEXT_BUDGET_TOKENS must be a positive number, got "${envVal}"`,
      );
    }
    this.ceiling = parsed;
  }

  /** Tokens still available within the ceiling. */
  get remaining(): number {
    return this.ceiling - this.used;
  }

  /**
   * Returns true if adding text would not exceed the ceiling.
   * Does not modify state.
   *
   * @param text - The text to check.
   */
  fits(text: string): boolean {
    return this._estimate(text) <= this.remaining;
  }

  /**
   * Records text's token count against the running total.
   * Throws if adding text would exceed the ceiling.
   *
   * @param text - The text to account for.
   */
  add(text: string): void {
    const tokens = this._estimate(text);
    if (tokens > this.remaining) {
      throw new Error(
        `ContextBudget: text requires ${tokens} tokens but only ${this.remaining} remain`,
      );
    }
    this.used += tokens;
  }

  private _estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
