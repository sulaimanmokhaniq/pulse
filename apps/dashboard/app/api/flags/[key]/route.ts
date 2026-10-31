import type { NextRequest } from 'next/server';
import { checkAdmin, FLAG_KEY_PATTERN, parseFlagChanges, parseNewFlag } from '@/lib/flags';
import { errorResponse, pulseRequest } from '@/lib/pulse';
import type { Flag } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ key: string }> };

const bad = (error: string, status = 400) => Response.json({ error }, { status });

async function flagKey(ctx: Ctx): Promise<string | null> {
  const { key } = await ctx.params;
  return FLAG_KEY_PATTERN.test(key) ? key : null;
}

function requireAdmin(req: NextRequest): Response | null {
  const result = checkAdmin(req.headers.get('x-admin-password'), process.env.DASHBOARD_ADMIN_PASSWORD);
  if (result === 'disabled') return bad('Creating and deleting flags is turned off on this dashboard', 403);
  if (result === 'denied') return bad('Wrong admin password', 401);
  return null;
}

/** Anyone can switch an existing flag or change its rollout: that's the demo. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const key = await flagKey(ctx);
  if (!key) return bad('Invalid flag key');
  const changes = parseFlagChanges(await req.json().catch(() => null));
  if (!changes) return bad('Send enabled (true/false) and/or rolloutPercent (0-100)');
  try {
    return Response.json(await pulseRequest<Flag>(`/v1/flags/${key}`, { method: 'PATCH', body: changes }));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Creates a flag. Admin only. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const key = await flagKey(ctx);
  if (!key) return bad('Flag keys are 1-64 characters: lowercase letters, digits, _ . -');
  const flag = parseNewFlag(await req.json().catch(() => null));
  if (!flag) return bad('Invalid flag settings');
  try {
    return Response.json(await pulseRequest<Flag>(`/v1/flags/${key}`, { method: 'PUT', body: flag }));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Deletes a flag. Admin only. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const key = await flagKey(ctx);
  if (!key) return bad('Invalid flag key');
  try {
    await pulseRequest(`/v1/flags/${key}`, { method: 'DELETE' });
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
