import { Kafka } from 'kafkajs';

export const kafkaClient = new Kafka({
  clientId: 'live-location-tracker',
  brokers: ['141.148.217.25:9092'],
});
