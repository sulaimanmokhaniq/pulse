export interface EventSummary {
  event: string;
  total: number;
  lastSeen: string;
}

export interface TrendPoint {
  day: string;
  count: number;
  users: number;
}

export interface Trend {
  event: string;
  days: number;
  from: string;
  to: string;
  total: number;
  users: number;
  series: TrendPoint[];
}

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(value: string | null | undefined): Range {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

/** Which project the Trends page reads: generated demo traffic, or real events from the demo shop. */
export const SOURCES = ['simulated', 'live'] as const;
export type Source = (typeof SOURCES)[number];

export function parseSource(value: string | null | undefined): Source {
  return value === 'live' ? 'live' : 'simulated';
}

export interface Flag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  updatedAt: string;
}
