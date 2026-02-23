import { describe, it, expect } from 'vitest';
import { parseTimeSecs, pad, fmtSecs, fmtPace, dStr, parseDate } from '../js/utils.js';

describe('parseTimeSecs', () => {
  it('parses MM:SS', () => expect(parseTimeSecs('5:30')).toBe(330));
  it('parses H:MM:SS', () => expect(parseTimeSecs('1:05:30')).toBe(3930));
  it('handles leading zeros', () => expect(parseTimeSecs('05:04')).toBe(304));
  it('returns null for empty string', () => expect(parseTimeSecs('')).toBeNull());
  it('returns null for whitespace', () => expect(parseTimeSecs('   ')).toBeNull());
  it('returns null for null', () => expect(parseTimeSecs(null)).toBeNull());
  it('returns null for non-numeric', () => expect(parseTimeSecs('abc')).toBeNull());
  it('returns null for partial invalid', () => expect(parseTimeSecs('5:xx')).toBeNull());
});

describe('pad', () => {
  it('pads single digit', () => expect(pad(5)).toBe('05'));
  it('does not pad two-digit number', () => expect(pad(10)).toBe('10'));
  it('pads zero', () => expect(pad(0)).toBe('00'));
});

describe('fmtSecs', () => {
  it('formats seconds below an hour as M:SS', () => expect(fmtSecs(330)).toBe('5:30'));
  it('formats exactly one minute', () => expect(fmtSecs(60)).toBe('1:00'));
  it('formats with hours as H:MM:SS', () => expect(fmtSecs(3930)).toBe('1:05:30'));
  it('formats exactly one hour', () => expect(fmtSecs(3600)).toBe('1:00:00'));
  it('returns -- for null', () => expect(fmtSecs(null)).toBe('--'));
  it('returns -- for undefined', () => expect(fmtSecs(undefined)).toBe('--'));
  it('rounds fractional seconds', () => expect(fmtSecs(330.7)).toBe('5:31'));
});

describe('fmtPace', () => {
  it('formats pace as M:SS/mi', () => expect(fmtPace(330)).toBe('5:30/mi'));
  it('formats a slow pace', () => expect(fmtPace(10 * 60)).toBe('10:00/mi'));
  it('returns -- for 0', () => expect(fmtPace(0)).toBe('--'));
  it('returns -- for null', () => expect(fmtPace(null)).toBe('--'));
});

describe('parseDate', () => {
  it('parses YYYY-MM-DD without timezone shift', () => {
    const d = parseDate('2025-06-15');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(15);
  });
  it('parses January correctly', () => {
    const d = parseDate('2025-01-01');
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
  it('parses December 31 correctly', () => {
    const d = parseDate('2025-12-31');
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });
});

describe('dStr', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(dStr(new Date(2025, 5, 15))).toBe('2025-06-15');
  });
  it('pads month and day with zeros', () => {
    expect(dStr(new Date(2025, 0, 5))).toBe('2025-01-05');
  });
  it('round-trips with parseDate', () => {
    const original = '2025-08-22';
    expect(dStr(parseDate(original))).toBe(original);
  });
});
