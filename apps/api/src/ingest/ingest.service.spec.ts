import { correctTimestamp, toQueuedEvent } from './ingest.service';

describe('correctTimestamp', () => {
  const receivedAt = new Date('2026-10-23T12:00:00.000Z');

  it('returns the event time unchanged when sentAt is missing', () => {
    expect(correctTimestamp('2026-10-23T11:00:00.000Z', undefined, receivedAt).toISOString()).toBe(
      '2026-10-23T11:00:00.000Z',
    );
  });

  it('shifts by the device clock offset', () => {
    // Device clock is 5 minutes fast: it thinks it sent at 12:05.
    const corrected = correctTimestamp('2026-10-23T11:05:00.000Z', '2026-10-23T12:05:00.000Z', receivedAt);
    expect(corrected.toISOString()).toBe('2026-10-23T11:00:00.000Z');
  });
});

describe('toQueuedEvent', () => {
  const base = {
    messageId: '6f1c7d0e-2b4a-4c55-9a1e-3d2f8b7c6a51',
    distinctId: 'anon-1',
    timestamp: '2026-10-23T11:00:00.000Z',
  };

  it('names identify events $identify and keeps traits', () => {
    const q = toQueuedEvent({ ...base, type: 'identify', userId: 'u1', traits: { plan: 'pro' } }, 'p1', undefined, new Date());
    expect(q.event).toBe('$identify');
    expect(q.userId).toBe('u1');
    expect(q.traits).toEqual({ plan: 'pro' });
  });

  it('defaults optional objects to empty', () => {
    const q = toQueuedEvent({ ...base, type: 'track', event: 'checkout' }, 'p1', undefined, new Date());
    expect(q).toMatchObject({ projectId: 'p1', event: 'checkout', properties: {}, context: {}, userId: null });
  });
});
