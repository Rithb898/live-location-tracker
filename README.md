# Live Location Tracker

Real-time location tracking app where authenticated users share live location and see other users move on a map.

## Live Demo

- https://live-location-tracker.rithbanerjee.site/

## How It Works

1. User logs in via OIDC.
2. Frontend sends location updates over Socket.IO.
3. Backend validates events and publishes to Kafka topic `location-updates`.
4. Socket consumer broadcasts updates to connected clients.
5. Database processor consumes the same stream for persistence/logging.

## Stack

- Node.js + TypeScript + Express + Socket.IO
- Kafka (`kafkajs`)
- Redis (`ioredis`)
- OIDC/OAuth 2.0
- Leaflet

## Run Locally

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

Run processor in another terminal:

```bash
pnpm tsx src/lib/database-processor.ts
```

## Environment

See [`.env.example`](/home/ubuntu/cohort/live-location-tracker/.env.example).

Required:

- `SESSION_SECRET`
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `KAFKA_BROKERS`
- `REDIS_URL`

Optional:

- `PORT` (default `8888`)
- `USER_TTL_MS` (default `15000`)
- `STALE_CLEANUP_INTERVAL_MS` (default `5000`)
