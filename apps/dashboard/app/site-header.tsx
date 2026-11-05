'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const DEMO_SHOP_URL = 'https://sulaimanmokhaniq.github.io/pulse/';

const TABS = [
  { href: '/', label: 'Trends' },
  { href: '/flags', label: 'Feature flags' },
];

export function SiteHeader({ subtitle = 'Demo Shop project · live data' }: { subtitle?: string }) {
  const pathname = usePathname();
  return (
    <>
      <header className="header">
        <div>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Pulse
          </div>
          <p className="subtitle">{subtitle}</p>
        </div>
        <nav className="links" aria-label="External">
          <a href={DEMO_SHOP_URL} target="_blank" rel="noreferrer">
            Open demo shop
          </a>
          <a href="https://github.com/sulaimanmokhaniq/pulse" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={pathname === t.href ? 'tab tab-on' : 'tab'}
            aria-current={pathname === t.href ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
