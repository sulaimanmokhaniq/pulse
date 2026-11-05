import type { NextRequest } from 'next/server';
import { errorResponse, pulseGet } from '@/lib/pulse';
import { parseSource, type EventSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const source = parseSource(req.nextUrl.searchParams.get('data'));
  try {
    return Response.json(await pulseGet<{ events: EventSummary[] }>('/v1/query/events', source));
  } catch (err) {
    return errorResponse(err);
  }
}
