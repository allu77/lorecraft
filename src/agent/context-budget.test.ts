import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { ContextBudget } from './context-budget.js';

describe('ContextBudget', () => {
  describe('constructor', () => {
    it('initialises remaining to the provided ceiling', () => {
      const budget = new ContextBudget(100);
      expect(budget.remaining).toBe(100);
    });

    it('reads ceiling from CONTEXT_BUDGET_TOKENS env var when no arg supplied', () => {
      process.env['CONTEXT_BUDGET_TOKENS'] = '200';
      const budget = new ContextBudget();
      expect(budget.remaining).toBe(200);
      delete process.env['CONTEXT_BUDGET_TOKENS'];
    });

    it('throws when neither arg nor env var is present', () => {
      const saved = process.env['CONTEXT_BUDGET_TOKENS'];
      delete process.env['CONTEXT_BUDGET_TOKENS'];
      expect(() => new ContextBudget()).toThrow(/no token ceiling/);
      if (saved !== undefined) process.env['CONTEXT_BUDGET_TOKENS'] = saved;
    });
  });

  describe('fits()', () => {
    it('returns true when text fits within remaining budget', () => {
      const budget = new ContextBudget(100);
      // 4 chars = 1 token; 400 chars = 100 tokens — exactly fits
      expect(budget.fits('a'.repeat(400))).toBe(true);
    });

    it('returns false when text would exceed remaining budget', () => {
      const budget = new ContextBudget(100);
      // 401 chars = ceil(401/4) = 101 tokens — does not fit
      expect(budget.fits('a'.repeat(401))).toBe(false);
    });

    it('is non-mutating — remaining does not change after fits()', () => {
      const budget = new ContextBudget(100);
      budget.fits('hello world');
      expect(budget.remaining).toBe(100);
    });
  });

  describe('add()', () => {
    it('reduces remaining by the estimated token count', () => {
      const budget = new ContextBudget(100);
      budget.add('a'.repeat(40)); // 40/4 = 10 tokens
      expect(budget.remaining).toBe(90);
    });

    it('handles fractional token estimates by ceiling', () => {
      const budget = new ContextBudget(100);
      budget.add('abc'); // 3 chars → ceil(3/4) = 1 token
      expect(budget.remaining).toBe(99);
    });

    it('throws when text would exceed remaining budget', () => {
      const budget = new ContextBudget(10);
      expect(() => budget.add('a'.repeat(41))).toThrow(/tokens but only/);
    });

    it('allows successive adds up to the ceiling', () => {
      const budget = new ContextBudget(10);
      budget.add('a'.repeat(20)); // 5 tokens
      budget.add('a'.repeat(20)); // 5 tokens — total 10, exactly at ceiling
      expect(budget.remaining).toBe(0);
    });
  });
});
