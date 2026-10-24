import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config';
import { REDIS } from '../redis/redis.module';
import { WorkerSignal } from '../worker/worker-signal';
import { BatchDto, EventDto, EventType } from './batch.dto';

export interface QueuedEvent {
  projectId: string;
  messageId: string;
  type: EventType;
  event: string;
  distinctId: string;
  userId: string | null;
  properties: Record<string, unknown>;
  traits: Record<string, unknown>;
  context: Record<string, unknown>;
  timestamp: string;
  receivedAt: string;
}

// Events recorded offline can be days old, and device clocks are often wrong.
// If the SDK sends sentAt, shift each timestamp by the device/server offset.
export function correctTimestamp(eventTime: string, sentAt: string | undefined, receivedAt: Date): Date {
  const ts = new Date(eventTime);
  if (!sentAt) return ts;
  const skewMs = receivedAt.getTime() - new Date(sentAt).getTime();
  return new Date(ts.getTime() + skewMs);
}

export function toQueuedEvent(e: EventDto, projectId: string, sentAt: string | undefined, receivedAt: Date): QueuedEvent {
  return {
    projectId,
    messageId: e.messageId,
    type: e.type,
    event: e.type === 'identify' ? '$identify' : e.event!,
    distinctId: e.distinctId,
    userId: e.userId ?? null,
    properties: e.properties ?? {},
    traits: e.traits ?? {},
    context: e.context ?? {},
    timestamp: correctTimestamp(e.timestamp, sentAt, receivedAt).toISOString(),
    receivedAt: receivedAt.toISOString(),
  };
}

@Injectable()
export class IngestService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly workerSignal: WorkerSignal,
  ) {}

  // The API only enqueues; a worker persists events. This keeps response times
  // flat under bursts and lets the database be slow or down briefly.
  async enqueue(projectId: string, body: BatchDto): Promise<number> {
    const receivedAt = new Date();
    const pipeline = this.redis.pipeline();
    for (const e of body.batch) {
      const queued = toQueuedEvent(e, projectId, body.sentAt, receivedAt);
      pipeline.xadd(this.config.streamKey, 'MAXLEN', '~', this.config.streamMaxLen, '*', 'data', JSON.stringify(queued));
    }
    const results = await pipeline.exec();
    const failed = results?.find(([err]) => err);
    if (failed) throw failed[0];
    this.workerSignal.notify();
    return body.batch.length;
  }
}
