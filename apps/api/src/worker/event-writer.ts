import { Pool, PoolClient } from 'pg';
import { QueuedEvent } from '../ingest/ingest.service';

const DAY_MS = 86_400_000;
// Accept events up to a year old (offline devices) and a day ahead (clock
// drift that skew correction missed). Anything else is clamped to receivedAt,
// which keeps rows out of the default partition.
const MAX_AGE_MS = 365 * DAY_MS;
const MAX_FUTURE_MS = DAY_MS;

export function clampTimestamp(e: QueuedEvent): QueuedEvent {
  const ts = Date.parse(e.timestamp);
  const received = Date.parse(e.receivedAt);
  if (ts >= received - MAX_AGE_MS && ts <= received + MAX_FUTURE_MS) return e;
  return { ...e, timestamp: e.receivedAt, properties: { ...e.properties, $original_timestamp: e.timestamp } };
}

export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function partitionName(month: Date): string {
  const mm = String(month.getUTCMonth() + 1).padStart(2, '0');
  return `events_y${month.getUTCFullYear()}m${mm}`;
}

export class PartitionManager {
  private readonly known = new Set<string>();

  constructor(private readonly pool: Pool) {}

  async ensureFor(timestamps: Date[]): Promise<void> {
    const months = new Map<string, Date>();
    for (const ts of timestamps) {
      const m = monthStart(ts);
      months.set(partitionName(m), m);
    }
    for (const [name, start] of months) {
      if (this.known.has(name)) continue;
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      try {
        await this.pool.query(
          `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF events
           FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
        );
      } catch (err: any) {
        // Another consumer created it at the same moment.
        if (err.code !== '42P07' && err.code !== '23505') throw err;
      }
      this.known.add(name);
    }
  }
}

interface PersonUpdate {
  distinctId: string;
  userId: string | null;
  traits: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
}

// Collapse a batch to one row per distinct id; Postgres rejects an upsert that
// touches the same row twice in one statement.
export function personUpdates(events: QueuedEvent[]): PersonUpdate[] {
  const byId = new Map<string, PersonUpdate>();
  for (const e of events) {
    const p = byId.get(e.distinctId) ?? {
      distinctId: e.distinctId,
      userId: null,
      traits: {},
      firstSeen: e.timestamp,
      lastSeen: e.timestamp,
    };
    if (e.userId) p.userId = e.userId;
    if (e.type === 'identify') Object.assign(p.traits, e.traits);
    if (e.timestamp < p.firstSeen) p.firstSeen = e.timestamp;
    if (e.timestamp > p.lastSeen) p.lastSeen = e.timestamp;
    byId.set(e.distinctId, p);
  }
  return [...byId.values()];
}

export interface WriteResult {
  inserted: number;
  duplicates: number;
}

// Writes one batch atomically. Rollups are computed only from rows that were
// actually inserted, so redelivered messages never double-count.
export async function writeEvents(pool: Pool, events: QueuedEvent[]): Promise<WriteResult> {
  if (events.length === 0) return { inserted: 0, duplicates: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await insertEvents(client, events);
    await upsertRollups(client, inserted);
    await upsertPersons(client, events);
    await client.query('COMMIT');
    return { inserted: inserted.length, duplicates: events.length - inserted.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function insertEvents(client: PoolClient, events: QueuedEvent[]) {
  const fresh = await client.query<{ message_id: string }>(
    `INSERT INTO event_ids (project_id, message_id)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(project_id uuid, message_id uuid)
     ON CONFLICT DO NOTHING
     RETURNING message_id`,
    [JSON.stringify(events.map((e) => ({ project_id: e.projectId, message_id: e.messageId })))],
  );
  const freshIds = new Set(fresh.rows.map((r) => r.message_id));
  const toInsert = events.filter((e) => freshIds.delete(e.messageId));
  if (toInsert.length === 0) return [];

  const { rows } = await client.query<{ project_id: string; event: string; day: string }>(
    `INSERT INTO events (project_id, message_id, type, event, distinct_id, user_id, properties, context, timestamp, received_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(
       project_id uuid, message_id uuid, type text, event text, distinct_id text, user_id text,
       properties jsonb, context jsonb, timestamp timestamptz, received_at timestamptz)
     RETURNING project_id, event, (timestamp AT TIME ZONE 'UTC')::date::text AS day`,
    [
      JSON.stringify(
        toInsert.map((e) => ({
          project_id: e.projectId,
          message_id: e.messageId,
          type: e.type,
          event: e.event,
          distinct_id: e.distinctId,
          user_id: e.userId,
          properties: e.properties,
          context: e.context,
          timestamp: e.timestamp,
          received_at: e.receivedAt,
        })),
      ),
    ],
  );
  return rows;
}

async function upsertRollups(client: PoolClient, rows: { project_id: string; event: string; day: string }[]) {
  if (rows.length === 0) return;
  const counts = new Map<string, { project_id: string; event: string; day: string; count: number }>();
  for (const r of rows) {
    const key = `${r.project_id}|${r.event}|${r.day}`;
    const c = counts.get(key) ?? { ...r, count: 0 };
    c.count++;
    counts.set(key, c);
  }
  await client.query(
    `INSERT INTO daily_event_counts (project_id, event, day, count)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(project_id uuid, event text, day date, count bigint)
     ON CONFLICT (project_id, event, day) DO UPDATE SET count = daily_event_counts.count + EXCLUDED.count`,
    [JSON.stringify([...counts.values()])],
  );
}

async function upsertPersons(client: PoolClient, events: QueuedEvent[]) {
  const byProject = new Map<string, QueuedEvent[]>();
  for (const e of events) byProject.set(e.projectId, [...(byProject.get(e.projectId) ?? []), e]);
  for (const [projectId, projectEvents] of byProject) {
    await client.query(
      `INSERT INTO persons (project_id, distinct_id, user_id, traits, first_seen, last_seen)
       SELECT $1, t.distinct_id, t.user_id, t.traits, t.first_seen, t.last_seen
       FROM jsonb_to_recordset($2::jsonb) AS t(
         distinct_id text, user_id text, traits jsonb, first_seen timestamptz, last_seen timestamptz)
       ON CONFLICT (project_id, distinct_id) DO UPDATE SET
         user_id    = COALESCE(EXCLUDED.user_id, persons.user_id),
         traits     = persons.traits || EXCLUDED.traits,
         first_seen = LEAST(persons.first_seen, EXCLUDED.first_seen),
         last_seen  = GREATEST(persons.last_seen, EXCLUDED.last_seen)`,
      [
        projectId,
        JSON.stringify(
          personUpdates(projectEvents).map((p) => ({
            distinct_id: p.distinctId,
            user_id: p.userId,
            traits: p.traits,
            first_seen: p.firstSeen,
            last_seen: p.lastSeen,
          })),
        ),
      ],
    );
  }
}
