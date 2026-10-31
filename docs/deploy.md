# Deploying Pulse for free

Phase 1 runs on free tiers only:

| Piece | Service | Notes |
| --- | --- | --- |
| API and worker | Render (free web service) | Sleeps after ~15 min idle; first request after that takes 30 to 60 s |
| PostgreSQL | Neon (free) | ~0.5 GB storage |
| Redis | Upstash (free) | Monthly command quota; the worker backs off while idle to stay well inside it |
| Dashboard | Vercel (Hobby) | Server routes call the API with the secret key |

Pick Frankfurt (`eu-central-1`) for all three. It's the closest region to the
Gulf that all three offer, and keeping them together keeps latency low.

The worker lives inside the API process. When Render puts the service to
sleep, the worker sleeps too. That's fine, because events only arrive through
the API, and a request wakes both. The SDK's retry and offline queue absorb the
cold start.

## 1. Neon (Postgres)

1. Sign up at neon.tech with GitHub and create a project named `pulse` in AWS Frankfurt.
2. Copy the **pooled** connection string. It looks like
   `postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

## 2. Upstash (Redis)

1. Sign up at upstash.com with GitHub and create a Redis database in `eu-central-1`.
   Leave eviction **off**: queued events must never be evicted.
2. Copy the `rediss://` connection URL. The double "s" means TLS.

## 3. API key

Generate the key the demo app will use. In a terminal (macOS or Linux, nothing to install):

```bash
echo "pk_$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')"
```

Or, if you have Node.js:

```bash
node -e "console.log('pk_' + require('crypto').randomBytes(24).toString('base64url'))"
```

Copy the whole output, including `pk_`.

Keep it somewhere safe. It goes into Render below and later into the demo app.

## 4. Render (API)

1. Sign up at render.com with GitHub.
2. **New → Blueprint**, pick the `pulse` repo. Render reads `render.yaml`.
3. Paste `DATABASE_URL` (Neon), `REDIS_URL` (Upstash) and `SEED_API_KEY` (step 3) when prompted.
4. Deploy. On startup the API runs migrations and seeds the "Demo Shop" project.

Check it:

```bash
curl https://pulse-api-xxxx.onrender.com/health
# {"ok":true,"db":true,"redis":true}
```

Every push to `main` redeploys.

## 5. Secret key for the dashboard

The dashboard reads data with a secret `sk_` key. Unlike the `pk_` ingest key
it can read everything, so it must never ship in an app or a browser.

```bash
echo "sk_$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')"
```

In Render, open the service → **Environment** → add `SEED_SECRET_KEY` with that
value → **Save, rebuild and deploy**. On startup the API registers it for the
Demo Shop project. An `sk_` key is rejected by `/v1/batch`, and a `pk_` key is
rejected by `/v1/query`.

## 6. Vercel (dashboard)

1. Sign up at vercel.com with GitHub.
2. **Add New → Project**, import the `pulse` repo.
3. Set **Root Directory** to `apps/dashboard`. Vercel detects Next.js.
4. Under **Environment Variables** add:
   - `PULSE_API_URL` = your Render URL, e.g. `https://pulse-api-xxxx.onrender.com`
   - `PULSE_SECRET_KEY` = the `sk_` key from step 5
5. Deploy.

The browser only talks to the dashboard's own `/api/*` routes, which add the
key on the server. If the API is asleep, the dashboard shows "waking up" and
retries until Render has started it.

## Moving to paid hosting later

Nothing in the code is tied to these providers. To move to Railway or a VPS in
KSA, run the same Docker image with the same environment variables. If the
worker should run as its own process, start one copy with
`WORKER_ENABLED=false` (the API) and another as the worker. Consumer groups let
several workers share the stream safely.
