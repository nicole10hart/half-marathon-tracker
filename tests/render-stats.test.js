import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock state — must be hoisted before any imports that read state
vi.mock('../js/state.js', () => ({
  state: { plan: [], profile: null },
  saveState: vi.fn(),
  loadState: vi.fn(),
}));

// Mock plan-generator functions that depend on live state/dates
vi.mock('../js/plan-generator.js', async () => {
  const actual = await vi.importActual('../js/plan-generator.js');
  return {
    ...actual,
    getPlanTotalWeeks: vi.fn(() => 13),
    getCurrentWeek:    vi.fn(() => 1),
  };
});

import { getStats } from '../js/render-stats.js';
import { state }    from '../js/state.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function makeRun(overrides = {}) {
  return {
    id:             String(++_id),
    type:           'easy',
    label:          'Easy Run',
    date:           '2025-01-01',
    distance:       5,
    estimatedPace:  540,
    week:           1,
    completed:      false,
    skipped:        false,
    stravaVerified: false,
    ...overrides,
  };
}

beforeEach(() => {
  state.plan    = [];
  state.profile = null;
  vi.useRealTimers();
});

// ── basic counts ─────────────────────────────────────────────────────────────

describe('getStats – counts', () => {
  it('returns zeros for an empty plan', () => {
    const s = getStats();
    expect(s.total).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.skipped).toBe(0);
    expect(s.upcoming).toBe(0);
    expect(s.stravaVerified).toBe(0);
  });

  it('counts correctly with mixed states', () => {
    state.plan = [
      makeRun({ completed: true }),
      makeRun({ completed: true }),
      makeRun({ skipped: true }),
      makeRun({ date: '2099-01-01' }), // future → upcoming
    ];
    const s = getStats();
    expect(s.total).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.skipped).toBe(1);
    expect(s.upcoming).toBe(1); // skipped is NOT upcoming
  });

  it('counts stravaVerified correctly', () => {
    state.plan = [
      makeRun({ completed: true, stravaVerified: true }),
      makeRun({ completed: true, stravaVerified: true }),
      makeRun({ completed: true, stravaVerified: false }),
    ];
    expect(getStats().stravaVerified).toBe(2);
  });

  it('sums miles run using actualDistance when present', () => {
    state.plan = [
      makeRun({ completed: true, distance: 5, actualDistance: 5.1 }),
      makeRun({ completed: true, distance: 6, actualDistance: null }),
    ];
    const s = getStats();
    expect(s.milesComp).toBeCloseTo(11.1);
  });
});

// ── strava streak ─────────────────────────────────────────────────────────────

describe('getStats – stravaStreak', () => {
  it('is 0 with no completed runs', () => {
    state.plan = [makeRun({ date: '2099-01-01' })];
    expect(getStats().stravaStreak).toBe(0);
  });

  it('is 0 when the most recent completed run is not verified', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, stravaVerified: false, date: '2025-03-08' }),
      makeRun({ completed: true, stravaVerified: true,  date: '2025-03-06' }),
    ];
    expect(getStats().stravaStreak).toBe(0);
  });

  it('counts consecutive verified runs from the most recent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, stravaVerified: true,  date: '2025-03-08' }),
      makeRun({ completed: true, stravaVerified: true,  date: '2025-03-06' }),
      makeRun({ completed: true, stravaVerified: false, date: '2025-03-04' }),
      makeRun({ completed: true, stravaVerified: true,  date: '2025-03-02' }),
    ];
    expect(getStats().stravaStreak).toBe(2); // stops at the unverified run
  });

  it('equals all completed when every run is verified', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, stravaVerified: true, date: '2025-03-08' }),
      makeRun({ completed: true, stravaVerified: true, date: '2025-03-06' }),
      makeRun({ completed: true, stravaVerified: true, date: '2025-03-04' }),
    ];
    expect(getStats().stravaStreak).toBe(3);
  });

  it('ignores future completed runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, stravaVerified: true,  date: '2025-04-01' }), // future
      makeRun({ completed: true, stravaVerified: false, date: '2025-03-08' }),
    ];
    // The future run is excluded; most recent past run is unverified → streak 0
    expect(getStats().stravaStreak).toBe(0);
  });
});

// ── run streak ───────────────────────────────────────────────────────────────

describe('getStats – streak', () => {
  it('is 0 with no completed runs', () => {
    state.plan = [];
    expect(getStats().streak).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, date: '2025-03-10' }), // today
      makeRun({ completed: true, date: '2025-03-09' }),
      makeRun({ completed: true, date: '2025-03-08' }),
      makeRun({ completed: true, date: '2025-03-05' }), // gap — breaks streak
    ];
    expect(getStats().streak).toBe(3);
  });

  it('is 0 if today has no run and yesterday is missed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-10'));
    state.plan = [
      makeRun({ completed: true, date: '2025-03-08' }), // two days ago
    ];
    expect(getStats().streak).toBe(0);
  });
});

// ── milesAll ──────────────────────────────────────────────────────────────────

describe('getStats – milesAll', () => {
  it('sums planned distance for all runs', () => {
    state.plan = [
      makeRun({ distance: 3 }),
      makeRun({ distance: 5 }),
      makeRun({ distance: 10 }),
    ];
    expect(getStats().milesAll).toBe(18);
  });
});
