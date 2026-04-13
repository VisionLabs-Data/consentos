/**
 * Statistical significance utilities for A/B test analysis.
 *
 * Uses the chi-squared test to determine whether observed differences
 * in consent rates between variants are statistically significant.
 */

/**
 * Chi-squared cumulative distribution function approximation.
 *
 * Uses the regularised incomplete gamma function for 1 degree of freedom
 * (2-variant comparison). Returns P(X <= x) for chi-squared distribution.
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  // Use the regularised lower incomplete gamma function
  // For integer/half-integer df, this converges quickly
  const k = df / 2;
  const xHalf = x / 2;
  return regularisedGammaP(k, xHalf);
}

/** Regularised lower incomplete gamma function P(a, x) via series expansion. */
function regularisedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  // Use series expansion for x < a + 1
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }

  // Use continued fraction for x >= a + 1
  return 1 - regularisedGammaQ(a, x);
}

/** Regularised upper incomplete gamma function Q(a, x) via continued fraction. */
function regularisedGammaQ(a: number, x: number): number {
  let c = 1e-30;
  let d = 1 / (x + 1 - a);
  let h = d;

  for (let n = 1; n < 200; n++) {
    const an = -n * (n - a);
    const bn = x + 2 * n + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Natural log of the Gamma function using Lanczos approximation. */
function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export type SignificanceLevel = 'not_enough_data' | 'not_significant' | 'trending' | 'significant';

export interface SignificanceResult {
  level: SignificanceLevel;
  /** Human-readable label */
  label: string;
  /** p-value (0 to 1), lower = more significant */
  pValue: number | null;
  /** Confidence percentage (0 to 100) */
  confidence: number | null;
}

/**
 * Perform a chi-squared test comparing conversion rates between variants.
 *
 * @param observed Array of { successes, total } per variant
 * @param minSampleSize Minimum total observations before testing (default: 100)
 */
export function chiSquaredTest(
  observed: { successes: number; total: number }[],
  minSampleSize: number = 100,
): SignificanceResult {
  const totalObservations = observed.reduce((sum, v) => sum + v.total, 0);

  if (totalObservations < minSampleSize) {
    return {
      level: 'not_enough_data',
      label: 'Not enough data',
      pValue: null,
      confidence: null,
    };
  }

  const totalSuccesses = observed.reduce((sum, v) => sum + v.successes, 0);
  const overallRate = totalSuccesses / totalObservations;

  if (overallRate === 0 || overallRate === 1) {
    return {
      level: 'not_significant',
      label: 'Not significant',
      pValue: 1,
      confidence: 0,
    };
  }

  // Calculate chi-squared statistic
  let chiSq = 0;
  for (const variant of observed) {
    const expectedSuccess = variant.total * overallRate;
    const expectedFailure = variant.total * (1 - overallRate);

    if (expectedSuccess > 0) {
      chiSq += Math.pow(variant.successes - expectedSuccess, 2) / expectedSuccess;
    }
    if (expectedFailure > 0) {
      const failures = variant.total - variant.successes;
      chiSq += Math.pow(failures - expectedFailure, 2) / expectedFailure;
    }
  }

  const df = observed.length - 1;
  const pValue = 1 - chiSquaredCDF(chiSq, df);
  const confidence = (1 - pValue) * 100;

  if (confidence >= 95) {
    return { level: 'significant', label: 'Significant (>95%)', pValue, confidence };
  }
  if (confidence >= 90) {
    return { level: 'trending', label: 'Trending (>90%)', pValue, confidence };
  }

  return { level: 'not_significant', label: 'Not significant', pValue, confidence };
}

/**
 * Calculate the recommended sample size per variant.
 *
 * Uses the formula for a two-proportion z-test:
 *   n = (Z_alpha/2 + Z_beta)^2 * (p1(1-p1) + p2(1-p2)) / (p1 - p2)^2
 *
 * @param baselineRate Current accept-all rate (0-1)
 * @param minimumDetectableEffect Minimum relative change to detect (e.g. 0.05 for 5%)
 * @param power Statistical power (default: 0.8)
 * @param alpha Significance level (default: 0.05)
 */
export function requiredSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  power: number = 0.8,
  alpha: number = 0.05,
): number {
  if (baselineRate <= 0 || baselineRate >= 1) return 0;
  if (minimumDetectableEffect <= 0) return Infinity;

  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);

  if (p2 >= 1) return Infinity;

  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);

  const numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p1 - p2, 2);

  return Math.ceil(numerator / denominator);
}

/**
 * Approximate inverse normal CDF (quantile function).
 *
 * Uses the rational approximation from Peter Acklam:
 * https://web.archive.org/web/20151030215612/http://home.online.no/~pjacklam/notes/invnorm/
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Coefficients for the rational approximation
  const a1 = -3.969683028665376e+01;
  const a2 = 2.209460984245205e+02;
  const a3 = -2.759285104469687e+02;
  const a4 = 1.383577518672690e+02;
  const a5 = -3.066479806614716e+01;
  const a6 = 2.506628277459239e+00;

  const b1 = -5.447609879822406e+01;
  const b2 = 1.615858368580409e+02;
  const b3 = -1.556989798598866e+02;
  const b4 = 6.680131188771972e+01;
  const b5 = -1.328068155288572e+01;

  const c1 = -7.784894002430293e-03;
  const c2 = -3.223964580411365e-01;
  const c3 = -2.400758277161838e+00;
  const c4 = -2.549732539343734e+00;
  const c5 = 4.374664141464968e+00;
  const c6 = 2.938163982698783e+00;

  const d1 = 7.784695709041462e-03;
  const d2 = 3.224671290700398e-01;
  const d3 = 2.445134137142996e+00;
  const d4 = 3.754408661907416e+00;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
}
