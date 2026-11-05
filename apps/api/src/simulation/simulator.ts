import { createHash } from 'crypto';
import { isInRollout } from '../flags/bucket';
import { QueuedEvent } from '../ingest/ingest.service';

const DAY_MS = 86_400_000;

const PRODUCTS = [
  { productId: 'sku-coffee', name: 'Saudi Coffee Beans', price: 45, category: 'grocery' },
  { productId: 'sku-dates', name: 'Sukkari Dates Box', price: 60, category: 'grocery' },
  { productId: 'sku-oud', name: 'Oud Perfume', price: 220, category: 'beauty' },
  { productId: 'sku-sandals', name: 'Leather Sandals', price: 180, category: 'fashion' },
  { productId: 'sku-dallah', name: 'Brass Dallah', price: 150, category: 'home' },
  { productId: 'sku-earbuds', name: 'Wireless Earbuds', price: 299, category: 'electronics' },
];

const OS = ['android', 'android', 'ios', 'ios', 'web'];

// Visitors come back: ids are drawn from a fixed pool, so unique users grow
// slower than sessions, like in a real shop.
const VISITOR_POOL = 4000;
const SIGNED_IN_POOL = 600;

/** Small, fast, seedable PRNG so a given day always simulates the same traffic. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  return createHash('sha1').update(text).digest().readUInt32BE(0);
}

/** Deterministic UUID (version 5 layout), so re-running a day inserts nothing new. */
export function stableUuid(text: string): string {
  const b = createHash('sha1').update(`pulse-sim:${text}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Sessions on a given day: weekly rhythm (busier Thursday to Saturday), slow growth, noise. */
export function sessionsFor(day: string, rand: () => number): number {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = [1.0, 0.95, 0.95, 1.0, 1.25, 1.35, 1.15][date.getUTCDay()];
  const daysSinceLaunch = Math.max(0, (date.getTime() - Date.UTC(2026, 7, 1)) / DAY_MS);
  const growth = 1 + Math.min(daysSinceLaunch, 365) * 0.004;
  return Math.round(45 * weekday * growth * (0.85 + rand() * 0.3));
}

// Most traffic in the Saudi evening (UTC+3), so 15:00-20:00 UTC.
const HOUR_WEIGHTS = [2, 1, 1, 1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 7, 8, 10, 11, 12, 12, 11, 9, 6, 4, 3];
const HOUR_TOTAL = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

function pickHour(rand: () => number): number {
  let r = rand() * HOUR_TOTAL;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h];
    if (r < 0) return h;
  }
  return 23;
}

/**
 * One day of demo-shop traffic for the simulated project. Follows the same
 * funnel and event names as the real demo shop, including the promo_banner
 * flag (50% rollout) with a modest uplift in purchases for people who saw it.
 * Events after `until` are left out, so today fills in as the day goes on.
 */
export function simulateDay(projectId: string, day: string, until: Date = new Date()): QueuedEvent[] {
  const rand = mulberry32(seedFrom(day));
  const events: QueuedEvent[] = [];
  const sessions = sessionsFor(day, rand);
  const dayStart = Date.parse(`${day}T00:00:00Z`);

  for (let s = 0; s < sessions; s++) {
    let t = dayStart + pickHour(rand) * 3_600_000 + Math.floor(rand() * 3_600_000);
    const anonId = `sim-anon-${Math.floor(rand() * VISITOR_POOL)}`;
    const os = OS[Math.floor(rand() * OS.length)];
    let distinctId = anonId;
    let userId: string | null = null;
    let n = 0;

    const emit = (event: string, properties: Record<string, unknown> = {}, type: 'track' | 'identify' = 'track') => {
      t += 2_000 + Math.floor(rand() * 40_000);
      const ts = new Date(t).toISOString();
      events.push({
        projectId,
        messageId: stableUuid(`${day}:${s}:${n++}`),
        type,
        event,
        distinctId: type === 'identify' ? anonId : distinctId,
        userId,
        properties,
        traits: type === 'identify' ? { plan: rand() < 0.2 ? 'pro' : 'free', country: 'SA' } : {},
        context: { library: { name: 'pulse-simulator', version: '1' }, os, simulated: true },
        timestamp: ts,
        receivedAt: ts,
      });
    };

    emit('app_opened');
    const sawBanner = isInRollout('promo_banner', distinctId, 50);
    emit('$feature_flag_called', { flag: 'promo_banner', enabled: sawBanner });
    emit('product_list_viewed', { count: PRODUCTS.length });

    if (rand() < 0.15) {
      userId = `sim-user-${Math.floor(rand() * SIGNED_IN_POOL)}`;
      emit('$identify', {}, 'identify');
      distinctId = userId;
      emit('signed_in');
    }

    if (rand() > 0.72) continue;
    const viewed = PRODUCTS.filter(() => rand() < 0.35);
    if (viewed.length === 0) viewed.push(PRODUCTS[Math.floor(rand() * PRODUCTS.length)]);
    for (const p of viewed) emit('product_viewed', p);

    const cart = viewed.filter(() => rand() < 0.42);
    if (cart.length === 0) continue;
    cart.forEach((p, i) => emit('added_to_cart', { ...p, cartSize: i + 1 }));

    const total = cart.reduce((sum, p) => sum + p.price, 0);
    if (rand() > 0.8) continue;
    emit('cart_viewed', { items: cart.length, total });
    if (rand() > 0.62) continue;
    emit('checkout_started', { items: cart.length, total, currency: 'SAR' });
    if (rand() > (sawBanner ? 0.78 : 0.66)) continue;
    emit('purchase_completed', { items: cart.length, revenue: total, currency: 'SAR' });
  }

  const cutoff = until.getTime();
  return events.filter((e) => Date.parse(e.timestamp) <= cutoff).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
