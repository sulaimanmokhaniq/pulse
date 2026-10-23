export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  streamKey: string;
  streamMaxLen: number;
  rateLimitPerMinute: number;
  maxBodyBytes: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    streamKey: process.env.STREAM_KEY ?? 'pulse:events',
    // Approximate cap on the stream so a stalled worker cannot exhaust Redis memory.
    streamMaxLen: Number(process.env.STREAM_MAXLEN ?? 100_000),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600),
    maxBodyBytes: process.env.MAX_BODY_BYTES ?? '512kb',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
