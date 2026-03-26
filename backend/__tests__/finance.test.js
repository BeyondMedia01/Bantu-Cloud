import { describe, it, expect } from 'vitest';
import { toCents } from '../lib/finance.js';

describe('toCents', () => {
  it('converts a standard decimal salary', () => {
    expect(toCents(1500.50)).toBe(150050);
  });

  it('rounds to 2 decimal places before converting', () => {
    // 1234.575 → "1234.58" → 123458 (not 123457 due to float imprecision)
    expect(toCents(1234.575)).toBe(123458);
  });

  it('handles null/undefined/zero safely', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents(0)).toBe(0);
  });

  it('handles string input from SQL driver', () => {
    expect(toCents('750.25')).toBe(75025);
  });

  it('handles string zero', () => {
    expect(toCents('0')).toBe(0);
  });
});
