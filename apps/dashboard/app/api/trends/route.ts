import type { NextRequest } from 'next/server';
import { errorResponse, pulseGet } from '@/lib/pulse';
import { parseRange, parseSource, type Trend } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const event = req.nextUrl.searchParams.get('event');
  if (!event || event.length > 200) return Response.json({ error: 'event is required' }, { status: 400 });
  const days = parseRange(req.nextUrl.searchParams.get('days'));
  const source = parseSource(req.nextUrl.searchParams.get('data'));

  try {
    const qs = new URLSearchParams({ event, days: String(days) });
    return Response.json(await pulseGet<Trend>(`/v1/query/trends?${qs}`, source));
  } catch (err) {
    return errorResponse(err);
  }
}
