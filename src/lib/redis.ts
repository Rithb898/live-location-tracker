import "dotenv/config";
import Redis from 'ioredis';

const RedisClient = Redis.default || Redis;

export const publisher = new RedisClient();

export const subscriber = new RedisClient();

export const redis = new RedisClient();
