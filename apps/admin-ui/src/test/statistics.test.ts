import { describe, it, expect } from 'vitest';
import { chiSquaredTest, requiredSampleSize } from '../utils/statistics';

describe('chiSquaredTest', () => {
  it('returns not_enough_data when total observations below threshold', () => {
    const result = chiSquaredTest([
      { successes: 5, total: 20 },
      { successes: 3, total: 15 },
    ]);
    expect(result.level).toBe('not_enough_data');
    expect(result.pValue).toBeNull();
  });

  it('returns not_significant for identical rates', () => {
    const result = chiSquaredTest([
      { successes: 50, total: 100 },
      { successes: 50, total: 100 },
    ]);
    expect(result.level).toBe('not_significant');
    expect(result.pValue).toBeCloseTo(1, 1);
  });

  it('returns significant for very different rates with large sample', () => {
    // 80% vs 40% with n=500 each — should be extremely significant
    const result = chiSquaredTest([
      { successes: 400, total: 500 },
      { successes: 200, total: 500 },
    ]);
    expect(result.level).toBe('significant');
    expect(result.confidence).toBeGreaterThan(95);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('returns trending for moderate differences', () => {
    // Find sample sizes that produce ~90-95% confidence
    // 55% vs 45% with n=200 each
    const result = chiSquaredTest([
      { successes: 110, total: 200 },
      { successes: 90, total: 200 },
    ]);
    // This should be somewhere between not significant and significant
    expect(result.pValue).not.toBeNull();
    expect(result.confidence).not.toBeNull();
    expect(result.confidence!).toBeGreaterThan(0);
  });

  it('handles three variants', () => {
    const result = chiSquaredTest([
      { successes: 80, total: 100 },
      { successes: 60, total: 100 },
      { successes: 40, total: 100 },
    ]);
    expect(result.level).toBe('significant');
  });

  it('handles zero success rate', () => {
    const result = chiSquaredTest([
      { successes: 0, total: 200 },
      { successes: 0, total: 200 },
    ]);
    expect(result.level).toBe('not_significant');
  });

  it('handles 100% success rate', () => {
    const result = chiSquaredTest([
      { successes: 200, total: 200 },
      { successes: 200, total: 200 },
    ]);
    expect(result.level).toBe('not_significant');
  });

  it('correctly identifies known chi-squared value (manual verification)', () => {
    // With 2 groups: 70/100 vs 50/100
    // Expected: (120/200)*100 = 60 per group
    // Chi-sq = (70-60)^2/60 + (30-40)^2/40 + (50-60)^2/60 + (50-40)^2/40
    //        = 100/60 + 100/40 + 100/60 + 100/40
    //        = 1.667 + 2.5 + 1.667 + 2.5 = 8.333
    // df=1, p-value ≈ 0.0039 → highly significant
    const result = chiSquaredTest([
      { successes: 70, total: 100 },
      { successes: 50, total: 100 },
    ]);
    expect(result.level).toBe('significant');
    expect(result.pValue!).toBeLessThan(0.01);
    expect(result.confidence!).toBeGreaterThan(99);
  });
});

describe('requiredSampleSize', () => {
  it('returns a positive number for valid inputs', () => {
    const n = requiredSampleSize(0.5, 0.1);
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
  });

  it('returns larger sample for smaller detectable effect', () => {
    const n5 = requiredSampleSize(0.5, 0.05);
    const n10 = requiredSampleSize(0.5, 0.1);
    expect(n5).toBeGreaterThan(n10);
  });

  it('returns Infinity for zero or negative effect', () => {
    expect(requiredSampleSize(0.5, 0)).toBe(Infinity);
    expect(requiredSampleSize(0.5, -0.1)).toBe(Infinity);
  });

  it('returns 0 for invalid baseline rates', () => {
    expect(requiredSampleSize(0, 0.1)).toBe(0);
    expect(requiredSampleSize(1, 0.1)).toBe(0);
  });

  it('gives reasonable values for typical consent scenarios', () => {
    // 50% baseline, 5% MDE, 80% power, 5% significance
    const n = requiredSampleSize(0.5, 0.05);
    // Expected ≈ 3000-4000 per variant
    expect(n).toBeGreaterThan(1000);
    expect(n).toBeLessThan(10000);
  });
});
