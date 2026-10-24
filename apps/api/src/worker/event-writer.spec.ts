import { QueuedEvent } from '../ingest/ingest.service';
import { clampTimestamp, monthStart, partitionName, personUpdates } from './event-writer';
import { parseEntry } from './stream-consumer';

function event(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    projectId: 'p1',
    messageId: 'm1',
    type: 'track',
    event: 'viewed',
    distinctId: 'anon-1',
    userId: null,
    properties: {},
    traits: {},
    context: {},
    timestamp: '2026-10-24T10:00:00.000Z',
    receivedAt: '2026-10-24T10:00:05.000Z',
    ...overrides,
  };
}

describe('clampTimestamp', () => {
  it('keeps plausible timestamps, including week-old offline events', () => {
    expect(clampTimestamp(event({ timestamp: '2026-10-17T10:00:00.000Z' })).timestamp).toBe('2026-10-17T10:00:00.000Z');
  });

  it('clamps far-future and ancient timestamps to receivedAt, keeping the original', () => {
    for (const ts of ['2030-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z']) {
      const e = clampTimestamp(event({ timestamp: ts }));
      expect(e.timestamp).toBe('2026-10-24T10:00:05.000Z');
      expect(e.properties.$original_timestamp).toBe(ts);
    }
  });
});

describe('partitions', () => {
  it('names monthly partitions', () => {
    expect(partitionName(monthStart(new Date('2026-02-28T23:59:59Z')))).toBe('events_y2026m02');
  });
});

describe('personUpdates', () => {
  it('collapses a batch to one row per distinct id', () => {
    const updates = personUpdates([
      event({ timestamp: '2026-10-24T10:00:00.000Z' }),
      event({ type: 'identify', event: '$identify', userId: 'u1', traits: { plan: 'pro' }, timestamp: '2026-10-24T09:00:00.000Z' }),
      event({ timestamp: '2026-10-24T11:00:00.000Z' }),
      event({ distinctId: 'anon-2' }),
    ]);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({
      distinctId: 'anon-1',
      userId: 'u1',
      traits: { plan: 'pro' },
      firstSeen: '2026-10-24T09:00:00.000Z',
      lastSeen: '2026-10-24T11:00:00.000Z',
    });
  });
});

describe('parseEntry', () => {
  it('parses a valid entry', () => {
    expect(parseEntry(['data', JSON.stringify(event())])?.event).toBe('viewed');
  });

  it('rejects malformed entries', () => {
    expect(parseEntry(['data', '{not json'])).toBeNull();
    expect(parseEntry(['other', '{}'])).toBeNull();
    expect(parseEntry(['data', JSON.stringify({ ...event(), timestamp: 'yesterday' })])).toBeNull();
  });
});
