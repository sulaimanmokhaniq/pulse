import { simulatedSecretKey } from './simulated-key';
import { simulateDay, stableUuid } from './simulator';

const DAY_MS = 86_400_000;
const days = (n: number, end = Date.parse('2026-11-04T00:00:00Z')) =>
  Array.from({ length: n }, (_, i) => new Date(end - i * DAY_MS).toISOString().slice(0, 10));

describe('traffic simulator', () => {
  const late = new Date('2027-01-01T00:00:00Z');

  it('simulates the same traffic for the same day', () => {
    expect(simulateDay('p', '2026-10-20', late)).toEqual(simulateDay('p', '2026-10-20', late));
  });

  it('produces valid, unique message ids', () => {
    const events = simulateDay('p', '2026-10-20', late);
    const ids = events.map((e) => e.messageId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid('x')).toBe(stableUuid('x'));
  });

  it('keeps events inside the day and before "until"', () => {
    const until = new Date('2026-10-20T12:00:00Z');
    const events = simulateDay('p', '2026-10-20', until);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.timestamp >= '2026-10-20T00:00:00').toBe(true);
      expect(Date.parse(e.timestamp)).toBeLessThanOrEqual(until.getTime());
      expect(e.context).toMatchObject({ simulated: true });
    }
  });

  it('follows the shop funnel, narrowing at each step', () => {
    const events = days(30).flatMap((d) => simulateDay('p', d, late));
    const count = (name: string) => events.filter((e) => e.event === name).length;
    const sessions = count('app_opened');
    expect(sessions).toBeGreaterThan(30 * 35);
    expect(count('product_list_viewed')).toBe(sessions);
    expect(count('checkout_started')).toBeLessThan(count('cart_viewed'));
    expect(count('purchase_completed')).toBeLessThan(count('checkout_started'));
    expect(count('purchase_completed')).toBeGreaterThan(0);
  });

  it('gives promo_banner viewers a modest purchase uplift', () => {
    const events = days(90).flatMap((d) => simulateDay('p', d, late));
    const tally = { on: { checkout: 0, purchase: 0 }, off: { checkout: 0, purchase: 0 } };
    // Purchase-per-checkout rate by banner group (anonymous sessions, joined on distinct id).
    const banner = new Map<string, boolean>();
    for (const e of events) {
      if (e.event === '$feature_flag_called') banner.set(e.distinctId, e.properties.enabled as boolean);
    }
    for (const e of events) {
      const group = banner.get(e.distinctId);
      if (group === undefined) continue;
      const t = group ? tally.on : tally.off;
      if (e.event === 'checkout_started') t.checkout++;
      if (e.event === 'purchase_completed') t.purchase++;
    }
    expect(tally.on.purchase / tally.on.checkout).toBeGreaterThan(tally.off.purchase / tally.off.checkout);
  });

  it('derives the simulated project key (shared test vector with the dashboard)', () => {
    expect(simulatedSecretKey('sk_test_vector')).toBe('sk_g3h5AezK7kjSuiMYlCP0hjEBmPnKPx8v');
    expect(simulatedSecretKey('sk_test_vector')).not.toBe(simulatedSecretKey('sk_other'));
  });
});
