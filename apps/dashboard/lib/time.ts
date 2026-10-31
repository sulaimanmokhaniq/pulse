const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday". */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** Who a flag is on for, in words. */
export function audience(enabled: boolean, rolloutPercent: number): string {
  if (!enabled || rolloutPercent === 0) return 'Off for everyone';
  if (rolloutPercent === 100) return 'On for everyone';
  return `On for ${rolloutPercent}% of users`;
}
