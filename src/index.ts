import "dotenv/config";
import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";
import { kafkaClient } from "./lib/kafka-client.js";
import { publisher, redis, subscriber } from "./lib/redis.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth, sessionMiddleware } from "./lib/session.js";

const PORT = process.env.PORT ?? 8888;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set("trust proxy", 1);
app.use(sessionMiddleware);
app.use("/auth", authRouter);

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
    
    if (data.name && data.color) {
      await redis.hset(
        "users:metadata",
        data.id,
        JSON.stringify({ id: data.id, name: data.name, color: data.color })
      );
    }
    
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
io.use((socket, next) => {
  sessionMiddleware(socket.request as any, {} as any, () => {
    const user = (socket.request as any).session?.user;
    if (!user) {
      next(new Error("Authentication required"));
      return;
    }
    next();
  });
});

io.on("connection", async (socket) => {
  const user = (socket.request as any).session.user;
  console.log(`[Socket:${socket.id}]: Connected Success...`);

  const usersData = await redis.hgetall("users:metadata");
  const users = Object.values(usersData).map((data) => JSON.parse(data));
  socket.emit("server:user:list", { users });

  socket.on("client:location:update", async (locationData) => {
    const { latitude, longitude, name, color } = locationData;
    if (typeof latitude !== "number" || typeof longitude !== "number") return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    console.log(`[Socket:${socket.id}]:client:location:update:`, locationData);

    await kafkaProducer.send({
      topic: "location-updates",
      messages: [
        {
          key: user.id,
          value: JSON.stringify({
            id: user.id,
            latitude,
            longitude,
            name: name || user.name || user.email || "Anonymous",
            color: color || "#4a90d9",
          }),
        },
      ],
    });
  });

  socket.on("disconnect", async () => {
    console.log(`[Socket:${socket.id}]: Disconnected`);
    
    const userData = await redis.hget("users:metadata", user.id);
    const metadataUser = userData ? JSON.parse(userData) : null;
    
    await redis.hdel("users:metadata", user.id);
    
    publisher.publish(
      "location-updates:disconnect",
      JSON.stringify({ 
        id: user.id,
        name: metadataUser?.name || user.name || "Anonymous"
      }),
    );
  });
});

app.use(express.static(path.resolve("./src/public")));

app.get("/health", (req, res) => {
  return res.json({ healthy: true });
});

app.get("/api/protected-health", requireAuth, (req, res) => {
  res.json({ ok: true, userId: req.session.user?.id });
});

server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
