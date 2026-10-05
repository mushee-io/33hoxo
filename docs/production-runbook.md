# 33HOXO Production Runbook

## Built

- persistent Neon/Postgres intent network
- wallet-signed first-party authentication
- owner-bound cancellation, reveal and settlement
- API-key authentication for trusted external integrators
- on-demand server reveal plus background reveal worker
- production Mary Jane settlement routing
- Chiado/Gnosis Shutter switching
- hosted SDK transport
- mainnet-beta kill switch, quantity cap and allowlists
- production readiness endpoint

## 1. Database

Create Neon/Postgres and run:

`migrations/001_production.sql`

Set:

`DATABASE_URL=...`

## 2. Wallet auth

Generate a strong random secret and set:

`HOXO_AUTH_SECRET=...`

The browser obtains a short-lived signed challenge, asks the connected Solana wallet to sign it, and sends the proof to write/cancel/reveal/settlement routes.

## 3. External API keys

For trusted SDK/server integrations:

`HOXO_API_KEYS=key-one,key-two`

This is separate from end-user wallet authentication.

## 4. Background reveal

Set:

`CRON_SECRET=...`

The worker endpoint is:

`GET /api/internal/reveal`

with:

`Authorization: Bearer <CRON_SECRET>`

Active users can also call the owner-authenticated per-intent reveal endpoint after reveal time, so browser settlement does not depend on the cron firing first.

### Vercel Hobby limitation

The current Vercel team is on Hobby. Hobby Cron is only suitable for daily scheduling; 33HOXO needs minute-level background reveals for production. Either:

- upgrade the Vercel project/team to Pro and schedule the reveal worker every minute; or
- run the same authenticated endpoint from an external scheduler/worker every minute.

Do not rely on once-daily Hobby Cron for market execution.

## 5. Shutter production

Staging:

```
HOXO_ENV=staging
SHUTTER_NETWORK=chiado
```

Production:

```
HOXO_ENV=production
SHUTTER_NETWORK=gnosis
SHUTTER_API_KEY=<if required>
```

Each envelope stores its own Shutter network, so older Chiado commitments can still reveal after production switches to Gnosis.

## 6. Solana staging

```
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
MARYJANE_ORDER_PLACE_URL=https://maryjane-blue.vercel.app/api/order-place
```

## 7. Mainnet beta

First provide a real Mary Jane mainnet order endpoint:

`MARYJANE_MAINNET_ORDER_PLACE_URL=https://...`

Then configure:

```
SOLANA_CLUSTER=mainnet-beta
SOLANA_RPC_URL=<production RPC>
MAINNET_MAX_QUANTITY_BASE_UNITS=<small initial cap>
MAINNET_ALLOWED_ADAPTERS=maryjane-solana-v1
MAINNET_ALLOWED_MARKETS=<specific production market IDs>
```

Only after a successful staged test enable:

```
ENABLE_MAINNET=true
MAINNET_ACK=I_UNDERSTAND_REAL_FUNDS
```

## 8. Readiness

Open:

`GET /api/readiness`

Production is not considered ready until it returns:

`"ready": true`

No secret values are returned, only missing/configured checks.

## 9. Final launch sequence

1. database migration
2. staging env vars
3. wallet-authenticated persistent intent
4. server reveal
5. Mary Jane Devnet settlement
6. background reveal scheduler
7. switch Shutter to Gnosis
8. repeat on Solana Devnet
9. provide Mary Jane mainnet backend
10. configure tiny mainnet limits and allowlist
11. enable mainnet gate
12. one deliberately small mainnet transaction
13. inspect logs/readiness
14. gradually raise limits
