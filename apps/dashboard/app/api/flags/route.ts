import { errorResponse, pulseGet } from '@/lib/pulse';
import type { Flag } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const { flags } = await pulseGet<{ flags: Flag[] }>('/v1/flags');
    return Response.json({ flags, adminEnabled: Boolean(process.env.DASHBOARD_ADMIN_PASSWORD) });
  } catch (err) {
    return errorResponse(err);
  }
}
