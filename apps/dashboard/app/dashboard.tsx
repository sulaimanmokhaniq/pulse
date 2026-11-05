'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAverage, formatLongDay, formatNumber } from '@/lib/chart';
import { parseRange, parseSource, RANGES, type EventSummary, type Range, type Source, type Trend } from '@/lib/types';
import { getJson } from '@/lib/client';
import { DEMO_SHOP_URL, SiteHeader } from './site-header';
import { TrendChart } from './trend-chart';

const WAKING_AFTER_MS = 3_000;

type Status = 'loading' | 'waking' | 'ready' | 'error';

// Internal events like $identify are listed, but never picked by default.
const defaultEvent = (events: EventSummary[]) => (events.find((e) => !e.event.startsWith('$')) ?? events[0])?.event;

export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const days = parseRange(params.get('days'));
  const source = parseSource(params.get('data'));
  const requestedEvent = params.get('event');

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  // Separate counters so 'Try again' retries only the request that failed.
  const [eventsAttempt, setEventsAttempt] = useState(0);
  const [trendAttempt, setTrendAttempt] = useState(0);
  const latest = useRef(0);

  const event = events && (requestedEvent && events.some((e) => e.event === requestedEvent) ? requestedEvent : defaultEvent(events));

  const setQuery = useCallback(
    (next: { event?: string; days?: Range; data?: Source }) => {
      const qs = new URLSearchParams(params);
      if (next.data) qs.set('data', next.data);
      if (next.event) qs.set('event', next.event);
      if (next.days) qs.set('days', String(next.days));
      router.replace(`${pathname}?${qs}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Show a "waking up" note if the free API host is slow to respond.
  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    const id = ++latest.current;
    setStatus('loading');
    const timer = setTimeout(() => id === latest.current && setStatus('waking'), WAKING_AFTER_MS);
    try {
      const result = await work();
      if (id !== latest.current) return undefined;
      setStatus('ready');
      return result;
    } catch (err) {
      if (id === latest.current) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStatus('error');
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    setEvents(null);
    setTrend(null);
    track(() => getJson<{ events: EventSummary[] }>(`/api/events?data=${source}`)).then((res) => res && setEvents(res.events));
  }, [track, eventsAttempt, source]);

  useEffect(() => {
    if (!event) return;
    const qs = new URLSearchParams({ event, days: String(days), data: source });
    track(() => getJson<Trend>(`/api/trends?${qs}`)).then((res) => res && setTrend(res));
  }, [event, days, source, track, trendAttempt]);

  const busiest = trend?.series.reduce((best, p) => (p.count > best.count ? p : best), trend.series[0]);
  const stale = status === 'loading' || status === 'waking';

  return (
    <main className="page">
      <SiteHeader subtitle={source === 'simulated' ? 'Demo Shop project · simulated traffic' : 'Demo Shop project · live data'} />

      <div className="filters" role="toolbar" aria-label="Filters">
        <div className="segmented" role="radiogroup" aria-label="Data">
          {(['simulated', 'live'] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={s === source}
              className={s === source ? 'segment segment-on' : 'segment'}
              onClick={() => setQuery({ data: s })}
            >
              {s === 'simulated' ? 'Simulated' : 'Live'}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={r === days}
              className={r === days ? 'segment segment-on' : 'segment'}
              onClick={() => setQuery({ days: r })}
            >
              {r}d
            </button>
          ))}
        </div>
        <label className="select-label">
          <span className="visually-hidden">Event</span>
          <select
            value={event ?? ''}
            disabled={!events?.length}
            onChange={(e) => setQuery({ event: e.target.value })}
          >
            {events?.map((e) => (
              <option key={e.event} value={e.event}>
                {e.event}
              </option>
            ))}
          </select>
        </label>
        <span className="status" role="status" aria-live="polite">
          {status === 'waking' && 'Waking up the API. The free tier sleeps when idle, so this can take up to a minute…'}
        </span>
      </div>

      {status === 'error' && (
        <div className="notice notice-error">
          <p>{error}</p>
          <button className="button" onClick={() => (events ? setTrendAttempt : setEventsAttempt)((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}

      {source === 'simulated' && (
        <p className="sim-note">
          <span className="sim-badge">Simulated</span>
          <span>
            Generated traffic that mimics the demo shop, so there&apos;s always something to explore. For real events,
            switch to{' '}
            <button className="inline-link" onClick={() => setQuery({ data: 'live' })}>
              Live
            </button>
            .
          </span>
        </p>
      )}

      {events && events.length === 0 && (
        <div className="notice">
          <p>No events yet.</p>
          <p>
            Open the{' '}
            <a href={DEMO_SHOP_URL} target="_blank" rel="noreferrer">
              demo shop
            </a>
            , tap around and buy something, then refresh this page.
          </p>
        </div>
      )}

      {trend && (
        <div className={stale ? 'content content-stale' : 'content'}>
          <section className="hero">
            <div className="hero-value">{formatNumber(trend.total)}</div>
            <div className="hero-label">
              <code>{trend.event}</code> events in the last {trend.days} days
            </div>
          </section>

          <section className="tiles">
            <div className="tile">
              <div className="tile-label">Unique users</div>
              <div className="tile-value">{formatNumber(trend.users)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Daily average</div>
              <div className="tile-value">{formatAverage(trend.total, trend.days)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Busiest day</div>
              <div className="tile-value">{busiest && busiest.count > 0 ? formatLongDay(busiest.day) : '–'}</div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                Daily <code>{trend.event}</code> events
              </h2>
              <span className="card-note">UTC days</span>
            </div>
            <TrendChart series={trend.series} event={trend.event} />
            <details className="table-view">
              <summary>Show as table</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Events</th>
                    <th scope="col">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend.series].reverse().map((p) => (
                    <tr key={p.day}>
                      <td>{formatLongDay(p.day)}</td>
                      <td>{formatNumber(p.count)}</td>
                      <td>{formatNumber(p.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        </div>
      )}

      <footer className="footer">
        Live events flow from the demo shop through the Pulse Dart SDK, ingestion API, Redis Streams and a worker into
        Postgres. Simulated traffic is kept in its own project and never mixed with live data. Unique users count an
        anonymous visitor and their signed-in account once.
      </footer>
    </main>
  );
}
