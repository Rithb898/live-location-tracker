import "dotenv/config";
import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";
import { kafkaClient } from "./lib/kafka-client.js";
import { publisher, redis, subscriber } from "./lib/redis.js";

const PORT = process.env.PORT ?? 8888;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const kafkaProducer = kafkaClient.producer();
await kafkaProducer.connect();

const kafkaConsumer = kafkaClient.consumer({
  groupId: `socket-server-${PORT}`,
});
await kafkaConsumer.connect();

await kafkaConsumer.subscribe({
  topics: ["location-updates"],
  fromBeginning: false,
});

kafkaConsumer.run({
  eachMessage: async ({ topic, partition, message, heartbeat }) => {
    if (!message.value) {
      await heartbeat();
      return;
    }
    const data = JSON.parse(message.value.toString());
    console.log(`KafkaConsumer Data Received`, { data });
    await publisher.publish(
      "location-updates:broadcast",
      JSON.stringify({
        id: data.id,
        latitude: data.latitude,
        longitude: data.longitude,
      }),
    );
    await heartbeat();
  },
});

await subscriber.subscribe(
  "location-updates:broadcast",
  "location-updates:disconnect",
);
subscriber.on("message", (channel, message) => {
  if (channel === "location-updates:broadcast") {
    const data = JSON.parse(message);
    io.emit("server:location:update", data);
  }
  if (channel === "location-updates:disconnect") {
    const data = JSON.parse(message);
    io.emit("server:client:disconnect", data);
  }
});

io.attach(server);

io.on("connection", (socket) => {
  console.log(`[Socket:${socket.id}]: Connected Success...`);

  socket.on("client:location:update", async (locationData) => {
    const { latitude, longitude } = locationData;
    console.log(`[Socket:${socket.id}]:client:location:update:`, locationData);

    await kafkaProducer.send({
      topic: "location-updates",
      messages: [
        {
          key: socket.id,
          value: JSON.stringify({ id: socket.id, latitude, longitude }),
        },
      ],
    });
  });

  socket.on("disconnect", () => {
    console.log(`[Socket:${socket.id}]: Disconnected`);
    publisher.publish(
      "location-updates:disconnect",
      JSON.stringify({ id: socket.id }),
    );
  });
});

app.use(express.static(path.resolve("./src/public")));

app.get("/health", (req, res) => {
  return res.json({ healthy: true });
});

server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
