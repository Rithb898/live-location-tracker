import "dotenv/config";
import Redis from 'ioredis';

const RedisClient = Redis.default || Redis;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const publisher = new RedisClient(redisUrl);

export const subscriber = new RedisClient(redisUrl);

export const redis = new RedisClient(redisUrl);

for (const [name, client] of [
  ["publisher", publisher],
  ["subscriber", subscriber],
  ["redis", redis],
] as const) {
  client.on("error", (error) => {
    console.error(`[redis:${name}] connection error:`, error.message);
  });
}
