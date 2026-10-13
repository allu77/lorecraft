import { describe, it, expect } from 'vitest';
import { budgetWindowWarning, RESERVED_TOKENS } from './context-window.js';

describe('budgetWindowWarning', () => {
  it('returns undefined when budget plus reserve fits the window', () => {
    expect(budgetWindowWarning(8_000, 16_384)).toBeUndefined();
  });

  it('returns undefined exactly at the boundary', () => {
    expect(budgetWindowWarning(1_000, 1_000 + RESERVED_TOKENS)).toBeUndefined();
  });

  it('warns when budget plus reserve exceeds the window, naming both values', () => {
    const message = budgetWindowWarning(8_000, 8_000)!;
    expect(message).toMatch(/8000/);
    expect(message).toMatch(/OLLAMA_NUM_CTX/);
    expect(message).toMatch(/CONTEXT_BUDGET_TOKENS/);
  });

  it('reserves 4096 tokens for prompt scaffolding and output', () => {
    expect(RESERVED_TOKENS).toBe(4_096);
  });
});
