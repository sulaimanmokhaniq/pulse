/** Round up to a "nice" axis maximum and return evenly spaced integer ticks. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** Indexes of x labels to show so they don't collide; always includes the last. */
export function labelIndexes(count: number, width: number, minGap = 64): number[] {
  if (count === 0) return [];
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / minGap))));
  const picked: number[] = [];
  for (let i = count - 1; i >= 0; i -= every) picked.unshift(i);
  return picked;
}

/**
 * Column with a 4px rounded data end and a square foot on the baseline.
 * The radius shrinks for short or narrow columns so the shape never inverts.
 */
export function columnPath(x: number, top: number, width: number, baseline: number): string {
  const height = baseline - top;
  if (height <= 0) return '';
  const r = Math.min(4, width / 2, height);
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
export const formatLongDay = (day: string) => longDayFormat.format(new Date(`${day}T00:00:00Z`));

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-US');

/** Axis ticks: in full under 10,000, compact above. */
export const formatTick = (n: number, axisMax: number) => (axisMax >= 10_000 ? compact.format(n) : full.format(n));
export const formatNumber = (n: number) => full.format(n);
