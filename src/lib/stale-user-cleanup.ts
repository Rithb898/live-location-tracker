import { publisher, redis } from "./redis.js";

type StartStaleUserCleanupArgs = {
  userTtlMs: number;
  staleCleanupIntervalMs: number;
};

export function startStaleUserCleanup({
  userTtlMs,
  staleCleanupIntervalMs,
}: StartStaleUserCleanupArgs): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Date.now();
    const usersLastSeen = await redis.hgetall("users:lastSeenAt");
    for (const [userId, lastSeenAtRaw] of Object.entries(usersLastSeen)) {
      const lastSeenAt = Number(lastSeenAtRaw);
      if (!Number.isFinite(lastSeenAt)) continue;
      if (now - lastSeenAt <= userTtlMs) continue;

      const userData = await redis.hget("users:metadata", userId);
      const staleUser = userData ? JSON.parse(userData) : null;

      await redis.hdel("users:metadata", userId);
      await redis.hdel("users:lastSeenAt", userId);
      await redis.hdel("users:lastTimestamp", userId);
      await publisher.publish(
        "location-updates:disconnect",
        JSON.stringify({
          id: userId,
          name: staleUser?.name || "Anonymous",
        }),
      );
    }
  }, staleCleanupIntervalMs);
}
