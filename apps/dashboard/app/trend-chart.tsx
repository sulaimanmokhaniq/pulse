'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { columnPath, formatDay, formatLongDay, formatNumber, formatTick, labelIndexes, niceTicks } from '@/lib/chart';
import type { TrendPoint } from '@/lib/types';

const HEIGHT = 280;
const MARGIN = { top: 24, right: 8, bottom: 28, left: 44 };
const MAX_BAR = 24;
const GAP = 2;

interface Props {
  series: TrendPoint[];
  event: string;
}

/** Daily columns with a per-day hover/focus tooltip. One series, so no legend. */
export function TrendChart({ series, event }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + innerH;
  const max = Math.max(0, ...series.map((p) => p.count));
  const ticks = niceTicks(max);
  const axisMax = ticks.at(-1)!;
  const band = series.length ? innerW / series.length : 0;
  const barW = Math.max(1, Math.min(MAX_BAR, band * 0.7, band - GAP));
  const y = (v: number) => baseline - (v / axisMax) * innerH;
  const xOf = (i: number) => MARGIN.left + i * band;
  const peak = max > 0 ? series.findIndex((p) => p.count === max) : -1;
  const labels = new Set(labelIndexes(series.length, innerW));

  function onKeyDown(e: KeyboardEvent) {
    if (!series.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => Math.min(series.length - 1, Math.max(0, (i ?? series.length - 1) + step)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  }

  const point = active !== null ? series[active] : null;
  const tipLeft = active !== null ? xOf(active) + band / 2 : 0;
  const total = series.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="chart" ref={wrapRef}>
      <div
        className="chart-plot"
        tabIndex={0}
        role="img"
        aria-label={`Daily ${event} events. ${formatNumber(total)} in total; busiest day ${
          peak >= 0 ? `${formatLongDay(series[peak].day)} with ${formatNumber(max)}` : 'none'
        }. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? series.length - 1)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
                <text className="tick" x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {formatTick(t, axisMax)}
                </text>
              </g>
            ))}

            {active !== null && (
              <rect className="hover-wash" x={xOf(active)} y={MARGIN.top} width={band} height={innerH} />
            )}

            {series.map((p, i) => (
              <path
                key={p.day}
                className={active === null || active === i ? 'bar' : 'bar bar-dim'}
                d={columnPath(xOf(i) + (band - barW) / 2, y(p.count), barW, baseline)}
              />
            ))}

            {peak >= 0 && (
              <text className="peak-label" x={xOf(peak) + band / 2} y={y(max) - 6} textAnchor="middle">
                {formatNumber(max)}
              </text>
            )}

            {series.map((p, i) =>
              labels.has(i) ? (
                <text key={p.day} className="tick" x={xOf(i) + band / 2} y={baseline + 18} textAnchor="middle">
                  {formatDay(p.day)}
                </text>
              ) : null,
            )}

            {/* Hit targets span the whole day band, not just the painted column. */}
            {series.map((p, i) => (
              <rect
                key={p.day}
                x={xOf(i)}
                y={MARGIN.top}
                width={band}
                height={innerH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>
        )}

        {point && (
          <div
            className="tooltip"
            style={{
              left: Math.min(Math.max(tipLeft, 80), width - 80),
              top: Math.max(MARGIN.top, y(point.count) - 8),
            }}
          >
            <div className="tooltip-day">{formatLongDay(point.day)}</div>
            <div className="tooltip-row">
              <span className="tooltip-key" />
              <strong>{formatNumber(point.count)}</strong>
              <span>{point.count === 1 ? 'event' : 'events'}</span>
            </div>
            <div className="tooltip-row tooltip-secondary">
              <span className="tooltip-key tooltip-key-blank" />
              <strong>{formatNumber(point.users)}</strong>
              <span>{point.users === 1 ? 'user' : 'users'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
