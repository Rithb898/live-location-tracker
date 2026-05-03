import { Kafka } from 'kafkajs';

export const kafkaClient = new Kafka({
  clientId: 'live-location-tracker',
  brokers: ['localhost:9092'],
});
