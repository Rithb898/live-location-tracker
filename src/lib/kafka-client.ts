import { Kafka } from 'kafkajs';

const kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

export const kafkaClient = new Kafka({
  clientId: 'live-location-tracker',
  brokers: kafkaBrokers,
});
