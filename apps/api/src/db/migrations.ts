export interface Migration {
  id: string;
  sql: string;
}

// Append-only. Never edit a migration that has shipped; add a new one instead.
export const migrations: Migration[] = [
  {
    id: '001_init',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE projects (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        text NOT NULL UNIQUE,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE api_keys (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        key_hash    text NOT NULL UNIQUE,
        key_prefix  text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        revoked_at  timestamptz
      );
      CREATE INDEX api_keys_project_idx ON api_keys (project_id);

      -- Raw events, range-partitioned by event time. Monthly partitions are
      -- created by the worker; the default partition catches anything else.
      CREATE TABLE events (
        project_id   uuid NOT NULL,
        message_id   uuid NOT NULL,
        type         text NOT NULL,
        event        text NOT NULL,
        distinct_id  text NOT NULL,
        user_id      text,
        properties   jsonb NOT NULL DEFAULT '{}'::jsonb,
        context      jsonb NOT NULL DEFAULT '{}'::jsonb,
        timestamp    timestamptz NOT NULL,
        received_at  timestamptz NOT NULL,
        PRIMARY KEY (project_id, timestamp, message_id)
      ) PARTITION BY RANGE (timestamp);
      CREATE TABLE events_default PARTITION OF events DEFAULT;
      CREATE INDEX events_project_event_time_idx ON events (project_id, event, timestamp);

      CREATE TABLE persons (
        project_id   uuid NOT NULL,
        distinct_id  text NOT NULL,
        user_id      text,
        traits       jsonb NOT NULL DEFAULT '{}'::jsonb,
        first_seen   timestamptz NOT NULL,
        last_seen    timestamptz NOT NULL,
        PRIMARY KEY (project_id, distinct_id)
      );
    `,
  },
];
