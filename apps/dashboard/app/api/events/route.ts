import { errorResponse, pulseGet } from '@/lib/pulse';
import type { EventSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await pulseGet<{ events: EventSummary[] }>('/v1/query/events'));
  } catch (err) {
    return errorResponse(err);
  }
}
