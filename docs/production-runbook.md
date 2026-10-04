# 33HOXO Production Runbook

## What is already built

- production Mary Jane settlement routing
- Chiado and Gnosis Shutter configuration
- persistent Postgres/Neon intent API
- reveal worker endpoint
- Solana settlement reconciliation endpoint
- external hosted SDK transport
- API-key authentication
- mainnet-beta kill switch, quantity cap and allowlists

## 1. Create the production database

Create a Neon/Postgres database and run:

`migrations/001_production.sql`

Then set:

`DATABASE_URL=...`

## 2. Secure external API access

Set one or more comma-separated API keys:

`HOXO_API_KEYS=key-one,key-two`

In `HOXO_ENV=production`, the external `/api/v1/intents` routes require a configured Bearer key.

## 3. Run the reveal worker

Set:

`CRON_SECRET=<strong random value>`

Call:

`GET /api/internal/reveal`

with:

`Authorization: Bearer <CRON_SECRET>`

on a recurring schedule. One-minute scheduling is appropriate for short reveal windows.

## 4. Production Shutter

For staging:

```
SHUTTER_NETWORK=chiado
```

For Shutter production:

```
SHUTTER_NETWORK=gnosis
SHUTTER_API_KEY=<if required for your account/deployment>
```

33HOXO uses the production Shutter API at `https://shutter-api.shutter.network`.

## 5. Mary Jane production settlement

Development:

```
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
MARYJANE_ORDER_PLACE_URL=https://maryjane-blue.vercel.app/api/order-place
```

Mainnet requires a separate real Mary Jane mainnet backend:

```
MARYJANE_MAINNET_ORDER_PLACE_URL=https://...
```

Do not point a mainnet 33HOXO deployment at the Devnet Mary Jane endpoint.

## 6. Enable mainnet beta

Mainnet remains disabled unless both flags are present:

```
ENABLE_MAINNET=true
MAINNET_ACK=I_UNDERSTAND_REAL_FUNDS
```

Also set:

```
SOLANA_CLUSTER=mainnet-beta
SOLANA_RPC_URL=<production RPC>
MAINNET_MAX_QUANTITY_BASE_UNITS=<small initial cap>
MAINNET_ALLOWED_ADAPTERS=maryjane-solana-v1
MAINNET_ALLOWED_MARKETS=<comma-separated production market IDs>
```

Start with a tiny cap and an explicit market allowlist.

## 7. External SDK

Install/package the repository and use:

```ts
import { createHosted33HoxoClient } from "@mushee/33hoxo";

const hoxo = createHosted33HoxoClient({
  baseUrl: "https://your-33hoxo-domain",
  apiKey: process.env.HOXO_API_KEY,
  shutterNetwork: "gnosis",
});

const sealed = await hoxo.sealIntent(intent);
```

## Remaining manual actions

The code is ready for these operator-owned steps:

1. create database and run migration;
2. set production secrets/env vars;
3. configure the reveal scheduler;
4. provide Mary Jane's real mainnet order endpoint;
5. fund/test the production wallet with deliberately small value;
6. enable the mainnet switch only after a successful staged transaction.
