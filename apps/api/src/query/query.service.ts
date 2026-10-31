import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';

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

const EVENT_LIST_DAYS = 90;

// Days are UTC calendar days, matching the rollup table.
function utcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class QueryService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Events seen in the last 90 days, most frequent first. */
  async listEvents(projectId: string): Promise<EventSummary[]> {
    const { rows } = await this.pool.query<{ event: string; total: string; last_seen: string }>(
      `SELECT event, SUM(count) AS total, MAX(day)::text AS last_seen
       FROM daily_event_counts
       WHERE project_id = $1 AND day >= $2::date
       GROUP BY event
       ORDER BY total DESC, event`,
      [projectId, utcDay(-(EVENT_LIST_DAYS - 1))],
    );
    return rows.map((r) => ({ event: r.event, total: Number(r.total), lastSeen: r.last_seen }));
  }

  /**
   * Daily counts and unique users for one event, zero-filled so the chart has
   * a bar slot for every day. Counts come from the rollup table; users come
   * from raw events, with anonymous ids resolved to their identified user so
   * someone who signs in mid-day counts once.
   */
  async trend(projectId: string, event: string, days: number): Promise<Trend> {
    const from = utcDay(-(days - 1));
    const to = utcDay(0);
    const params = [projectId, event, from, to];

    const [series, totals] = await Promise.all([
      this.pool.query<{ day: string; count: string; users: string }>(
        `WITH users AS (
           SELECT (e.timestamp AT TIME ZONE 'UTC')::date AS day,
                  COUNT(DISTINCT COALESCE(p.user_id, e.distinct_id)) AS users
           FROM events e
           LEFT JOIN persons p ON p.project_id = e.project_id AND p.distinct_id = e.distinct_id
           WHERE e.project_id = $1 AND e.event = $2
             AND e.timestamp >= $3::date AND e.timestamp < $4::date + 1
           GROUP BY 1
         )
         SELECT d::date::text AS day, COALESCE(c.count, 0) AS count, COALESCE(u.users, 0) AS users
         FROM generate_series($3::date, $4::date, interval '1 day') AS d
         LEFT JOIN daily_event_counts c ON c.project_id = $1 AND c.event = $2 AND c.day = d::date
         LEFT JOIN users u ON u.day = d::date
         ORDER BY d`,
        params,
      ),
      this.pool.query<{ users: string }>(
        `SELECT COUNT(DISTINCT COALESCE(p.user_id, e.distinct_id)) AS users
         FROM events e
         LEFT JOIN persons p ON p.project_id = e.project_id AND p.distinct_id = e.distinct_id
         WHERE e.project_id = $1 AND e.event = $2
           AND e.timestamp >= $3::date AND e.timestamp < $4::date + 1`,
        params,
      ),
    ]);

    const points = series.rows.map((r) => ({ day: r.day, count: Number(r.count), users: Number(r.users) }));
    return {
      event,
      days,
      from,
      to,
      total: points.reduce((sum, p) => sum + p.count, 0),
      users: Number(totals.rows[0].users),
      series: points,
    };
  }
}
