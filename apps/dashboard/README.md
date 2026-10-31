# Pulse dashboard

Next.js (App Router) dashboard: daily trends for any event, and feature flags.

```bash
cp .env.example .env.local   # PULSE_API_URL and a secret sk_ key
npm ci
npm run dev                  # http://localhost:3000 (use -p 3001 if the API is on 3000)
npm test                     # chart helper tests
```

- `app/api/*` are server routes that call the Pulse query API with
  `PULSE_SECRET_KEY`. The key never reaches the browser.
- `app/dashboard.tsx` keeps the selected event and range in the URL, so views
  can be shared. It retries while a sleeping free-tier API wakes up.
- `app/flags/flags.tsx` is the flags page. Anyone can switch a flag or move its
  rollout; creating and deleting need `DASHBOARD_ADMIN_PASSWORD`, checked in
  `app/api/flags/[key]/route.ts`.
- `app/trend-chart.tsx` is a dependency-free SVG column chart with hover and
  keyboard tooltips and a table view.

Deploying on Vercel: see [docs/deploy.md](../../docs/deploy.md#6-vercel-dashboard).
