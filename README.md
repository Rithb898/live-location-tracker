# Live Location Tracker

Real-time location sharing system with Socket.IO + Kafka where authenticated users share their movement and see others on a map.

## Core Flow (Kafka as Source of Truth)

1. Authenticated user sends `client:location:update` via Socket.IO.
2. Socket server validates payload and publishes event to Kafka topic `location-updates`.
3. Kafka consumer (socket broadcaster group) consumes event, deduplicates, stale-checks ordering, and then broadcasts to all clients.
4. Kafka consumer (database processor group) independently consumes same topic for persistence/logging.

Socket server does **not** directly broadcast raw client payload before Kafka processing. Kafka is the authoritative event stream.

## Consumer Groups and Roles

- `socket-server-<PORT>`:
  - Purpose: fan-out processed location events to connected users.
  - Handles dedupe (`eventId`) and stale ordering checks (`timestamp` per user).
  - Updates active user metadata and liveness cache.
- `database-processor`:
  - Purpose: persistence/logging pipeline for location history.
  - Independent from websocket fan-out, so DB pressure does not block real-time UI updates.

## Duplicate and Stale Handling

- Every location event carries:
  - `eventId` (UUID)
  - `timestamp` (ms epoch)
- Duplicate handling:
  - Redis key `events:seen:<eventId>` set with NX + TTL.
  - If key already exists, event is ignored.
- Stale ordering handling:
  - Redis hash `users:lastTimestamp` tracks last processed timestamp per user.
  - If incoming timestamp is older/equal, event is ignored.
- Stale user cleanup:
  - Redis hash `users:lastSeenAt` tracks last valid event time.
  - Background cleanup removes users inactive beyond `USER_TTL_MS` and broadcasts disconnect.

## Validation Rules

Server rejects invalid payloads before Kafka publish:

- `latitude`: finite number in `[-90, 90]`
- `longitude`: finite number in `[-180, 180]`
- `name` (optional): non-empty string, max 80 chars
- `color` (optional): hex format `#RRGGBB`
- `eventId` (optional): non-empty string
- `timestamp` (optional): finite number

## Environment

- `PORT` default `8888`
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `SESSION_SECRET`
- `USER_TTL_MS` default `15000`
- `STALE_CLEANUP_INTERVAL_MS` default `5000`
