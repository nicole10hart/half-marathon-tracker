import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock state so plan-generator can import it without localStorage
vi.mock('../js/state.js', () => ({
  state: { plan: [], profile: { startDate: '2025-01-06', raceDate: '2025-04-06' } },
  saveState: vi.fn(),
  loadState: vi.fn(),
}));

import {
  isCutbackWFE,
  isTempoWFE,
  calcPaces,
  estimateHalf,
  calcTotalWeeks,
} from '../js/plan-generator.js';

describe('isCutbackWFE', () => {
  it('wFE=2 is cutback (taper zone)', () => expect(isCutbackWFE(2)).toBe(true));
  it('wFE=5 is cutback', () => expect(isCutbackWFE(5)).toBe(true));
  it('wFE=9 is cutback', () => expect(isCutbackWFE(9)).toBe(true));
  it('wFE=13 is cutback (9 + 4)', () => expect(isCutbackWFE(13)).toBe(true));
  it('wFE=17 is cutback (9 + 8)', () => expect(isCutbackWFE(17)).toBe(true));
  it('wFE=1 is not cutback', () => expect(isCutbackWFE(1)).toBe(false));
  it('wFE=3 is not cutback', () => expect(isCutbackWFE(3)).toBe(false));
  it('wFE=4 is not cutback', () => expect(isCutbackWFE(4)).toBe(false));
  it('wFE=6 is not cutback', () => expect(isCutbackWFE(6)).toBe(false));
  it('wFE=10 is not cutback', () => expect(isCutbackWFE(10)).toBe(false));
});

describe('isTempoWFE', () => {
  it('returns false when wFE <= 3 (too close to race)', () => {
    expect(isTempoWFE(0)).toBe(false);
    expect(isTempoWFE(1)).toBe(false);
    expect(isTempoWFE(2)).toBe(false);
    expect(isTempoWFE(3)).toBe(false);
  });
  it('returns false for cutback weeks', () => {
    expect(isTempoWFE(5)).toBe(false);
    expect(isTempoWFE(9)).toBe(false);
  });
  it('returns true for known tempo weeks', () => {
    expect(isTempoWFE(4)).toBe(true);
    expect(isTempoWFE(6)).toBe(true);
    expect(isTempoWFE(8)).toBe(true);
    expect(isTempoWFE(11)).toBe(true);
  });
});

describe('estimateHalf', () => {
  it('returns null with no times', () => expect(estimateHalf(null, null)).toBeNull());
  it('returns null with both undefined', () => expect(estimateHalf(undefined, undefined)).toBeNull());

  it('estimates from 5K only — result in plausible range', () => {
    const result = estimateHalf(20 * 60, null); // 20:00 5K
    expect(result).toBeGreaterThan(85 * 60);  // faster than 1:25
    expect(result).toBeLessThan(130 * 60);    // slower than 2:10
  });

  it('estimates from 10K only — result in plausible range', () => {
    const result = estimateHalf(null, 45 * 60); // 45:00 10K
    expect(result).toBeGreaterThan(90 * 60);
    expect(result).toBeLessThan(140 * 60);
  });

  it('estimates from both times', () => {
    const result = estimateHalf(20 * 60, 42 * 60);
    expect(result).toBeGreaterThan(85 * 60);
    expect(result).toBeLessThan(130 * 60);
  });

  it('faster 5K gives faster estimate', () => {
    const fast = estimateHalf(18 * 60, null);
    const slow = estimateHalf(28 * 60, null);
    expect(fast).toBeLessThan(slow);
  });
});

describe('calcPaces', () => {
  it('returns all required run types', () => {
    const paces = calcPaces(20 * 60, null);
    expect(paces).toHaveProperty('easy');
    expect(paces).toHaveProperty('tempo');
    expect(paces).toHaveProperty('long');
    expect(paces).toHaveProperty('recovery');
    expect(paces).toHaveProperty('race');
  });

  it('easy is slower than tempo', () => {
    const paces = calcPaces(20 * 60, null);
    expect(paces.easy).toBeGreaterThan(paces.tempo);
  });

  it('recovery is the slowest pace', () => {
    const paces = calcPaces(20 * 60, null);
    expect(paces.recovery).toBeGreaterThanOrEqual(paces.easy);
    expect(paces.recovery).toBeGreaterThanOrEqual(paces.long);
  });

  it('uses 9:00/mi default when no times given', () => {
    const paces = calcPaces(null, null);
    expect(paces.easy).toBe(9 * 60 + 90);
    expect(paces.recovery).toBe(9 * 60 + 120);
  });
});

describe('calcTotalWeeks', () => {
  it('returns 13 when no race date', () => {
    expect(calcTotalWeeks('2025-01-01', null)).toBe(13);
  });

  it('clamps to minimum 5 weeks', () => {
    expect(calcTotalWeeks('2025-06-15', '2025-06-22')).toBe(5);
  });

  it('clamps to maximum 20 weeks', () => {
    expect(calcTotalWeeks('2025-01-01', '2026-12-01')).toBe(20);
  });

  it('calculates a reasonable plan length for a 13-week window', () => {
    const weeks = calcTotalWeeks('2025-01-06', '2025-04-06');
    expect(weeks).toBeGreaterThanOrEqual(12);
    expect(weeks).toBeLessThanOrEqual(14);
  });
});
