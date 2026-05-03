import type { Consumer, EachMessagePayload } from "kafkajs";
import { publisher, redis } from "./redis.js";
import { isValidLocationEvent } from "./location-validation.js";

type StartLocationConsumerArgs = {
  kafkaConsumer: Consumer;
  userTtlMs: number;
};

export async function startLocationConsumer({
  kafkaConsumer,
  userTtlMs,
}: StartLocationConsumerArgs): Promise<void> {
  await kafkaConsumer.subscribe({
    topics: ["location-updates"],
    fromBeginning: false,
  });

  await kafkaConsumer.run({
    eachMessage: async ({ message, heartbeat }: EachMessagePayload) => {
      if (!message.value) {
        await heartbeat();
        return;
      }

      const data = JSON.parse(message.value.toString());
      if (!isValidLocationEvent(data)) {
        await heartbeat();
        return;
      }

      const dedupeSet = await redis.set(
        `events:seen:${data.eventId}`,
        "1",
        "PX",
        userTtlMs * 2,
        "NX",
      );
      if (dedupeSet !== "OK") {
        await heartbeat();
        return;
      }

      const lastTimestampRaw = await redis.hget("users:lastTimestamp", data.id);
      const lastTimestamp = lastTimestampRaw ? Number(lastTimestampRaw) : 0;
      if (Number.isFinite(lastTimestamp) && data.timestamp <= lastTimestamp) {
        await heartbeat();
        return;
      }

      await redis.hset(
        "users:metadata",
        data.id,
        JSON.stringify({ id: data.id, name: data.name, color: data.color }),
      );
      await redis.hset("users:lastSeenAt", data.id, String(Date.now()));
      await redis.hset("users:lastTimestamp", data.id, String(data.timestamp));

      await publisher.publish(
        "location-updates:broadcast",
        JSON.stringify({
          id: data.id,
          latitude: data.latitude,
          longitude: data.longitude,
          name: data.name,
          color: data.color,
        }),
      );
      await heartbeat();
    },
  });
}
