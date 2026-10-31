import { describe, expect, it } from 'vitest';
import { columnPath, formatAverage, formatDay, formatTick, labelIndexes, niceTicks } from './chart';

describe('niceTicks', () => {
  it('rounds up to clean integer steps', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });

  it('handles an empty series', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('labelIndexes', () => {
  it('thins labels to fit and keeps the last day', () => {
    const picked = labelIndexes(30, 400);
    expect(picked.at(-1)).toBe(29);
    expect(picked.length).toBeLessThanOrEqual(6);
  });

  it('labels every day when there is room', () => {
    expect(labelIndexes(7, 800)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('columnPath', () => {
  it('draws nothing for a zero-height column', () => {
    expect(columnPath(0, 100, 20, 100)).toBe('');
  });

  it('clamps the radius on very short columns', () => {
    expect(columnPath(0, 98, 20, 100)).toContain('Q0,98 2,98');
  });
});

describe('formatting', () => {
  it('formats UTC days and axis ticks', () => {
    expect(formatDay('2026-10-31')).toBe('Oct 31');
    expect(formatTick(2000, 5000)).toBe('2,000');
    expect(formatTick(20000, 40000)).toBe('20K');
  });
});

describe('formatAverage', () => {
  it('never shows a misleading zero for sparse events', () => {
    expect(formatAverage(0, 30)).toBe('0');
    expect(formatAverage(1, 30)).toBe('<0.1');
    expect(formatAverage(3, 30)).toBe('0.1');
    expect(formatAverage(905, 30)).toBe('30.2');
  });
});
