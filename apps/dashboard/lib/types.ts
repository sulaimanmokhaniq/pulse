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
